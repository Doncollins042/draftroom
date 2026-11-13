// Assistant-mode policy engine. Mirrors the escalation rules from the console
// prototype: the assistant only ever auto-handles routine messages, and every
// automated reply is visibly disclosed as AI (the Meta business-AI model).

// Sensitive topics always escalate to the human queue, no exceptions.
const ESCALATE_PATTERN =
  /(price|cost|how much|custom|refund|chargeback|cancel|unsubscrib|sad|upset|angry|mad at|hurt|miss you|lonely|depress|suicid|self.?harm|legal|lawyer|police|meet up|in person|address)/i;

// Hard guardrails: a draft containing these is never sent (assistant or human)
// until the operator edits them out.
export const NEVER_SAY = [
  "meet up",
  "my number",
  "bank transfer to",
  "address",
];

// Visible disclosure prefixed to every automated send. Do not remove this —
// undisclosed AI replies are the line this system is built not to cross.
export const AI_DISCLOSURE_PREFIX = "\u{1F916} AI assistant · ";

export function shouldEscalate(text: string): boolean {
  return ESCALATE_PATTERN.test(text);
}

export function guardrailHits(text: string): string[] {
  const lower = text.toLowerCase();
  return NEVER_SAY.filter((term) => lower.includes(term));
}
