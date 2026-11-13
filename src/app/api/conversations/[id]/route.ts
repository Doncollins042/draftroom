import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { windowState } from "@/lib/window";

// Full conversation detail: thread, client settings, pending drafts.

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  const conversation = await db.conversation.findUnique({
    where: { id },
    include: {
      client: true,
      messages: { orderBy: { sentAt: "asc" }, take: 200 },
      drafts: { where: { status: "pending" }, orderBy: { variant: "asc" } },
    },
  });
  if (!conversation) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const [exemplarCount, pendingEmbeds] = await Promise.all([
    db.exemplarPair.count({
      where: { clientId: conversation.clientId, vectorId: { not: null } },
    }),
    db.exemplarPair.count({
      where: { clientId: conversation.clientId, vectorId: null },
    }),
  ]);

  return NextResponse.json({
    conversation: {
      id: conversation.id,
      status: conversation.status,
      client: conversation.client,
      window: windowState(conversation.client.lastInboundAt),
      messages: conversation.messages.map((m) => ({
        id: m.id,
        direction: m.direction,
        body: m.body,
        status: m.status,
        aiGenerated: m.aiGenerated,
        source: m.source,
        sentAt: m.sentAt,
      })),
      drafts: conversation.drafts.map((d) => ({
        id: d.id,
        variant: d.variant,
        text: d.generatedText,
        status: d.status,
        createdAt: d.createdAt,
      })),
      exemplarCount,
      pendingEmbeds,
    },
  });
}
