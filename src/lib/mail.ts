import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

let transporter: Transporter | null = null;

function getTransporter() {
  if (!process.env.SMTP_HOST) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      // App Passwords are shown with spaces ("abcd efgh ..."); SMTP needs them without.
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS?.replace(/\s+/g, "") } : undefined,
    });
  }
  return transporter;
}

/** Gmail only sends "From" the signed-in account, so default to it unless MAIL_FROM is set. */
export function mailFrom() {
  return process.env.MAIL_FROM || `GreenBite <${process.env.SMTP_USER}>`;
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPES[c]);

function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#f4f7f2;font-family:Segoe UI,Arial,sans-serif;color:#1c2b1e">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 12px">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden;max-width:100%">
    <tr><td style="background:#1f7a3a;color:#fff;padding:18px 24px;font-size:20px;font-weight:700">GreenBite</td></tr>
    <tr><td style="padding:24px"><h2 style="margin:0 0 12px;font-size:18px">${esc(title)}</h2>${bodyHtml}</td></tr>
    <tr><td style="padding:14px 24px;background:#f4f7f2;font-size:12px;color:#5d6b5f">100% vegetarian food delivery. This is an automated message.</td></tr>
  </table></td></tr></table></body></html>`;
}

/** Reserved, never-real domains (RFC 2606/6761): test accounts must not trigger real sends or bounces. */
const isReservedTestAddress = (to: string) => /@(?:[^@]+\.)?(?:local|test|invalid|localhost|example\.(?:com|net|org))$/i.test(to.trim());

export async function sendMail(opts: { to: string; subject: string; title: string; html: string; text: string }) {
  const t = getTransporter();
  if (!t || isReservedTestAddress(opts.to)) {
    console.info(`[mail:dev] To: ${opts.to} | ${opts.subject}\n${opts.text}`);
    return { delivered: false };
  }
  try {
    await t.sendMail({
      from: mailFrom(),
      to: opts.to,
      subject: opts.subject,
      html: layout(opts.title, opts.html),
      text: opts.text,
    });
    return { delivered: true };
  } catch (err) {
    console.error("[mail] send failed", err);
    return { delivered: false };
  }
}

const STATUS_LINES: Record<string, string> = {
  active: "Your account has been approved and is now active. You can sign in right away.",
  suspended: "Your account has been suspended by an administrator.",
  rejected: "Unfortunately your registration was not approved.",
};

export const mailTemplates = {
  welcome(name: string, needsApproval: boolean) {
    const text = needsApproval
      ? `Hi ${name}, thanks for registering with GreenBite. Your account is under review and you'll get an email once an admin approves it.`
      : `Hi ${name}, welcome to GreenBite! Start exploring pure-veg restaurants near you.`;
    return { subject: "Welcome to GreenBite", title: `Welcome, ${name}!`, text, html: `<p>${esc(text)}</p>` };
  },
  accountStatus(name: string, status: string, reason?: string) {
    const line = STATUS_LINES[status] ?? `Your account status changed to ${status}.`;
    const text = `Hi ${name}, ${line}${reason ? ` Reason: ${reason}` : ""}`;
    return { subject: `Your GreenBite account is ${status}`, title: "Account update", text, html: `<p>${esc(text)}</p>` };
  },
  restaurantStatus(name: string, restaurant: string, status: string, reason?: string) {
    const text = `Hi ${name}, your restaurant "${restaurant}" is now ${status} on GreenBite.${reason ? ` Reason: ${reason}` : ""}`;
    return { subject: `${restaurant} is ${status}`, title: "Restaurant update", text, html: `<p>${esc(text)}</p>` };
  },
  orderCancelled(name: string, orderNumber: string, reason: string) {
    const text = `Hi ${name}, order ${orderNumber} has been cancelled. Reason: ${reason}. Any payment made will be refunded.`;
    return { subject: `Order ${orderNumber} cancelled`, title: "Order cancelled", text, html: `<p>${esc(text)}</p>` };
  },
  deliveryAssigned(name: string, orderNumber: string, partner: string) {
    const text = `Hi ${name}, ${partner} has been assigned to deliver order ${orderNumber}.`;
    return { subject: `Delivery partner assigned for ${orderNumber}`, title: "Delivery partner assigned", text, html: `<p>${esc(text)}</p>` };
  },
  orderPlaced(name: string, o: { orderNumber: string; restaurant: string; items: { name: string; quantity: number; price: number }[]; total: number; method: string; otp: string; link: string }) {
    const lines = o.items.map((i) => `${i.quantity} x ${i.name} - Rs.${i.price * i.quantity}`).join("\n");
    const text = `Hi ${name}, your order ${o.orderNumber} from ${o.restaurant} has been placed successfully!\n\n${lines}\nTotal: Rs.${o.total} (${o.method.toUpperCase()})\n\nYour delivery OTP is ${o.otp}. Share it with the delivery partner only when you receive your food.\nTrack your order: ${o.link}`;
    return {
      subject: `Order placed: ${o.orderNumber}`,
      title: "Your order is placed",
      text,
      html: `<p>Hi ${esc(name)}, your order <b>${esc(o.orderNumber)}</b> from <b>${esc(o.restaurant)}</b> has been placed successfully.</p>
        <table cellpadding="6" style="border-collapse:collapse;width:100%;font-size:14px">${o.items
          .map((i) => `<tr><td style="border-bottom:1px solid #eee">${i.quantity} × ${esc(i.name)}</td><td align="right" style="border-bottom:1px solid #eee">₹${i.price * i.quantity}</td></tr>`)
          .join("")}<tr><td><b>Total (${esc(o.method.toUpperCase())})</b></td><td align="right"><b>₹${o.total}</b></td></tr></table>
        <p style="margin-top:18px">Your delivery OTP:</p>
        <p style="font-size:28px;font-weight:700;letter-spacing:6px;color:#1f7a3a;margin:4px 0 8px">${esc(o.otp)}</p>
        <p style="font-size:12px;color:#5d6b5f">Share it with the delivery partner only when your food is in your hands.</p>
        <p><a href="${esc(o.link)}" style="display:inline-block;background:#1f7a3a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Track your order live</a></p>`,
    };
  },
  newOrderForHotel(name: string, orderNumber: string, items: { name: string; quantity: number }[], link: string) {
    const text = `Hi ${name}, new order ${orderNumber}: ${items.map((i) => `${i.quantity} x ${i.name}`).join(", ")}. Accept it in your GreenBite dashboard: ${link}`;
    return { subject: `New order ${orderNumber}`, title: "New order received", text, html: `<p>${esc(text)}</p>` };
  },
  orderOnTheWay(name: string, orderNumber: string, rider: string) {
    const text = `Hi ${name}, ${rider} has picked up order ${orderNumber} and is on the way. Keep your delivery OTP ready - share it only when you have your food.`;
    return { subject: `Order ${orderNumber} is on the way`, title: "Your food is on the way", text, html: `<p>${esc(text)}</p>` };
  },
  orderDelivered(name: string, orderNumber: string, restaurant: string, total: number) {
    const text = `Hi ${name}, order ${orderNumber} from ${restaurant} has been delivered (total Rs.${total}). Enjoy your meal and thank you for ordering with GreenBite!`;
    return { subject: `Delivered: ${orderNumber}`, title: "Order delivered", text, html: `<p>${esc(text)}</p>` };
  },
  orderConfirmed(name: string, orderNumber: string, restaurant: string, prepMins: number) {
    const text = `Hi ${name}, ${restaurant} has accepted order ${orderNumber} and will start preparing it now (about ${prepMins} minutes).`;
    return { subject: `Order ${orderNumber} accepted`, title: "Your order is accepted", text, html: `<p>${esc(text)}</p>` };
  },
  newDelivery(name: string, orderNumber: string, restaurant: string, address: string) {
    const text = `Hi ${name}, order ${orderNumber} has been assigned to you. Pick it up from ${restaurant}, ${address}. Open the GreenBite partner app for details.`;
    return { subject: `New delivery: ${orderNumber}`, title: "New delivery assigned", text, html: `<p>${esc(text)}</p>` };
  },
  riderComing(name: string, orderNumber: string, rider: string, phone: string) {
    const text = `Hi ${name}, ${rider}${phone ? ` (${phone})` : ""} is coming to pick up order ${orderNumber}.`;
    return { subject: `Rider assigned for ${orderNumber}`, title: "Rider on the way for pickup", text, html: `<p>${esc(text)}</p>` };
  },
  emailOtp(name: string, otp: string) {
    const text = `Hi ${name}, your GreenBite verification code is ${otp}. It expires in 10 minutes. Never share this code with anyone.`;
    return {
      subject: `${otp} is your GreenBite verification code`,
      title: "Verify your email",
      text,
      html: `<p>Hi ${esc(name)},</p><p>Enter this code to verify your email address:</p>
        <p style="font-size:30px;font-weight:700;letter-spacing:8px;margin:16px 0;color:#1f7a3a">${esc(otp)}</p>
        <p style="font-size:12px;color:#5d6b5f">The code expires in 10 minutes. GreenBite staff will never ask for it.</p>`,
    };
  },
  passwordReset(name: string, link: string) {
    const text = `Hi ${name}, use this link to reset your password (valid for 30 minutes): ${link}`;
    return {
      subject: "Reset your GreenBite password",
      title: "Password reset",
      text,
      html: `<p>Hi ${esc(name)},</p><p>Click the button below to reset your password. The link is valid for 30 minutes.</p>
        <p><a href="${esc(link)}" style="display:inline-block;background:#1f7a3a;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Reset password</a></p>
        <p style="font-size:12px;color:#5d6b5f">If you didn't request this, you can ignore this email.</p>`,
    };
  },
};
