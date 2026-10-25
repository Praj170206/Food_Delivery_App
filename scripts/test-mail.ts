/**
 * Checks the SMTP settings in .env.local and sends one test email.
 *   npm run test:mail                 -> sends to SMTP_USER
 *   npm run test:mail -- you@mail.com -> sends to that address
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import nodemailer from "nodemailer";

async function main() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    throw new Error("Fill SMTP_HOST, SMTP_USER and SMTP_PASS in .env.local first");
  }
  const port = Number(SMTP_PORT || 587);
  const t = nodemailer.createTransport({ host: SMTP_HOST, port, secure: port === 465, auth: { user: SMTP_USER, pass: SMTP_PASS.replace(/\s+/g, "") } });

  await t.verify();
  console.log(`✔ Signed in to ${SMTP_HOST} as ${SMTP_USER}`);

  const to = process.argv[2] || SMTP_USER;
  const info = await t.sendMail({
    from: process.env.MAIL_FROM || `GreenBite <${SMTP_USER}>`,
    to,
    subject: "GreenBite test email",
    text: "If you can read this, GreenBite can send OTPs and order emails.",
  });
  console.log(`✔ Test email sent to ${to} (${info.messageId}). Check the inbox and the spam folder.`);
}

main().catch((e) => {
  const msg = String(e?.message ?? e);
  if (/535|Username and Password not accepted|BadCredentials/i.test(msg)) {
    console.error("✖ Gmail rejected the login. SMTP_PASS must be a 16-character App Password (not your normal Gmail password), and 2-Step Verification must be on.");
  } else {
    console.error("✖", msg);
  }
  process.exitCode = 1;
});
