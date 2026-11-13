import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { generateDrafts } from "@/lib/llm";
import { publish } from "@/lib/events";

// Generate draft replies for a conversation. Called by the approve queue the
// moment an escalated message arrives, and by the chat view on demand.
// Drafts are suggestions only — nothing here sends.

const Body = z.object({
  conversationId: z.string().uuid(),
  variants: z.number().int().min(1).max(3).default(3),
});

export async function POST(req: NextRequest) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const { conversationId, variants } = parsed.data;

  const conversation = await db.conversation.findUnique({
    where: { id: conversationId },
    include: {
      client: true,
      messages: { orderBy: { sentAt: "asc" }, take: 24 },
    },
  });
  if (!conversation) {
    return NextResponse.json({ error: "conversation not found" }, { status: 404 });
  }

  const result = await generateDrafts(
    conversation.client,
    conversation.messages,
    variants,
  );

  const drafts = await db.$transaction(
    result.variants.map((text, i) =>
      db.draft.create({
        data: {
          conversationId,
          variant: i + 1,
          model: result.model,
          promptVersion: result.promptVersion,
          retrievalRefs: result.retrievalRefs,
          generatedText: text,
        },
      }),
    ),
  );

  await db.auditLog.create({
    data: {
      action: "drafts_generated",
      entity: "conversation",
      entityId: conversationId,
      meta: { count: drafts.length, model: result.model },
    },
  });

  publish({ type: "draft", conversationId });

  return NextResponse.json({
    drafts: drafts.map((d) => ({
      id: d.id,
      variant: d.variant,
      text: d.generatedText,
    })),
    retrievalRefs: result.retrievalRefs,
  });
}
