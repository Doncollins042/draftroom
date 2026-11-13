"use client";

import { useEffect, useState } from "react";
import type { ConversationDetail, TemplateDTO } from "@/lib/types";
import type { ConsoleActions } from "./Console";
import { guardrailHits, NEVER_SAY } from "@/lib/assistant";

// Right panel: Drafts (review/edit/approve), Client settings (voice tuning +
// assistant mode), Train (style-memory status + ingest instructions).

type Tab = "drafts" | "settings" | "train";

export default function SidePanel({
  detail,
  busy,
  templates,
  actions,
}: {
  detail: ConversationDetail | null;
  busy: boolean;
  templates: TemplateDTO[];
  actions: ConsoleActions;
}) {
  const [tab, setTab] = useState<Tab>("drafts");

  return (
    <aside className="flex min-h-0 flex-col border-l border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-none border-b border-neutral-200 dark:border-neutral-800">
        {(
          [
            ["drafts", "Drafts"],
            ["settings", "Client settings"],
            ["train", "Train"],
          ] as [Tab, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 border-b-2 py-3 text-[12.5px] font-semibold ${
              tab === key
                ? "border-emerald-600 text-emerald-700 dark:text-emerald-400"
                : "border-transparent text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {!detail ? (
          <p className="text-[13px] text-neutral-500">Select a client first.</p>
        ) : tab === "drafts" ? (
          <DraftsTab detail={detail} busy={busy} templates={templates} actions={actions} />
        ) : tab === "settings" ? (
          <SettingsTab detail={detail} actions={actions} />
        ) : (
          <TrainTab detail={detail} />
        )}
      </div>
    </aside>
  );
}

/* ------------------------------ Drafts tab ------------------------------- */

function DraftsTab({
  detail,
  busy,
  templates,
  actions,
}: {
  detail: ConversationDetail;
  busy: boolean;
  templates: TemplateDTO[];
  actions: ConsoleActions;
}) {
  const [sel, setSel] = useState(0);
  const [text, setText] = useState("");
  const [templateName, setTemplateName] = useState("");
  const drafts = detail.drafts;
  const closed = !detail.window.open;

  // Re-seed the editor whenever the selected variant (or conversation) changes
  useEffect(() => {
    setSel(0);
  }, [detail.id, drafts.length]);
  useEffect(() => {
    setText(drafts[sel]?.text ?? "");
  }, [sel, drafts]);

  const hits = guardrailHits(text);

  if (drafts.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border-2 border-dashed border-neutral-300 p-6 text-center dark:border-neutral-700">
          <p className="mb-3 text-[13px] text-neutral-500">
            No pending drafts for this conversation.
          </p>
          <button
            onClick={() => actions.generateDrafts(detail.id)}
            disabled={busy}
            className="rounded-lg bg-emerald-700 px-4 py-2 text-[13px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
          >
            {busy ? "Generating…" : "Generate 3 draft replies"}
          </button>
          <p className="mt-3 font-mono text-[10.5px] text-neutral-400">
            {detail.client.emotion} · {detail.client.goal} ·{" "}
            {detail.exemplarCount > 0
              ? `${detail.exemplarCount} exemplars`
              : "no style memory"}
          </p>
        </div>
        {closed && <ClosedWindowNote templates={templates} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {drafts.map((d, i) => (
        <button
          key={d.id}
          onClick={() => setSel(i)}
          className={`rounded-xl border p-3 text-left text-[13px] leading-snug ${
            i === sel
              ? "border-emerald-600 bg-emerald-50 dark:bg-emerald-950/40"
              : "border-neutral-200 bg-neutral-50 hover:border-neutral-300 dark:border-neutral-700 dark:bg-neutral-800"
          }`}
        >
          <span className="mb-1 block font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-400">
            V{d.variant} · claude
          </span>
          {d.text}
        </button>
      ))}

      <label className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500">
        Edit before approving
      </label>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="w-full rounded-xl border border-neutral-300 bg-white p-3 text-[13px] leading-relaxed outline-none focus:ring-2 focus:ring-emerald-600 dark:border-neutral-700 dark:bg-neutral-800"
      />

      {hits.length > 0 && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-[12.5px] font-medium text-red-700 dark:bg-red-950 dark:text-red-300">
          ⚑ Guardrail: contains never-say term “{hits[0]}”. Edit it out to send.
        </p>
      )}

      {closed && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          24h window closed — WhatsApp only allows a pre-approved template now.
          <select
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            className="mt-2 w-full rounded-md border border-amber-300 bg-white px-2 py-1.5 text-[12.5px] dark:border-amber-800 dark:bg-neutral-900"
          >
            <option value="">Choose a template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.name}>
                {t.name} — {t.body.slice(0, 48)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() =>
            actions.send(
              drafts[sel].id,
              text.trim(),
              closed ? templateName : undefined,
            )
          }
          disabled={
            busy || !text.trim() || hits.length > 0 || (closed && !templateName)
          }
          className="flex-1 rounded-lg bg-emerald-700 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
        >
          {closed ? "Send template" : "Approve & send"}
        </button>
        <button
          onClick={() => actions.reject(drafts[sel].id)}
          disabled={busy}
          className="rounded-lg border border-neutral-300 px-4 py-2.5 text-[13px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-40 dark:border-neutral-700 dark:hover:bg-red-950"
        >
          Reject
        </button>
      </div>
      <p className="font-mono text-[10.5px] text-neutral-400">
        provenance stored · edit % recorded · approved reply feeds style memory
      </p>
    </div>
  );
}

function ClosedWindowNote({ templates }: { templates: TemplateDTO[] }) {
  return (
    <div className="rounded-xl bg-amber-50 p-4 text-[12.5px] text-amber-800 dark:bg-amber-950 dark:text-amber-200">
      <p className="font-semibold">24h window closed</p>
      <p className="mt-1">
        Free-form replies are blocked by WhatsApp until this client messages
        again. {templates.length > 0
          ? "Generate a draft, then send it as a template."
          : "No approved templates found — sync them from Meta Business Manager first."}
      </p>
    </div>
  );
}

/* ----------------------------- Settings tab ------------------------------ */

function SettingsTab({
  detail,
  actions,
}: {
  detail: ConversationDetail;
  actions: ConsoleActions;
}) {
  const c = detail.client;
  const [form, setForm] = useState({
    emotion: c.emotion,
    goal: c.goal,
    energy: c.energy,
    emojiDensity: c.emojiDensity,
    replyLength: c.replyLength,
    assistantMode: c.assistantMode,
  });

  useEffect(() => {
    setForm({
      emotion: c.emotion,
      goal: c.goal,
      energy: c.energy,
      emojiDensity: c.emojiDensity,
      replyLength: c.replyLength,
      assistantMode: c.assistantMode,
    });
  }, [c]);

  const field =
    "w-full rounded-lg border border-neutral-300 bg-neutral-50 px-2.5 py-2 text-[13px] dark:border-neutral-700 dark:bg-neutral-800";
  const label =
    "mb-1 block text-[10.5px] font-semibold uppercase tracking-wide text-neutral-500";

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/60">
        <h4 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
          {c.displayName ?? c.waId} — voice tuning
        </h4>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Emotion</label>
            <select
              value={form.emotion}
              onChange={(e) => setForm({ ...form, emotion: e.target.value })}
              className={field}
            >
              {["warm", "flirty", "playful", "professional", "reassuring"].map(
                (o) => (
                  <option key={o}>{o}</option>
                ),
              )}
            </select>
          </div>
          <div>
            <label className={label}>Chat flow / goal</label>
            <select
              value={form.goal}
              onChange={(e) => setForm({ ...form, goal: e.target.value })}
              className={field}
            >
              <option value="rapport">build rapport</option>
              <option value="reengage">re-engage quiet client</option>
              <option value="upsell">answer + soft upsell</option>
              <option value="retention">retention / thank you</option>
            </select>
          </div>
          <div className="col-span-2">
            <label className={label}>Energy — {form.energy}</label>
            <input
              type="range"
              min={0}
              max={100}
              value={form.energy}
              onChange={(e) => setForm({ ...form, energy: +e.target.value })}
              className="w-full accent-emerald-600"
            />
          </div>
          <div>
            <label className={label}>Emoji density</label>
            <select
              value={form.emojiDensity}
              onChange={(e) =>
                setForm({ ...form, emojiDensity: +e.target.value })
              }
              className={field}
            >
              <option value={0}>none</option>
              <option value={1}>light</option>
              <option value={2}>medium</option>
              <option value={3}>heavy</option>
            </select>
          </div>
          <div>
            <label className={label}>Reply length</label>
            <select
              value={form.replyLength}
              onChange={(e) => setForm({ ...form, replyLength: e.target.value })}
              className={field}
            >
              <option value="short">short (1–2 sentences)</option>
              <option value="long">longer</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/60">
        <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
          Assistant mode
        </h4>
        <label className="flex cursor-pointer items-start gap-2.5 text-[12.5px] text-neutral-600 dark:text-neutral-300">
          <input
            type="checkbox"
            checked={form.assistantMode}
            onChange={(e) =>
              setForm({ ...form, assistantMode: e.target.checked })
            }
            className="mt-0.5 accent-emerald-600"
          />
          <span>
            Auto-handle routine messages as a <b>disclosed</b> AI assistant.
            Price talk, refunds, emotional messages and closed-window chats
            always escalate to you.
          </span>
        </label>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/60">
        <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
          Guardrails (all clients)
        </h4>
        <p className="font-mono text-[11.5px] text-neutral-600 dark:text-neutral-300">
          {NEVER_SAY.join(" · ")}
        </p>
      </div>

      <button
        onClick={() => actions.saveSettings(c.id, form)}
        className="rounded-lg bg-emerald-700 px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-emerald-600"
      >
        Save settings
      </button>
    </div>
  );
}

/* ------------------------------- Train tab ------------------------------- */

function TrainTab({ detail }: { detail: ConversationDetail }) {
  const c = detail.client;
  return (
    <div className="flex flex-col gap-4 text-[13px]">
      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/60">
        <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
          Style memory
        </h4>
        <p className="text-2xl font-semibold tabular-nums">
          {detail.exemplarCount}
          <span className="ml-2 text-[12px] font-normal text-neutral-500">
            reply pairs embedded
          </span>
        </p>
        {detail.pendingEmbeds > 0 && (
          <p className="mt-1 text-[12px] font-medium text-amber-700 dark:text-amber-300">
            {detail.pendingEmbeds} waiting for the embed worker (
            <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
              npm run worker
            </code>
            )
          </p>
        )}
        <p className="mt-2 text-[12.5px] text-neutral-500">
          Every approved send also feeds one new pair back automatically
          (live_approved); the background worker embeds it within ~30s, so the
          voice keeps improving from real usage.
        </p>
      </div>

      <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-700 dark:bg-neutral-800/60">
        <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-neutral-500">
          Import a chat export
        </h4>
        <p className="text-[12.5px] text-neutral-500">
          WhatsApp → open the chat → ⋮ → More → Export chat → Without media.
          Then run on the server:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-neutral-900 p-3 font-mono text-[11px] leading-relaxed text-emerald-300">
          {`npm run ingest -- ./export.txt ${c.waId} "Your Name"`}
        </pre>
        <p className="mt-2 text-[12px] text-neutral-500">
          Parses Android/iOS formats, scrubs emails and phone numbers, extracts
          reply pairs, and embeds them into this client&apos;s namespace.
        </p>
      </div>
    </div>
  );
}
