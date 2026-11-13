import { EventEmitter } from "events";

// In-process event bus for SSE live updates. Works on a long-lived Node
// server (VPS, Docker, Railway, Fly). On serverless (Vercel functions) the
// emitter isn't shared across instances — the console's 60s fallback poll
// still keeps data fresh there; swap this for Redis pub/sub if you deploy
// serverless and want true realtime.

export type AppEvent = {
  type: "message" | "draft" | "send" | "settings";
  conversationId?: string;
};

const g = globalThis as unknown as { draftroomBus?: EventEmitter };
g.draftroomBus ??= new EventEmitter();
g.draftroomBus.setMaxListeners(200); // one listener per open console tab

const bus = g.draftroomBus;

export function publish(event: AppEvent): void {
  bus.emit("update", event);
}

export function subscribe(fn: (event: AppEvent) => void): () => void {
  bus.on("update", fn);
  return () => bus.off("update", fn);
}
