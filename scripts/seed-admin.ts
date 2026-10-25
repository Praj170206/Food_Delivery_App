/**
 * Creates the first admin account (admins can't self-register).
 *   npm run seed:admin
 * Reads SEED_ADMIN_NAME / SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD from .env.local.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { User } from "../src/models/User";
import { ActivityLog } from "../src/models/ActivityLog";
import { getSettings } from "../src/models/Setting";
import { hashPassword, passwordSchema } from "../src/lib/auth/password";

async function main() {
  const name = process.env.SEED_ADMIN_NAME || "Super Admin";
  const email = (process.env.SEED_ADMIN_EMAIL || "").toLowerCase().trim();
  const password = process.env.SEED_ADMIN_PASSWORD || "";
  if (!email || !password) throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env.local");
  const check = passwordSchema.safeParse(password);
  if (!check.success) throw new Error(`SEED_ADMIN_PASSWORD is too weak: ${check.error.issues[0].message}`);

  await connectDB();
  await Promise.all([User.syncIndexes(), ActivityLog.syncIndexes()]);
  await getSettings(); // make sure the platform settings document exists

  const existing = await User.findOne({ email });
  if (existing) {
    console.log(`✔ ${email} already exists (role: ${existing.role}). Nothing to do.`);
    return;
  }
  const admin = await User.create({ name, email, role: "admin", status: "active", emailVerified: true, passwordHash: await hashPassword(password) });
  await ActivityLog.create({
    actor: admin._id,
    actorName: "System",
    actorRole: "system",
    action: "user.created",
    message: `Initial admin account created for ${name}`,
    entityType: "user",
    entityId: admin._id,
    severity: "critical",
  });
  console.log(`✔ Admin created: ${email}\n  Sign in at /login and change the password from My Profile.`);
}

main()
  .catch((e) => {
    console.error("✖", e.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
