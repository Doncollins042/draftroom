/**
 * Create (or update the password of) an operator account.
 *
 * Usage:
 *   npm run operator -- <email> "<Full Name>" <password> [role]
 *
 * role: agent (default) | admin. There is no public signup by design —
 * this script is the only way accounts come into existence.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

async function main() {
  const [email, name, password, role = "agent"] = process.argv.slice(2);
  if (!email || !name || !password) {
    console.error('usage: npm run operator -- <email> "<Full Name>" <password> [agent|admin]');
    process.exit(1);
  }
  if (password.length < 8) throw new Error("Password must be at least 8 characters");
  if (!["agent", "admin"].includes(role)) throw new Error("Role must be agent or admin");

  const passwordHash = bcrypt.hashSync(password, 12);
  const operator = await db.operator.upsert({
    where: { email: email.toLowerCase() },
    create: { email: email.toLowerCase(), name, passwordHash, role },
    update: { name, passwordHash, role },
  });

  console.log(`Operator ready: ${operator.email} (${operator.role})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
