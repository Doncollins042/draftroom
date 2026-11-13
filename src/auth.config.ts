import type { NextAuthConfig } from "next-auth";

// Edge-safe auth config (no Prisma/bcrypt imports) — shared by the middleware
// and the full server-side config in src/lib/auth.ts.

export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  providers: [], // filled in by src/lib/auth.ts (Credentials needs Node APIs)
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      // Meta must reach the webhook unauthenticated; auth + login are public.
      if (
        pathname.startsWith("/api/webhooks") ||
        pathname.startsWith("/api/auth") ||
        pathname === "/login"
      ) {
        return true;
      }
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "agent";
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token.id as string) ?? "";
        session.user.role = (token.role as string) ?? "agent";
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
