import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifySignature, sendText } from "@/lib/whatsapp";
import { shouldEscalate, guardrailHits, AI_DISCLOSURE_PREFIX } from "@/lib/assistant";
import { generateDrafts } from "@/lib/llm";
import { publish } from "@/lib/events";

// WhatsApp Cloud API webhook. Incoming client messages land here; the
// assistant policy decides between a disclosed auto-reply (routine + opted-in)
// and escalation to the human approve queue. Everything else waits for a human.

export async function GET(req: NextRequest) {
  // Meta's one-time verification handshake
  const params = req.nextUrl.searchParams;
  if (
    params.get("hub.mode") === "subscribe" &&
    params.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new NextResponse(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("verification failed", { status: 403 });
}

type WebhookValue = {
  contacts?: { wa_id: string; profile?: { name?: string } }[];
  messages?: { id: string; from: string; type: string; text?: { body: string } }[];
  statuses?: { id: string; status: string }[];
};

export async function POST(req: NextRequest) {
  const raw = await req.text(); // signature is over the RAW bytes
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return new NextResponse("invalid signature", { status: 401 });
  }

  const payload = JSON.parse(raw);
  await db.webhookEvent.create({ data: { payload } });

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value: WebhookValue = change.value ?? {};

      for (const msg of value.messages ?? []) {
        if (msg.type !== "text" || !msg.text) continue;
        await handleInbound(msg.from, msg.id, msg.text.body, value);
      }

      // Delivery/read receipts — these drive the tick states in the console
      for (const status of value.statuses ?? []) {
        await db.message.updateMany({
          where: { waMessageId: status.id },
          data: { status: status.status },
        });
      }
      if ((value.statuses ?? []).length > 0) publish({ type: "message" });
    }
  }

  return NextResponse.json({ ok: true });
}

async function handleInbound(
  waId: string,
  waMessageId: string,
  body: string,
  value: WebhookValue,
) {
  // Idempotency: Meta retries webhooks; the unique waMessageId makes replays a no-op
  if (await db.message.findUnique({ where: { waMessageId } })) return;

  const profileName = value.contacts?.find((c) => c.wa_id === waId)?.profile?.name;
  const now = new Date();

  const client = await db.client.upsert({
    where: { waId },
    create: { waId, displayName: profileName, lastInboundAt: now },
    update: { lastInboundAt: now, displayName: profileName ?? undefined },
  });

  let conversation = await db.conversation.findFirst({
    where: { clientId: client.id, status: { not: "closed" } },
  });
  conversation ??= await db.conversation.create({
    data: { clientId: client.id },
  });

  await db.message.create({
    data: {
      conversationId: conversation.id,
      waMessageId,
      direction: "inbound",
      body,
    },
  });

  // --- assistant policy -----------------------------------------------------
  const routine = !shouldEscalate(body);

  if (client.assistantMode && routine) {
    try {
      const history = await db.message.findMany({
        where: { conversationId: conversation.id },
        orderBy: { sentAt: "asc" },
        take: 12,
      });
      const { variants } = await generateDrafts(client, history, 1);
      const reply = variants[0];

      // Guardrails apply to the assistant too — a flagged draft escalates
      if (!reply || guardrailHits(reply).length > 0) throw new Error("guardrail");

      const outId = await sendText(waId, AI_DISCLOSURE_PREFIX + reply);
      await db.message.create({
        data: {
          conversationId: conversation.id,
          waMessageId: outId,
          direction: "outbound",
          body: AI_DISCLOSURE_PREFIX + reply,
          source: "assistant",
          aiGenerated: true,
          status: "sent",
        },
      });
      await db.conversation.update({
        where: { id: conversation.id },
        data: { status: "open", lastMessageAt: new Date() },
      });
      await db.auditLog.create({
        data: {
          action: "assistant_replied",
          entity: "conversation",
          entityId: conversation.id,
          meta: { disclosed: true },
        },
      });
      publish({ type: "message", conversationId: conversation.id });
      return;
    } catch {
      // Any assistant failure falls through to human escalation — never retry sends
    }
  }

  await db.conversation.update({
    where: { id: conversation.id },
    data: { status: "needs_reply", lastMessageAt: now },
  });
  publish({ type: "message", conversationId: conversation.id });
}
