import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Route protection. Uses the edge-safe config (no Prisma) — the `authorized`
// callback lets /api/webhooks/whatsapp, /api/auth and /login through and
// requires a session for everything else, console and API alike.

export default NextAuth(authConfig).auth;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
