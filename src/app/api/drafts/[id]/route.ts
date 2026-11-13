import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";

// Reject a pending draft. (Approve/send lives in /api/send.)

const Patch = z.object({ status: z.literal("rejected") });

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = Patch.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const draft = await db.draft.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (draft.status !== "pending") {
    return NextResponse.json({ error: "already reviewed" }, { status: 409 });
  }

  await db.draft.update({
    where: { id },
    data: { status: "rejected", reviewedAt: new Date() },
  });
  await db.auditLog.create({
    data: { action: "draft_rejected", entity: "draft", entityId: id },
  });

  return NextResponse.json({ ok: true });
}
