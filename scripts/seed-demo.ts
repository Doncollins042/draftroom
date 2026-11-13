/**
 * Demo seed — populates the console with realistic sample data so you can
 * explore the full UI before connecting WhatsApp. Safe to re-run (wipes and
 * re-creates demo content). Remove or skip once real traffic flows.
 *
 * Usage:  npm run seed
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const h = (hours: number) => new Date(Date.now() - hours * 3_600_000);

async function main() {
  // wipe demo content (order matters for FKs)
  await db.draft.deleteMany();
  await db.message.deleteMany();
  await db.conversation.deleteMany();
  await db.exemplarPair.deleteMany();
  await db.client.deleteMany();
  await db.template.deleteMany();

  const mk = async (
    c: {
      waId: string;
      name: string;
      tags: string[];
      emotion: string;
      goal: string;
      assistantMode?: boolean;
      lastInboundH: number | null;
      status: string;
    },
    msgs: {
      dir: "inbound" | "outbound";
      body: string;
      hAgo: number;
      status?: string;
      ai?: boolean;
      src?: string;
    }[],
    drafts: string[] = [],
  ) => {
    const client = await db.client.create({
      data: {
        waId: c.waId,
        displayName: c.name,
        tags: c.tags,
        emotion: c.emotion,
        goal: c.goal,
        assistantMode: c.assistantMode ?? false,
        lastInboundAt: c.lastInboundH === null ? null : h(c.lastInboundH),
      },
    });
    const convo = await db.conversation.create({
      data: {
        clientId: client.id,
        status: c.status,
        lastMessageAt: h(Math.min(...msgs.map((m) => m.hAgo))),
      },
    });
    for (const m of msgs) {
      await db.message.create({
        data: {
          conversationId: convo.id,
          direction: m.dir,
          body: m.body,
          status: m.dir === "outbound" ? (m.status ?? "read") : null,
          aiGenerated: m.ai ?? false,
          source: m.src ?? "live",
          sentAt: h(m.hAgo),
        },
      });
    }
    for (let i = 0; i < drafts.length; i++) {
      await db.draft.create({
        data: {
          conversationId: convo.id,
          variant: i + 1,
          model: "claude-opus-4-8",
          promptVersion: "v1",
          retrievalRefs: [],
          generatedText: drafts[i],
        },
      });
    }
    return client;
  };

  await mk(
    {
      waId: "15550000001", name: "Maya R.", tags: ["VIP"],
      emotion: "flirty", goal: "upsell", lastInboundH: 1.5, status: "needs_reply",
    },
    [
      { dir: "inbound", body: "omg the beach set \u{1F60D}\u{1F60D}", hAgo: 20 },
      { dir: "outbound", body: "haha I'm so glad you liked it!! that water was FREEZING though \u{1F976}", hAgo: 19 },
      { dir: "inbound", body: "worth it lol. hey are you doing customs this month?", hAgo: 3 },
      { dir: "inbound", body: "hey!! did you see my last message \u{1F62D}", hAgo: 1.5 },
    ],
    [
      "Maya!! I'm so sorry babe, my inbox has been wild this week \u{1F62D} yes — customs are open this month but only a few slots left. what did you have in mind? \u{1F440}",
      "omg I did NOT mean to leave you hanging \u{1F62D} yes customs are open!! slots are going fast though — tell me what you're thinking \u{1F495}",
      "you know I could never ignore you \u{1F60F} customs are OPEN. come tell me your idea before the slots fill up",
    ],
  );

  await mk(
    {
      waId: "15550000002", name: "Jordan T.", tags: ["12 mo"],
      emotion: "warm", goal: "retention", lastInboundH: 2, status: "needs_reply",
    },
    [
      { dir: "inbound", body: "hey my sub renews tomorrow — is the loyalty bundle still a thing?", hAgo: 2 },
    ],
    [
      "Jordan!! yes the loyalty bundle is still on \u{1F973} it applies automatically when your sub renews — you don't have to do anything. thank you for sticking around another month \u{1F495}",
      "yes!! it's still running \u{1F64C} it kicks in automatically on renewal. you've been here since day one and I notice, you know \u{1F979}",
    ],
  );

  await mk(
    {
      waId: "15550000003", name: "Sam K.", tags: ["chatty"],
      emotion: "playful", goal: "rapport", assistantMode: true,
      lastInboundH: 4, status: "needs_reply",
    },
    [
      { dir: "inbound", body: "yo what time do you usually post?", hAgo: 26 },
      { dir: "outbound", body: "\u{1F916} AI assistant · usually evenings around 8! the good stuff drops fridays \u{1F60C}", hAgo: 26, ai: true, src: "assistant" },
      { dir: "inbound", body: "that gym set today was insane lol what's your split?", hAgo: 4 },
    ],
  );

  await mk(
    {
      waId: "15550000004", name: "Priya D.", tags: ["new"],
      emotion: "warm", goal: "rapport", lastInboundH: 6, status: "needs_reply",
    },
    [
      { dir: "inbound", body: "hi! just subscribed, love your stuff already \u{1F970}", hAgo: 6 },
    ],
  );

  await mk(
    {
      waId: "15550000005", name: "Alex M.", tags: ["VIP"],
      emotion: "warm", goal: "retention", lastInboundH: 27, status: "open",
    },
    [
      { dir: "inbound", body: "have a good weekend lexi!! \u{1F30A}", hAgo: 27 },
      { dir: "outbound", body: "you too Alex!! don't do anything I wouldn't do \u{1F60F} see you monday \u{1F495}", hAgo: 26.5 },
    ],
  );

  await db.template.createMany({
    data: [
      { name: "checkin_v2", language: "en_US", approved: true,
        body: "hey {{1}}! it's been a minute over here — I've got something new I think you'll like. want me to send it over?" },
      { name: "thanks_v1", language: "en_US", approved: true,
        body: "thank you for being part of this month, {{1}} \u{1F495} the new drop lands friday." },
    ],
  });

  await db.auditLog.createMany({
    data: [
      { action: "assistant_replied", entity: "conversation", meta: { disclosed: true } },
      { action: "templates_synced", entity: "template", meta: { approved: 2, deactivated: 0 } },
    ],
  });

  console.log("Seeded: 5 clients, 5 conversations, 11 messages, 5 pending drafts, 2 templates.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
