# Draftroom

Human-in-the-loop WhatsApp Business console. AI drafts replies in your voice
(RAG over your real chat history); a human approves every send. Routine
messages can be auto-handled by a **disclosed** AI assistant (the Meta model);
everything sensitive escalates to the human approve queue.

**Hard rules built into this codebase**

- Exactly two send paths: an operator Approve click (`/api/send`) or a
  disclosed assistant reply (webhook handler, `AI_DISCLOSURE_PREFIX` always
  attached). There is no undisclosed or bulk send anywhere.
- Official WhatsApp Business Cloud API only. No unofficial automation —
  personal-number bots get banned.
- The 24h service window and guardrail terms are enforced server-side.

## Stack

Next.js 15 (App Router) · TypeScript · Tailwind v4 · Prisma + PostgreSQL ·
Pinecone (style exemplars) · Voyage AI (embeddings) · Claude (`claude-opus-4-8`)
for draft generation.

## Setup

1. **Install**

   ```bash
   npm install
   cp .env.example .env   # then fill it in
   ```

2. **Database**

   ```bash
   npm run db:migrate
   ```

3. **Auth** — generate a session secret and create your first operator.
   There is no public signup; this script is the only way accounts exist.

   ```bash
   npx auth secret            # writes AUTH_SECRET, or paste into .env yourself
   npm run operator -- you@example.com "Your Name" <password> admin
   ```

4. **Pinecone** — create an index named per `PINECONE_INDEX`, dimension 1024
   (voyage-3.5), metric cosine.

5. **WhatsApp Business Cloud API** (developers.facebook.com)
   - Create a Business app, add the WhatsApp product, register a business
     phone number (your personal number stays personal).
   - Set the webhook callback URL to `https://<your-host>/api/webhooks/whatsapp`
     with your `WHATSAPP_VERIFY_TOKEN`; subscribe to `messages`.
   - Put the permanent token, phone number id, and app secret in `.env`.
   - Clients must message you first (or opt in). Cold outreach = approved
     templates only.

6. **Import chat history** (builds the style memory)

   ```bash
   npm run ingest -- ./chat-export.txt 2348012345678 "Your Name"
   ```

7. **Run** (two processes: the app and the background embedder)

   ```bash
   npm run dev      # the console + API
   npm run worker   # embeds live_approved exemplars into Pinecone (~30s sweep)
   ```

## How it fits together

```
WhatsApp ── webhook ──> /api/webhooks/whatsapp
                          ├─ routine + assistantMode on ──> disclosed AI reply (sendText)
                          └─ everything else ──> conversation status: needs_reply
Console UI ──> POST /api/drafts   (RAG retrieve -> Claude -> 3 variants, provenance stored)
Operator   ──> POST /api/send     (guardrails + 24h window check -> Cloud API send
                                   -> editDistance recorded -> live_approved exemplar)
```

## What's scaffolded vs still to build

| Done in this scaffold | Possible later |
|---|---|
| Schema, webhook (verify + idempotent ingest + status receipts) | Redis pub/sub behind /api/events if deploying serverless |
| Assistant policy + disclosed auto-reply | Per-language template rows (name+language composite key) |
| Draft engine (RAG + Claude, structured output, prompt caching) | Prompt-version A/B comparison in admin |
| Send path (window + guardrails + edit-distance + audit, operator from session) | |
| WhatsApp export ingest script | |
| Full console UI: client rail, chat view, draft panel, settings, approve queue | |
| Auth: Auth.js credentials sign-in, route protection, operator CLI, sign-in audit | |
| SSE live updates (/api/events + event bus; 60s fallback poll) | |
| Background embed worker (`npm run worker`) closing the feedback loop | |
| Template sync from Meta (`/admin` → Sync) + closed-window picker | |
| Admin screen (`/admin`, admins only): metrics, operators, templates, audit log | |
