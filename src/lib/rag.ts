import { Pinecone } from "@pinecone-database/pinecone";

// Style-exemplar retrieval. We embed only the INBOUND side of each historical
// exchange; the reply lives in metadata. Querying with a new incoming message
// returns "how this voice answered messages like this one" — few-shot fuel
// for the draft engine. One Pinecone namespace per client so styles never bleed.

// Lazy init — constructing at module level breaks `next build` (no env there)
let pc: Pinecone | null = null;
function index() {
  pc ??= new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
  return pc.index(process.env.PINECONE_INDEX!);
}

export type Exemplar = {
  id: string;
  score: number;
  inboundText: string;
  replyText: string;
};

export async function embed(texts: string[]): Promise<number[][]> {
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "voyage-3.5", input: texts }),
  });
  if (!res.ok) throw new Error(`Voyage embeddings failed: ${res.status}`);
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding);
}

export async function upsertExemplars(
  clientId: string,
  pairs: { id: string; inboundText: string; replyText: string; context?: string }[],
): Promise<void> {
  if (!pairs.length) return;
  const vectors = await embed(
    pairs.map((p) =>
      p.context ? `${p.context}\n---\n${p.inboundText}` : p.inboundText,
    ),
  );
  await index()
    .namespace(clientId)
    .upsert({
      records: pairs.map((p, i) => ({
        id: `ex_${p.id}`,
        values: vectors[i],
        metadata: { inbound_text: p.inboundText, reply_text: p.replyText },
      })),
    });
}

export async function retrieveExemplars(
  clientId: string,
  query: string,
  topK = 6,
): Promise<Exemplar[]> {
  const [vector] = await embed([query]);
  const result = await index()
    .namespace(clientId)
    .query({ vector, topK, includeMetadata: true });
  return (result.matches ?? []).map((m) => ({
    id: m.id,
    score: m.score ?? 0,
    inboundText: String(m.metadata?.inbound_text ?? ""),
    replyText: String(m.metadata?.reply_text ?? ""),
  }));
}
