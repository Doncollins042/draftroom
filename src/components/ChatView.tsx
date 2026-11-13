"use client";

import { useEffect, useRef } from "react";
import type { ConversationDetail, MessageDTO } from "@/lib/types";
import { Chip } from "./ClientList";

// WhatsApp-style thread view: wallpaper, bubbles, day breaks, tick states,
// and the "✦ AI assistant" disclosure label on automated replies.

function Ticks({ status }: { status: string | null }) {
  if (status === "read")
    return <span className="text-sky-500">✓✓</span>;
  if (status === "delivered")
    return <span className="text-neutral-400">✓✓</span>;
  if (status === "failed")
    return <span className="font-semibold text-red-500">!</span>;
  return <span className="text-neutral-400">✓</span>;
}

function dayOf(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  });
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ChatView({
  detail,
}: {
  detail: ConversationDetail | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [detail?.messages.length, detail?.id]);

  if (!detail) {
    return (
      <section className="flex items-center justify-center bg-[#EFE7DD] text-sm text-neutral-500 dark:bg-neutral-950">
        Select a client to open the chat.
      </section>
    );
  }

  const name = detail.client.displayName ?? detail.client.waId;
  let lastDay = "";

  return (
    <section className="flex min-h-0 flex-col bg-[#EFE7DD] dark:bg-neutral-950">
      {/* chat header */}
      <div className="flex flex-none items-center gap-3 border-b border-neutral-200 bg-white px-4 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="min-w-0">
          <p className="truncate text-[14.5px] font-semibold">{name}</p>
          <p className="text-[11.5px] text-neutral-400">
            {detail.exemplarCount > 0
              ? `style memory: ${detail.exemplarCount} reply pairs`
              : "no style memory yet — run the ingest script"}
          </p>
        </div>
        <div className="ml-auto flex gap-1.5">
          {detail.window.open ? (
            <Chip tone="teal">window {Math.round(detail.window.hoursLeft)}h left</Chip>
          ) : (
            <Chip tone="red">window closed · templates only</Chip>
          )}
          {detail.client.assistantMode && <Chip tone="teal">✦ assistant</Chip>}
        </div>
      </div>

      {/* messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-[8%] py-4">
        {detail.messages.map((m: MessageDTO) => {
          const day = dayOf(m.sentAt);
          const showBreak = day !== lastDay;
          lastDay = day;
          const out = m.direction === "outbound";
          return (
            <div key={m.id}>
              {showBreak && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-md bg-white/90 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wide text-neutral-500 shadow-sm dark:bg-neutral-800 dark:text-neutral-400">
                    {m.source === "import" ? `${day} · imported` : day}
                  </span>
                </div>
              )}
              <div className={`mb-1 flex ${out ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[70%] rounded-lg px-2.5 py-1.5 text-[13.5px] leading-snug shadow-sm ${
                    out
                      ? "rounded-tr-sm bg-[#D9FDD3] dark:bg-emerald-900"
                      : "rounded-tl-sm bg-white dark:bg-neutral-800"
                  }`}
                >
                  {m.aiGenerated && (
                    <p className="mb-0.5 text-[10px] font-bold tracking-wide text-emerald-700 dark:text-emerald-400">
                      ✦ AI assistant
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className="mt-0.5 flex items-center justify-end gap-1 font-mono text-[10px] text-neutral-400">
                    {timeOf(m.sentAt)}
                    {out && <Ticks status={m.status} />}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* no free-text composer by design: every outbound goes through a draft */}
      <div className="flex-none border-t border-neutral-200 bg-white px-4 py-2 text-center text-[11.5px] text-neutral-400 dark:border-neutral-800 dark:bg-neutral-900">
        Replies go through the draft panel — generate, edit, approve.
      </div>
    </section>
  );
}
