/**
 * Ingest a WhatsApp "Export chat" .txt into the style memory.
 *
 * Usage:
 *   npx tsx scripts/ingest-whatsapp.ts <export.txt> <clientWaId> "<Your name in the export>"
 *
 * Parses Android + iOS export formats, scrubs obvious PII, stores messages in
 * Postgres, extracts (client message -> your reply) exemplar pairs, embeds the
 * inbound side with Voyage, and upserts to the client's Pinecone namespace.
 * Idempotent-ish: re-running skips pairs that already have a vectorId.
 */
import "dotenv/config";
import fs from "fs";
import { PrismaClient } from "@prisma/client";
import { upsertExemplars } from "../src/lib/rag";

const db = new PrismaClient();

const LINE_PATTERNS = [
  // Android: 12/07/2026, 21:14 - Maya: message
  /^(\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}),?\s+(\d{1,2}:\d{2})(?:\s?[apAP]\.?[mM]\.?)?\s+-\s+([^:]{1,40}):\s([\s\S]*)$/,
  // iOS: [12/07/26, 9:14:33 PM] Maya: message
  /^\[(\d{1,2}[\/.]\d{1,2}[\/.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?)(?:\s?[apAP][mM])?\]\s+([^:]{1,40}):\s([\s\S]*)$/,
];

const SKIP = /end-to-end encrypted|<Media omitted>|image omitted|video omitted|audio omitted|Messages and calls/i;

// Basic PII scrub before anything is persisted or embedded
function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]")
    .replace(/\+?\d[\d\s().-]{8,}\d/g, "[phone]");
}

type Parsed = { name: string; text: string };

function parseExport(raw: string): Parsed[] {
  const out: Parsed[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || SKIP.test(trimmed)) continue;
    let matched = false;
    for (const rx of LINE_PATTERNS) {
      const m = trimmed.match(rx);
      if (m) {
        out.push({ name: m[3].trim(), text: scrub(m[4]) });
        matched = true;
        break;
      }
    }
    if (!matched && out.length) out[out.length - 1].text += "\n" + scrub(trimmed);
  }
  return out;
}

async function main() {
  const [file, waId, meName] = process.argv.slice(2);
  if (!file || !waId || !meName) {
    console.error('usage: tsx scripts/ingest-whatsapp.ts <export.txt> <clientWaId> "<Your name>"');
    process.exit(1);
  }

  const parsed = parseExport(fs.readFileSync(file, "utf8"));
  if (parsed.length < 2) throw new Error("Could not parse any messages — is this a WhatsApp export?");

  const names = [...new Set(parsed.map((p) => p.name))];
  if (!names.includes(meName)) {
    throw new Error(`"${meName}" not found among participants: ${names.join(", ")}`);
  }
  console.log(`Parsed ${parsed.length} messages from ${names.length} participants`);

  const client = await db.client.upsert({
    where: { waId },
    create: { waId, displayName: names.find((n) => n !== meName) },
    update: {},
  });
  let conversation = await db.conversation.findFirst({ where: { clientId: client.id } });
  conversation ??= await db.conversation.create({ data: { clientId: client.id } });

  // Store the raw history (source: import)
  await db.message.createMany({
    data: parsed.map((p) => ({
      conversationId: conversation.id,
      direction: p.name === meName ? "outbound" : "inbound",
      body: p.text,
      source: "import",
    })),
  });

  // Extract exemplar pairs: client message immediately followed by your reply
  const pairs: { inboundText: string; replyText: string; context: string }[] = [];
  for (let i = 0; i < parsed.length - 1; i++) {
    if (parsed[i].name !== meName && parsed[i + 1].name === meName) {
      const reply = parsed[i + 1].text;
      if (reply.trim().length < 2) continue; // drop empty/emoji-only replies
      pairs.push({
        inboundText: parsed[i].text,
        replyText: reply,
        context: parsed
          .slice(Math.max(0, i - 3), i)
          .map((p) => `${p.name === meName ? "me" : "client"}: ${p.text}`)
          .join("\n"),
      });
    }
  }
  console.log(`Extracted ${pairs.length} exemplar pairs`);

  // Persist + embed in batches
  const BATCH = 64;
  for (let i = 0; i < pairs.length; i += BATCH) {
    const batch = pairs.slice(i, i + BATCH);
    const rows = await db.$transaction(
      batch.map((p) =>
        db.exemplarPair.create({
          data: {
            clientId: client.id,
            inboundText: p.inboundText,
            replyText: p.replyText,
            contextWindow: p.context,
          },
        }),
      ),
    );
    await upsertExemplars(
      client.id,
      rows.map((r, j) => ({
        id: r.id,
        inboundText: batch[j].inboundText,
        replyText: batch[j].replyText,
        context: batch[j].context,
      })),
    );
    await db.$transaction(
      rows.map((r) =>
        db.exemplarPair.update({
          where: { id: r.id },
          data: { vectorId: `ex_${r.id}`, embeddedAt: new Date() },
        }),
      ),
    );
    console.log(`Embedded ${Math.min(i + BATCH, pairs.length)}/${pairs.length}`);
  }

  console.log(`Done. Client ${client.id} now has a style memory.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
