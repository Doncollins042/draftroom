"use client";

import { useState } from "react";
import type { ConversationSummary } from "@/lib/types";
import type { ConsoleActions } from "./Console";
import { Chip } from "./ClientList";
import { guardrailHits } from "@/lib/assistant";

// The rapid approve queue: every escalated conversation as one card with its
// auto-generated draft, editable inline. One click on Send ✓ per message —
// human throughput without giving up human judgment.

export default function QueueView({
  queue,
  busy,
  actions,
}: {
  queue: ConversationSummary[];
  busy: boolean;
  actions: ConsoleActions;
}) {
  const [edits, setEdits] = useState<Record<string, string>>({});

  if (queue.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
        <p className="text-lg font-semibold">Queue clear ✓</p>
        <p className="text-[13px] text-neutral-500">
          Every client is answered. Assistant mode keeps covering the routine ones.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto flex max-w-2xl flex-col gap-3 p-5">
        {queue.map((c) => {
          const name = c.client.displayName ?? c.client.waId;
          const inbound =
            c.lastMessage?.direction === "inbound" ? c.lastMessage.body : null;
          const draft = c.pendingDraft;
          const text = edits[c.id] ?? draft?.text ?? "";
          const hits = guardrailHits(text);

          return (
            <div
              key={c.id}
              className="rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold">{name}</span>
                {c.window.open ? (
                  <Chip tone="teal">
                    window {Math.round(c.window.hoursLeft)}h left
                  </Chip>
                ) : (
                  <Chip tone="red">window closed</Chip>
                )}
                {c.client.assistantMode && <Chip tone="amber">escalated by assistant</Chip>}
              </div>

              {inbound && (
                <p className="mb-3 rounded-r-lg border-l-2 border-neutral-300 bg-neutral-50 px-3 py-2 text-[13px] dark:border-neutral-600 dark:bg-neutral-800">
                  {inbound}
                </p>
              )}

              {!c.window.open ? (
                <div className="flex items-center gap-3">
                  <p className="flex-1 text-[12.5px] text-amber-700 dark:text-amber-300">
                    24h window closed — open the chat to send an approved template.
                  </p>
                  <OpenBtn onClick={() => actions.openChat(c.id)} />
                </div>
              ) : draft ? (
                <>
                  <textarea
                    value={text}
                    onChange={(e) =>
                      setEdits({ ...edits, [c.id]: e.target.value })
                    }
                    rows={3}
                    className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-[13px] leading-relaxed outline-none focus:ring-2 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800"
                  />
                  {hits.length > 0 && (
                    <p className="mt-1 text-[12px] font-medium text-red-600 dark:text-red-400">
                      ⚑ Guardrail: remove “{hits[0]}” before sending.
                    </p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      onClick={() => actions.send(draft.id, text.trim())}
                      disabled={busy || !text.trim() || hits.length > 0}
                      className="rounded-lg bg-emerald-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
                    >
                      Send ✓
                    </button>
                    <OpenBtn onClick={() => actions.openChat(c.id)} />
                    <span className="ml-auto font-mono text-[10.5px] text-neutral-400">
                      auto-drafted · {c.client.emotion}
                    </span>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => actions.generateDrafts(c.id)}
                    disabled={busy}
                    className="rounded-lg bg-emerald-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
                  >
                    {busy ? "Generating…" : "Generate draft"}
                  </button>
                  <OpenBtn onClick={() => actions.openChat(c.id)} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function OpenBtn({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg border border-neutral-300 px-4 py-2 text-[13px] font-semibold hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
    >
      Open chat
    </button>
  );
}
