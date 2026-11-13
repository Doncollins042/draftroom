import { NextRequest } from "next/server";
import { subscribe, type AppEvent } from "@/lib/events";

// Server-Sent Events stream for the console. The middleware already requires
// a session for this route. Heartbeats every 25s keep proxies from closing
// the connection; EventSource auto-reconnects on drop.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const push = (event: AppEvent) =>
        write(`data: ${JSON.stringify(event)}\n\n`);

      write(`data: {"type":"connected"}\n\n`);
      const unsubscribe = subscribe(push);
      const heartbeat = setInterval(() => write(`: hb\n\n`), 25_000);

      req.signal.addEventListener("abort", () => {
        closed = true;
        unsubscribe();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
