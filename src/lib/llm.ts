import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Client } from "@prisma/client";
import { retrieveExemplars, type Exemplar } from "./rag";
import { NEVER_SAY } from "./assistant";

// The real draft engine: replaces the console prototype's heuristic generator.
// Retrieval-augmented — the persona's actual historical replies are the
// few-shot examples, which is what makes style matching work.

// Lazy init — constructing at module level breaks `next build` (no env there)
let client: Anthropic | null = null;
function anthropic() {
  client ??= new Anthropic();
  return client;
}

const MODEL = "claude-opus-4-8";
export const PROMPT_VERSION = "v1";

const DraftsSchema = z.object({
  variants: z.array(z.string()).describe("Distinct reply drafts, best first"),
});

export type HistoryTurn = { direction: string; body: string };

export type DraftResult = {
  variants: string[];
  retrievalRefs: { exemplarId: string; score: number }[];
  model: string;
  promptVersion: string;
};

// Stable per-client system prompt. Keep volatile content (conversation,
// exemplars) out of here — the cache_control breakpoint below caches this
// prefix across every generation for the same client settings.
function buildSystem(client: Client): string {
  return [
    `You draft WhatsApp replies on behalf of a creator, in their personal voice, for a human operator to review before sending. You never send anything yourself.`,
    ``,
    `Voice settings for this client (${client.displayName ?? "client"}):`,
    `- Emotional register: ${client.emotion}`,
    `- Energy: ${client.energy}/100 (higher = more exclamation, more enthusiasm)`,
    `- Emoji density: ${client.emojiDensity}/3`,
    `- Reply length: ${client.replyLength === "short" ? "1-2 short sentences, chat register" : "a few sentences, still conversational"}`,
    `- Conversation goal: ${client.goal}`,
    ``,
    `Match the voice shown in the style examples exactly — capitalization habits, punctuation, emoji choices, sentence rhythm. The examples are real replies this voice has sent.`,
    ``,
    `Hard rules:`,
    `- Never include any of these phrases or topics: ${NEVER_SAY.join(", ")}.`,
    `- Never propose meeting in person, moving off-platform, or sharing contact/financial details.`,
    `- Never claim to be an AI or deny being one — the human operator owns disclosure decisions.`,
    `- If the incoming message is distressed or high-stakes, write a caring, low-pressure reply and keep it brief.`,
  ].join("\n");
}

function buildUserPrompt(
  history: HistoryTurn[],
  exemplars: Exemplar[],
  k: number,
): string {
  const exemplarBlock = exemplars
    .map(
      (e, i) =>
        `<example ${i + 1}>\nclient: ${e.inboundText}\nreply: ${e.replyText}\n</example ${i + 1}>`,
    )
    .join("\n");
  const historyBlock = history
    .slice(-12)
    .map((m) => `${m.direction === "inbound" ? "client" : "me"}: ${m.body}`)
    .join("\n");
  return [
    `Style examples — how this voice has answered similar messages:`,
    exemplarBlock || "(no examples retrieved — rely on the voice settings)",
    ``,
    `Current conversation (most recent last):`,
    historyBlock,
    ``,
    `Write ${k} distinct reply drafts to the client's last message, best first. Vary the angle across variants, not just the wording.`,
  ].join("\n");
}

export async function generateDrafts(
  client: Client,
  history: HistoryTurn[],
  k = 3,
): Promise<DraftResult> {
  const lastInbound =
    [...history].reverse().find((m) => m.direction === "inbound")?.body ?? "";
  const exemplars = lastInbound
    ? await retrieveExemplars(client.id, lastInbound, 6)
    : [];

  const response = await anthropic().messages.parse({
    model: MODEL,
    max_tokens: 2000,
    thinking: { type: "adaptive" },
    system: [
      {
        type: "text",
        text: buildSystem(client),
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      { role: "user", content: buildUserPrompt(history, exemplars, k) },
    ],
    output_config: { format: zodOutputFormat(DraftsSchema) },
  });

  if (response.stop_reason === "refusal" || !response.parsed_output) {
    throw new Error("Draft generation was declined — escalate to operator");
  }

  return {
    variants: response.parsed_output.variants.slice(0, k),
    retrievalRefs: exemplars.map((e) => ({ exemplarId: e.id, score: e.score })),
    model: MODEL,
    promptVersion: PROMPT_VERSION,
  };
}
