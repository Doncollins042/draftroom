import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { publish } from "@/lib/events";

// Per-client voice tuning — what the console's Client settings tab writes.

const Patch = z
  .object({
    displayName: z.string().max(120).nullable(),
    notes: z.string().max(4000).nullable(),
    tags: z.array(z.string().max(40)).max(12),
    assistantMode: z.boolean(),
    emotion: z.enum(["warm", "flirty", "playful", "professional", "reassuring"]),
    energy: z.number().int().min(0).max(100),
    emojiDensity: z.number().int().min(0).max(3),
    replyLength: z.enum(["short", "long"]),
    goal: z.enum(["rapport", "reengage", "upsell", "retention"]),
  })
  .partial();

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = Patch.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const client = await db.client.update({ where: { id }, data: parsed.data });

  await db.auditLog.create({
    data: {
      action: "client_settings_updated",
      entity: "client",
      entityId: id,
      meta: parsed.data,
    },
  });

  publish({ type: "settings" });
  return NextResponse.json({ client });
}
