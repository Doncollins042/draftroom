import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { db } from "./db";
import { authConfig } from "@/auth.config";

// Full Auth.js setup: internal team tool, so email + password operators
// (created with scripts/create-operator.ts) rather than public signup.
// There is deliberately NO registration endpoint.

const CredentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const parsed = CredentialsSchema.safeParse(credentials);
        if (!parsed.success) return null;

        const operator = await db.operator.findUnique({
          where: { email: parsed.data.email.toLowerCase() },
        });
        if (!operator) return null;

        const valid = await bcrypt.compare(
          parsed.data.password,
          operator.passwordHash,
        );
        if (!valid) return null;

        await db.auditLog.create({
          data: {
            operatorId: operator.id,
            action: "signed_in",
            entity: "operator",
            entityId: operator.id,
          },
        });

        return {
          id: operator.id,
          email: operator.email,
          name: operator.name,
          role: operator.role,
        };
      },
    }),
  ],
});
