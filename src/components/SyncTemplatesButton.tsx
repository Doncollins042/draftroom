"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SyncTemplatesButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function sync() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/templates/sync", { method: "POST" });
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      setMsg(
        res.ok
          ? `Synced: ${data.approved} approved, ${data.deactivated} inactive`
          : String(data.error ?? "Sync failed"),
      );
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-3">
      <button
        onClick={sync}
        disabled={busy}
        className="rounded-lg bg-emerald-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
      >
        {busy ? "Syncing…" : "Sync from Meta"}
      </button>
      {msg && <span className="text-[12px] text-neutral-500">{msg}</span>}
    </span>
  );
}
