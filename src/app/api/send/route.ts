import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendText, sendTemplate } from "@/lib/whatsapp";
import { windowState } from "@/lib/window";
import { guardrailHits } from "@/lib/assistant";
import { editPct } from "@/lib/text";
import { publish } from "@/lib/events";

// The ONLY human send path. One operator Approve click = one send. Enforces
// guardrails and the 24h service window server-side, records edit distance,
// and feeds the approved reply back as a live_approved style exemplar.

const Body = z.object({
  draftId: z.string().uuid(),
  finalText: z.string().min(1).max(4096),
  // Set instead of finalText-send when the window is closed:
  templateName: z.string().optional(),
});

export async function POST(req: NextRequest) {
  // The operator comes from the session, never the request body — every send
  // is attributable to the signed-in human who clicked Approve.
  const session = await auth();
  const operatorId = session?.user?.id;
  if (!operatorId) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { draftId, finalText, templateName } = parsed.data;

  const draft = await db.draft.findUnique({
    where: { id: draftId },
    include: { conversation: { include: { client: true } } },
  });
  if (!draft) {
    return NextResponse.json({ error: "draft not found" }, { status: 404 });
  }
  if (draft.status !== "pending") {
    return NextResponse.json({ error: "draft already reviewed" }, { status: 409 });
  }

  const hits = guardrailHits(finalText);
  if (hits.length > 0) {
    return NextResponse.json(
      { error: `guardrail: contains never-say term "${hits[0]}"` },
      { status: 422 },
    );
  }

  const client = draft.conversation.client;
  const win = windowState(client.lastInboundAt);

  let waMessageId: string;
  let sentBody: string;

  if (win.open) {
    waMessageId = await sendText(client.waId, finalText);
    sentBody = finalText;
  } else if (templateName) {
    const template = await db.template.findUnique({ where: { name: templateName } });
    if (!template?.approved) {
      return NextResponse.json(
        { error: "template not found or not approved in Meta Business Manager" },
        { status: 422 },
      );
    }
    waMessageId = await sendTemplate(client.waId, template.name, template.language);
    sentBody = template.body;
  } else {
    return NextResponse.json(
      {
        error:
          "24h service window closed — free-form sends are not allowed. Retry with templateName.",
        hoursLeft: 0,
      },
      { status: 409 },
    );
  }

  const distance = editPct(draft.generatedText, finalText);

  await db.$transaction([
    db.message.create({
      data: {
        conversationId: draft.conversationId,
        waMessageId,
        direction: "outbound",
        body: sentBody,
        sentById: operatorId,
        status: "sent",
      },
    }),
    db.draft.update({
      where: { id: draft.id },
      data: {
        status: distance > 0 ? "edited" : "approved",
        finalText: sentBody,
        reviewedById: operatorId,
        reviewedAt: new Date(),
        editDistance: distance,
      },
    }),
    db.conversation.update({
      where: { id: draft.conversationId },
      data: { status: "open", lastMessageAt: new Date() },
    }),
    db.auditLog.create({
      data: {
        operatorId,
        action: "draft_sent",
        entity: "draft",
        entityId: draft.id,
        meta: { editPct: distance, viaTemplate: !win.open },
      },
    }),
  ]);

  // Feedback loop: the approved reply becomes a new high-quality exemplar.
  // (Embedding happens in the ingest worker; here we just persist the pair.)
  if (win.open) {
    const lastInbound = await db.message.findFirst({
      where: { conversationId: draft.conversationId, direction: "inbound" },
      orderBy: { sentAt: "desc" },
    });
    if (lastInbound) {
      await db.exemplarPair.create({
        data: {
          clientId: client.id,
          inboundText: lastInbound.body,
          replyText: sentBody,
          qualityScore: 0.9,
          source: "live_approved",
        },
      });
    }
  }

  publish({ type: "send", conversationId: draft.conversationId });
  return NextResponse.json({ ok: true, waMessageId, editPct: distance });
}
