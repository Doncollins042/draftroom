import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import SyncTemplatesButton from "@/components/SyncTemplatesButton";

export const dynamic = "force-dynamic";

// Admin-only overview: quality metrics, operators, templates, audit trail.
// Server component — the role check happens before any data is queried.

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.user.role !== "admin") redirect("/");

  const [
    reviewed,
    rejected,
    avgEdit,
    operatorSends,
    assistantSends,
    operators,
    templates,
    audit,
  ] = await Promise.all([
    db.draft.count({ where: { status: { in: ["approved", "edited", "rejected"] } } }),
    db.draft.count({ where: { status: "rejected" } }),
    db.draft.aggregate({
      _avg: { editDistance: true },
      where: { editDistance: { not: null } },
    }),
    db.message.count({ where: { direction: "outbound", aiGenerated: false, sentById: { not: null } } }),
    db.message.count({ where: { aiGenerated: true } }),
    db.operator.findMany({ orderBy: { createdAt: "asc" } }),
    db.template.findMany({ orderBy: [{ approved: "desc" }, { name: "asc" }] }),
    db.auditLog.findMany({ orderBy: { at: "desc" }, take: 50 }),
  ]);

  const rejectionRate = reviewed > 0 ? Math.round((100 * rejected) / reviewed) : 0;
  const stats: [string, string, string][] = [
    ["Drafts reviewed", String(reviewed), "approved + edited + rejected"],
    ["Avg edit", `${Math.round(avgEdit._avg.editDistance ?? 0)}%`, "generated vs sent — lower is better"],
    ["Rejection rate", `${rejectionRate}%`, "drafts thrown away"],
    ["Operator sends", String(operatorSends), "human-approved messages"],
    ["Assistant sends", String(assistantSends), "disclosed AI replies"],
  ];

  const card =
    "rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900";
  const h2 = "mb-3 text-[12px] font-semibold uppercase tracking-wide text-neutral-500";
  const th = "px-3 py-2 text-left text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500";
  const td = "px-3 py-2 text-[13px]";

  return (
    <main className="mx-auto max-w-4xl p-6">
      <header className="mb-6 flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Admin</h1>
        <Link
          href="/"
          className="ml-auto rounded-lg border border-neutral-300 px-3.5 py-1.5 text-[13px] font-semibold hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          ← Back to console
        </Link>
      </header>

      {/* quality metrics */}
      <section className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {stats.map(([k, v, hint]) => (
          <div key={k} className={card}>
            <p className="text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500">{k}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">{v}</p>
            <p className="mt-1 text-[10.5px] leading-snug text-neutral-400">{hint}</p>
          </div>
        ))}
      </section>

      {/* templates */}
      <section className={`${card} mb-5`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className={h2.replace("mb-3", "")}>WhatsApp templates</h2>
          <SyncTemplatesButton />
        </div>
        {templates.length === 0 ? (
          <p className="text-[13px] text-neutral-500">
            None yet — create templates in Meta Business Manager, then sync.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-neutral-200 dark:border-neutral-800">
                  <th className={th}>Name</th>
                  <th className={th}>Language</th>
                  <th className={th}>Body</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {templates.map((t) => (
                  <tr key={t.id} className="border-b border-neutral-100 dark:border-neutral-800">
                    <td className={`${td} font-mono text-[12px]`}>{t.name}</td>
                    <td className={td}>{t.language}</td>
                    <td className={`${td} max-w-md truncate text-neutral-500`}>{t.body}</td>
                    <td className={td}>
                      {t.approved ? (
                        <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          approved
                        </span>
                      ) : (
                        <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-[11px] font-semibold text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400">
                          inactive
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* operators */}
      <section className={`${card} mb-5`}>
        <h2 className={h2}>Operators</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <th className={th}>Name</th>
                <th className={th}>Email</th>
                <th className={th}>Role</th>
                <th className={th}>Created</th>
              </tr>
            </thead>
            <tbody>
              {operators.map((o) => (
                <tr key={o.id} className="border-b border-neutral-100 dark:border-neutral-800">
                  <td className={td}>{o.name}</td>
                  <td className={`${td} text-neutral-500`}>{o.email}</td>
                  <td className={td}>{o.role}</td>
                  <td className={`${td} font-mono text-[11.5px] text-neutral-400`}>
                    {o.createdAt.toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] text-neutral-400">
          Add or reset operators from the server:{" "}
          <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
            npm run operator -- email &quot;Name&quot; password [role]
          </code>
        </p>
      </section>

      {/* audit log */}
      <section className={card}>
        <h2 className={h2}>Audit log — last 50</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <th className={th}>When</th>
                <th className={th}>Action</th>
                <th className={th}>Entity</th>
                <th className={th}>Detail</th>
              </tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={String(a.id)} className="border-b border-neutral-100 dark:border-neutral-800">
                  <td className={`${td} whitespace-nowrap font-mono text-[11px] text-neutral-400`}>
                    {a.at.toLocaleString()}
                  </td>
                  <td className={`${td} font-medium`}>{a.action}</td>
                  <td className={`${td} text-neutral-500`}>{a.entity}</td>
                  <td className={`${td} max-w-xs truncate font-mono text-[11px] text-neutral-400`}>
                    {a.meta ? JSON.stringify(a.meta) : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
