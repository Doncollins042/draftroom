import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// Approved WhatsApp templates — the only sendable content outside the 24h window.

export async function GET() {
  const templates = await db.template.findMany({
    where: { approved: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ templates });
}
