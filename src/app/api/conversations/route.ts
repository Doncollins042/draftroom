import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { windowState } from "@/lib/window";

// Conversation list for the client rail and the approve queue.

export async function GET() {
  const conversations = await db.conversation.findMany({
    include: {
      client: true,
      messages: { orderBy: { sentAt: "desc" }, take: 1 },
      drafts: {
        where: { status: "pending" },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
    orderBy: { lastMessageAt: { sort: "desc", nulls: "last" } },
    take: 100,
  });

  return NextResponse.json({
    conversations: conversations.map((c) => {
      const last = c.messages[0];
      const draft = c.drafts[0];
      return {
        id: c.id,
        status: c.status,
        lastMessageAt: c.lastMessageAt,
        client: c.client,
        lastMessage: last
          ? {
              id: last.id,
              direction: last.direction,
              body: last.body,
              status: last.status,
              aiGenerated: last.aiGenerated,
              source: last.source,
              sentAt: last.sentAt,
            }
          : null,
        pendingDraft: draft ? { id: draft.id, text: draft.generatedText } : null,
        window: windowState(c.client.lastInboundAt),
      };
    }),
  });
}
