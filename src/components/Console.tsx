"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signOut } from "next-auth/react";
import type {
  ConversationDetail,
  ConversationSummary,
  TemplateDTO,
} from "@/lib/types";
import ClientList from "./ClientList";
import ChatView from "./ChatView";
import SidePanel from "./SidePanel";
import QueueView from "./QueueView";

// The three-pane console, ported from the Draftroom prototype and wired to the
// real API. Live updates arrive over SSE (/api/events); a slow 60s poll runs
// underneath as a safety net for serverless deployments where the in-process
// event bus isn't shared.

export type ConsoleActions = {
  generateDrafts: (conversationId: string) => Promise<void>;
  send: (draftId: string, finalText: string, templateName?: string) => Promise<boolean>;
  reject: (draftId: string) => Promise<void>;
  saveSettings: (clientId: string, patch: Record<string, unknown>) => Promise<void>;
  openChat: (conversationId: string) => void;
};

export default function Console({
  operatorName,
  operatorRole,
}: {
  operatorName?: string;
  operatorRole?: string;
}) {
  const [view, setView] = useState<"chats" | "queue">("chats");
  const [convos, setConvos] = useState<ConversationSummary[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [templates, setTemplates] = useState<TemplateDTO[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const selIdRef = useRef<string | null>(null);
  selIdRef.current = selId;

  const notify = (m: string) => {
    setToast(m);
    setTimeout(() => setToast(null), 3200);
  };

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations");
      if (res.ok) setConvos((await res.json()).conversations);
    } catch {
      /* transient — next poll retries */
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/conversations/${id}`);
      if (res.ok) setDetail((await res.json()).conversation);
    } catch {
      /* transient */
    }
  }, []);

  useEffect(() => {
    refresh();
    fetch("/api/templates")
      .then((r) => r.json())
      .then((d) => setTemplates(d.templates ?? []))
      .catch(() => {});
  }, [refresh]);

  // SSE live updates — any server-side mutation pushes an event; we re-fetch.
  // EventSource reconnects automatically after drops.
  useEffect(() => {
    const es = new EventSource("/api/events");
    es.onopen = () => setLive(true);
    es.onerror = () => setLive(false);
    es.onmessage = () => {
      refresh();
      const id = selIdRef.current;
      if (id) loadDetail(id);
    };
    return () => es.close();
  }, [refresh, loadDetail]);

  // Fallback poll (serverless / bus not shared): slow enough to be cheap.
  useEffect(() => {
    const t = setInterval(() => {
      refresh();
      const id = selIdRef.current;
      if (id) loadDetail(id);
    }, 60_000);
    return () => clearInterval(t);
  }, [refresh, loadDetail]);

  useEffect(() => {
    if (selId) loadDetail(selId);
  }, [selId, loadDetail]);

  useEffect(() => {
    if (!selId && convos.length) setSelId(convos[0].id);
  }, [convos, selId]);

  const actions: ConsoleActions = {
    generateDrafts: async (conversationId) => {
      setBusy(true);
      try {
        const res = await fetch("/api/drafts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId }),
        });
        if (!res.ok) {
          notify("Draft generation failed — check server logs / API keys");
          return;
        }
        notify("Drafts generated");
        await loadDetail(conversationId);
        await refresh();
      } finally {
        setBusy(false);
      }
    },

    send: async (draftId, finalText, templateName) => {
      setBusy(true);
      try {
        const res = await fetch("/api/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ draftId, finalText, templateName }),
        });
        const data = await res.json().catch(() => ({}) as Record<string, unknown>);
        if (!res.ok) {
          notify(String(data.error ?? "Send failed"));
          return false;
        }
        notify(`Sent via Cloud API · ${data.editPct}% edited by you`);
        if (selId) await loadDetail(selId);
        await refresh();
        return true;
      } finally {
        setBusy(false);
      }
    },

    reject: async (draftId) => {
      await fetch(`/api/drafts/${draftId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "rejected" }),
      });
      notify("Draft rejected");
      if (selId) await loadDetail(selId);
      await refresh();
    },

    saveSettings: async (clientId, patch) => {
      const res = await fetch(`/api/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        notify("Settings saved");
        if (selId) await loadDetail(selId);
        await refresh();
      } else {
        notify("Settings save failed");
      }
    },

    openChat: (conversationId) => {
      setSelId(conversationId);
      setView("chats");
    },
  };

  const queue = convos.filter((c) => c.status === "needs_reply");

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      {/* top bar */}
      <header className="flex flex-none items-center gap-4 bg-emerald-900 px-4 py-2.5 text-white dark:bg-emerald-950">
        <span className="text-[15px] font-semibold tracking-tight">Draftroom</span>
        <span className="rounded-full border border-white/30 px-2.5 py-0.5 font-mono text-[10px] tracking-wide text-white/80">
          whatsapp business · cloud api
        </span>
        <nav className="ml-2 flex gap-1">
          <button
            onClick={() => setView("chats")}
            className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${view === "chats" ? "bg-white/25" : "text-white/70 hover:bg-white/10"}`}
          >
            Chats
          </button>
          <button
            onClick={() => setView("queue")}
            className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[13px] font-semibold ${view === "queue" ? "bg-white/25" : "text-white/70 hover:bg-white/10"}`}
          >
            Approve queue
            <span className="rounded-full bg-emerald-300 px-2 py-px text-[10.5px] font-bold text-emerald-950">
              {queue.length}
            </span>
          </button>
        </nav>
        <span className="ml-auto flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-[11.5px] font-semibold">
          <span
            className={`h-1.5 w-1.5 rounded-full ${live ? "bg-emerald-300" : "bg-amber-400"}`}
          />
          {live ? "Live" : "Reconnecting…"}
        </span>
        {operatorName && (
          <span className="text-[12px] text-white/80">{operatorName}</span>
        )}
        {operatorRole === "admin" && (
          <a
            href="/admin"
            className="rounded-full border border-white/30 px-3 py-1 text-[11.5px] font-semibold text-white/80 hover:bg-white/10"
          >
            Admin
          </a>
        )}
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="rounded-full border border-white/30 px-3 py-1 text-[11.5px] font-semibold text-white/80 hover:bg-white/10"
        >
          Sign out
        </button>
      </header>

      {/* workspace */}
      {view === "chats" ? (
        <div className="grid min-h-0 flex-1 grid-cols-[300px_minmax(320px,1fr)_400px]">
          <ClientList convos={convos} selId={selId} onSelect={actions.openChat} />
          <ChatView detail={detail} />
          <SidePanel detail={detail} busy={busy} templates={templates} actions={actions} />
        </div>
      ) : (
        <QueueView queue={queue} busy={busy} actions={actions} />
      )}

      {/* human-in-the-loop footer */}
      <footer className="flex-none border-t border-neutral-200 bg-neutral-100 px-4 py-1.5 text-[11px] text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-400">
        <b className="text-emerald-700 dark:text-emerald-400">One human decision per message.</b>{" "}
        Sends fire only on Approve, inside WhatsApp&apos;s rules (24h window / approved
        templates). Assistant replies are always disclosed as AI.
      </footer>

      {toast && (
        <div className="fixed bottom-10 left-1/2 z-50 -translate-x-1/2 rounded-lg bg-neutral-900 px-4 py-2 text-[13px] font-medium text-white shadow-lg dark:bg-white dark:text-neutral-900">
          {toast}
        </div>
      )}
    </div>
  );
}
