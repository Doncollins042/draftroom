"use client";

import { useState } from "react";
import type { ConversationSummary } from "@/lib/types";

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function timeLabel(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  const mins = (Date.now() - d.getTime()) / 60000;
  if (mins < 1) return "now";
  if (mins < 60) return `${Math.round(mins)}m`;
  if (mins < 60 * 24) return `${Math.round(mins / 60)}h`;
  return `${Math.round(mins / 1440)}d`;
}

export default function ClientList({
  convos,
  selId,
  onSelect,
}: {
  convos: ConversationSummary[];
  selId: string | null;
  onSelect: (id: string) => void;
}) {
  const [filter, setFilter] = useState("");

  const shown = convos.filter((c) =>
    (c.client.displayName ?? c.client.waId)
      .toLowerCase()
      .includes(filter.toLowerCase()),
  );

  return (
    <aside className="flex min-h-0 flex-col border-r border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex-none border-b border-neutral-200 p-2.5 dark:border-neutral-800">
        <input
          type="search"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search clients…"
          className="w-full rounded-lg bg-neutral-100 px-3 py-2 text-[13px] outline-none focus:ring-2 focus:ring-emerald-600 dark:bg-neutral-800"
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {shown.length === 0 && (
          <p className="p-5 text-[13px] text-neutral-500">
            No conversations yet — they appear when clients message your business
            number, or after running the ingest script.
          </p>
        )}
        {shown.map((c) => {
          const name = c.client.displayName ?? c.client.waId;
          const last = c.lastMessage;
          return (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={`flex w-full items-center gap-3 border-b border-neutral-100 px-3.5 py-2.5 text-left dark:border-neutral-800 ${
                c.id === selId
                  ? "bg-emerald-50 dark:bg-emerald-950/40"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-800/60"
              }`}
            >
              <span className="flex h-10 w-10 flex-none items-center justify-center rounded-full bg-neutral-200 text-[13px] font-semibold text-neutral-600 dark:bg-neutral-700 dark:text-neutral-300">
                {initials(name)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-[14px] font-semibold">{name}</span>
                  <span className="ml-auto font-mono text-[10px] text-neutral-400">
                    {timeLabel(c.lastMessageAt)}
                  </span>
                </span>
                <span className="block truncate text-[12.5px] text-neutral-500">
                  {last
                    ? `${last.direction === "outbound" ? "✓✓ " : ""}${last.aiGenerated ? "✦ " : ""}${last.body}`
                    : "—"}
                </span>
                <span className="mt-1 flex gap-1.5">
                  {c.status === "needs_reply" && (
                    <Chip tone="amber">needs reply</Chip>
                  )}
                  {c.pendingDraft && <Chip tone="teal">drafts ready</Chip>}
                  {c.client.assistantMode && <Chip tone="teal">✦ assistant</Chip>}
                  {!c.window.open && <Chip tone="red">window closed</Chip>}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

export function Chip({
  tone,
  children,
}: {
  tone: "amber" | "teal" | "red" | "gray";
  children: React.ReactNode;
}) {
  const tones = {
    amber:
      "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
    teal: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
    red: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
    gray: "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-px text-[10px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
}
