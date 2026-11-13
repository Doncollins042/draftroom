import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { fetchTemplates } from "@/lib/whatsapp";
import { publish } from "@/lib/events";

// Admin-only: pull message templates from Meta Business Manager and mirror
// them locally. Only APPROVED templates become sendable; anything that
// disappeared or lost approval on Meta's side is deactivated here, so the
// closed-window picker can never offer a template Meta would reject.

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (session.user.role !== "admin") {
    return NextResponse.json({ error: "admin only" }, { status: 403 });
  }

  let metaTemplates;
  try {
    metaTemplates = await fetchTemplates();
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }

  // Template.name is unique locally; Meta allows one name per language —
  // keep the first occurrence per name (add per-language rows if you need them).
  const seen = new Set<string>();
  const approved = metaTemplates.filter((t) => {
    if (t.status !== "APPROVED" || seen.has(t.name)) return false;
    seen.add(t.name);
    return true;
  });

  await db.$transaction([
    ...approved.map((t) =>
      db.template.upsert({
        where: { name: t.name },
        create: { name: t.name, language: t.language, body: t.body, approved: true },
        update: { language: t.language, body: t.body, approved: true },
      }),
    ),
    db.template.updateMany({
      where: { name: { notIn: approved.map((t) => t.name) } },
      data: { approved: false },
    }),
  ]);

  const deactivated = await db.template.count({ where: { approved: false } });

  await db.auditLog.create({
    data: {
      operatorId: session.user.id,
      action: "templates_synced",
      entity: "template",
      meta: { approved: approved.length, deactivated },
    },
  });
  publish({ type: "settings" });

  return NextResponse.json({ approved: approved.length, deactivated });
}
