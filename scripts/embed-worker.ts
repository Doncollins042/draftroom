/**
 * Background embedder — closes the style-memory feedback loop.
 *
 * /api/send stores every approved reply as an ExemplarPair with
 * source="live_approved" but leaves vectorId null (embedding an external API
 * call inside the send path would slow down and couple the operator's click).
 * This worker sweeps un-embedded pairs — live feedback plus any ingest
 * leftovers — embeds the inbound side with Voyage, and upserts to the
 * client's Pinecone namespace.
 *
 * Run alongside the app:   npm run worker
 * Tune the cadence with:   EMBED_INTERVAL_MS (default 30000)
 *
 * Failure model: any error leaves the rows untouched (vectorId stays null),
 * so they are simply retried on the next tick. Safe to restart at any time;
 * safe to run while the ingest script is running.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { upsertExemplars } from "../src/lib/rag";

const db = new PrismaClient();
const INTERVAL_MS = Number(process.env.EMBED_INTERVAL_MS ?? 30_000);
const BATCH = 64;

let running = true;

async function tick(): Promise<number> {
  const pending = await db.exemplarPair.findMany({
    where: { vectorId: null, clientId: { not: null } },
    orderBy: { qualityScore: "desc" }, // best signal first when catching up
    take: BATCH,
  });
  if (pending.length === 0) return 0;

  // Pinecone namespace is per client — group before upserting
  const byClient = new Map<string, typeof pending>();
  for (const pair of pending) {
    const list = byClient.get(pair.clientId as string) ?? [];
    list.push(pair);
    byClient.set(pair.clientId as string, list);
  }

  let embedded = 0;
  for (const [clientId, pairs] of byClient) {
    try {
      await upsertExemplars(
        clientId,
        pairs.map((p) => ({
          id: p.id,
          inboundText: p.inboundText,
          replyText: p.replyText,
          context: p.contextWindow ?? undefined,
        })),
      );
      await db.$transaction(
        pairs.map((p) =>
          db.exemplarPair.update({
            where: { id: p.id },
            data: { vectorId: `ex_${p.id}`, embeddedAt: new Date() },
          }),
        ),
      );
      embedded += pairs.length;
    } catch (e) {
      console.error(
        `[embed-worker] client ${clientId}: ${(e as Error).message} — will retry next tick`,
      );
    }
  }
  return embedded;
}

async function main() {
  console.log(
    `[embed-worker] started — sweeping every ${Math.round(INTERVAL_MS / 1000)}s (batch ${BATCH})`,
  );
  const stop = () => {
    running = false;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  while (running) {
    try {
      const n = await tick();
      if (n > 0) console.log(`[embed-worker] embedded ${n} exemplar pairs`);
    } catch (e) {
      console.error(`[embed-worker] tick failed: ${(e as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }

  await db.$disconnect();
  console.log("[embed-worker] stopped");
}

main();
