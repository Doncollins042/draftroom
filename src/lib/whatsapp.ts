import crypto from "crypto";

// WhatsApp Business Cloud API client (official Meta Graph API).
// Sends only ever fire from an operator Approve click or a disclosed
// assistant reply — there is no other send path in this codebase.

const GRAPH_BASE = "https://graph.facebook.com/v21.0";

function phoneNumberId() {
  const id = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!id) throw new Error("WHATSAPP_PHONE_NUMBER_ID is not set");
  return id;
}

// Verify X-Hub-Signature-256 on incoming webhooks. Must be computed over the
// RAW request body — re-serialized JSON changes the bytes and breaks the MAC.
export function verifySignature(
  rawBody: string,
  signatureHeader: string | null,
): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signatureHeader) return false;
  const expected =
    "sha256=" +
    crypto.createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function graphPost(payload: Record<string, unknown>): Promise<string> {
  const res = await fetch(`${GRAPH_BASE}/${phoneNumberId()}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${detail}`);
  }
  const data = (await res.json()) as { messages: { id: string }[] };
  return data.messages[0].id; // wa message id — stored for status tracking
}

// Free-form text — only valid inside the 24h service window.
export function sendText(toWaId: string, body: string): Promise<string> {
  return graphPost({
    messaging_product: "whatsapp",
    to: toWaId,
    type: "text",
    text: { body },
  });
}

// Pre-approved template — the only sendable message outside the window.
export function sendTemplate(
  toWaId: string,
  templateName: string,
  language = "en_US",
): Promise<string> {
  return graphPost({
    messaging_product: "whatsapp",
    to: toWaId,
    type: "template",
    template: { name: templateName, language: { code: language } },
  });
}

// ---------------------------------------------------------------------------
// Template sync — pulls message templates from Meta Business Manager so the
// console's closed-window picker always reflects what Meta actually approved.

export type MetaTemplate = {
  name: string;
  language: string;
  status: string; // APPROVED | PENDING | REJECTED | ...
  body: string;
};

export async function fetchTemplates(): Promise<MetaTemplate[]> {
  const wabaId = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
  if (!wabaId) throw new Error("WHATSAPP_BUSINESS_ACCOUNT_ID is not set");

  const out: MetaTemplate[] = [];
  let url = `${GRAPH_BASE}/${wabaId}/message_templates?fields=name,language,status,components&limit=100`;

  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}` },
    });
    if (!res.ok) {
      throw new Error(`Template fetch failed (${res.status}): ${await res.text()}`);
    }
    const data = (await res.json()) as {
      data: {
        name: string;
        language: string;
        status: string;
        components?: { type: string; text?: string }[];
      }[];
      paging?: { next?: string };
    };
    for (const t of data.data ?? []) {
      out.push({
        name: t.name,
        language: t.language,
        status: t.status,
        body: t.components?.find((c) => c.type === "BODY")?.text ?? "",
      });
    }
    url = data.paging?.next ?? "";
  }
  return out;
}
