/**
 * Fills the database with realistic demo data (hotels, menus, riders, customers, orders)
 * so the admin panel has something to show before the other apps exist.
 *   npm run seed:demo            -> add demo data
 *   npm run seed:demo -- --reset -> remove all demo data
 * Every demo account uses an @demo.greenbite.app email and the password Demo@1234.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import mongoose from "mongoose";
import { connectDB } from "../src/lib/db";
import { User } from "../src/models/User";
import { Restaurant } from "../src/models/Restaurant";
import { MenuItem } from "../src/models/MenuItem";
import { Order } from "../src/models/Order";
import { ActivityLog } from "../src/models/ActivityLog";
import { getSettings } from "../src/models/Setting";
import { hashPassword } from "../src/lib/auth/password";
import { haversineKm } from "../src/lib/geo";
import { generateOrderNumber } from "../src/lib/orders";
import { encryptOtp, generateOtp, hashOtp } from "../src/lib/deliveryOtp";
import type { OrderStatus } from "../src/lib/constants";

const DOMAIN = "demo.greenbite.app";
const rand = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];
const jitter = ([lng, lat]: [number, number], km: number): [number, number] => [
  lng + ((Math.random() - 0.5) * 2 * km) / 108,
  lat + ((Math.random() - 0.5) * 2 * km) / 111,
];

const HOTELS = [
  { name: "Sattvik Bhojanalaya", city: "Bengaluru", line1: "12, 100 Feet Rd, Indiranagar", coords: [77.6408, 12.9784] as [number, number], cuisines: ["North Indian", "Thali", "Jain"] },
  { name: "Udupi Krishna Bhavan", city: "Bengaluru", line1: "45, 4th Block, Jayanagar", coords: [77.5838, 12.925] as [number, number], cuisines: ["South Indian", "Breakfast"] },
  { name: "Green Leaf Bowls", city: "Bengaluru", line1: "8, 80 Feet Rd, Koramangala", coords: [77.6271, 12.9352] as [number, number], cuisines: ["Healthy", "Vegan", "Salads"] },
];

const MENU: Record<string, { name: string; category: string; price: number; isJain?: boolean; isVegan?: boolean }[]> = {
  "Sattvik Bhojanalaya": [
    { name: "Paneer Butter Masala", category: "Main Course", price: 260 },
    { name: "Dal Makhani", category: "Main Course", price: 210 },
    { name: "Jain Veg Kadai", category: "Main Course", price: 230, isJain: true },
    { name: "Butter Naan", category: "Breads", price: 55 },
    { name: "Gujarati Thali", category: "Thali", price: 320 },
    { name: "Gulab Jamun (2 pcs)", category: "Desserts", price: 90 },
  ],
  "Udupi Krishna Bhavan": [
    { name: "Masala Dosa", category: "Dosa", price: 110 },
    { name: "Rava Idli (2 pcs)", category: "Breakfast", price: 80 },
    { name: "Ghee Pongal", category: "Breakfast", price: 95 },
    { name: "Bisi Bele Bath", category: "Rice", price: 120 },
    { name: "Filter Coffee", category: "Beverages", price: 40 },
  ],
  "Green Leaf Bowls": [
    { name: "Buddha Bowl", category: "Bowls", price: 289, isVegan: true },
    { name: "Quinoa Paneer Salad", category: "Salads", price: 249 },
    { name: "Avocado Millet Bowl", category: "Bowls", price: 319, isVegan: true },
    { name: "Cold-pressed Green Juice", category: "Beverages", price: 149, isVegan: true },
  ],
};

const STATUS_MIX: OrderStatus[] = ["delivered", "delivered", "delivered", "delivered", "delivered", "cancelled", "placed", "confirmed", "preparing", "ready", "picked_up"];

async function reset() {
  const demoUsers = await User.find({ email: new RegExp(`@${DOMAIN.replace(/\./g, "\\.")}$`) }).select("_id");
  const ids = demoUsers.map((u) => u._id);
  const restaurants = await Restaurant.find({ manager: { $in: ids } }).select("_id");
  const rIds = restaurants.map((r) => r._id);
  await Promise.all([
    Order.deleteMany({ $or: [{ user: { $in: ids } }, { restaurant: { $in: rIds } }] }),
    MenuItem.deleteMany({ restaurant: { $in: rIds } }),
    ActivityLog.deleteMany({ $or: [{ actor: { $in: ids } }, { entityId: { $in: [...ids, ...rIds] } }] }),
  ]);
  await Restaurant.deleteMany({ _id: { $in: rIds } });
  await User.deleteMany({ _id: { $in: ids } });
  console.log(`✔ Removed ${ids.length} demo users and ${rIds.length} demo hotels`);
}

async function seed() {
  if (await User.exists({ email: `manager1@${DOMAIN}` })) {
    console.log("Demo data already present. Run `npm run seed:demo -- --reset` first to recreate it.");
    return;
  }
  const settings = await getSettings();
  const passwordHash = await hashPassword("Demo@1234");
  // timestamps:false so backdated createdAt values are kept as given.
  const log = (doc: Record<string, unknown>) => new ActivityLog({ severity: "info", createdAt: new Date(), ...doc }).save({ timestamps: false });

  // Hotels + managers + menus
  const hotels = [];
  for (const [i, h] of HOTELS.entries()) {
    const manager = await User.create({ name: `${h.name.split(" ")[0]} Manager`, email: `manager${i + 1}@${DOMAIN}`, phone: `+91 90000 0000${i}`, role: "manager", status: "active", passwordHash });
    const restaurant = await Restaurant.create({
      name: h.name,
      slug: `${h.name.toLowerCase().replace(/\s+/g, "-")}-demo`,
      manager: manager._id,
      phone: manager.phone,
      address: { line1: h.line1, city: h.city, state: "Karnataka" },
      location: { type: "Point", coordinates: h.coords },
      cuisines: h.cuisines,
      fssaiLicense: `1001${i}2345678901`.slice(0, 14),
      status: "approved",
      isOpen: true,
      rating: 4 + Math.random(),
      ratingCount: 20 + i * 13,
    });
    manager.restaurant = restaurant._id;
    await manager.save();
    const items = await MenuItem.insertMany(MENU[h.name].map((m) => ({ ...m, restaurant: restaurant._id })));
    hotels.push({ restaurant, manager, items });
  }
  // One hotel waiting for approval, so the approvals flow can be tried out.
  const pendingMgr = await User.create({ name: "Anand Pending", email: `manager-pending@${DOMAIN}`, phone: "+91 90000 00099", role: "manager", status: "pending", passwordHash });
  const pendingHotel = await Restaurant.create({
    name: "Annapoorna Pure Veg",
    slug: "annapoorna-pure-veg-demo",
    manager: pendingMgr._id,
    address: { line1: "22, MG Road", city: "Bengaluru" },
    location: { type: "Point", coordinates: [77.6094, 12.9756] },
    cuisines: ["North Indian"],
    status: "pending",
  });
  pendingMgr.restaurant = pendingHotel._id;
  await pendingMgr.save();
  await log({ actor: pendingMgr._id, actorName: pendingMgr.name, actorRole: "manager", action: "auth.registered", message: `${pendingMgr.name} registered as Hotel Manager (awaiting approval)`, entityType: "user", entityId: pendingMgr._id, severity: "warning" });

  // Riders: online ones near the hotels with fresh GPS, plus one pending applicant.
  const riderNames = ["Ravi Kumar", "Suresh Gowda", "Imran Khan", "Prakash Rao", "Manoj Singh", "Deepak Shetty"];
  const riders = [];
  for (const [i, name] of riderNames.entries()) {
    const online = i < 5;
    riders.push(
      await User.create({
        name,
        email: `rider${i + 1}@${DOMAIN}`,
        phone: `+91 91111 1111${i}`,
        role: "delivery",
        status: "active",
        passwordHash,
        delivery: {
          vehicleType: rand(["scooter", "motorbike", "ev", "bicycle"]),
          vehicleNumber: `KA0${i + 1}EX${1000 + i * 37}`,
          isOnline: online,
          isAvailable: online,
          currentLocation: { type: "Point", coordinates: jitter(rand(HOTELS).coords, 2.5) },
          lastLocationAt: online ? new Date() : new Date(Date.now() - 86400000),
          totalDeliveries: 0,
        },
      })
    );
  }
  const pendingRider = await User.create({ name: "Kiran Applicant", email: `rider-pending@${DOMAIN}`, phone: "+91 91111 11199", role: "delivery", status: "pending", passwordHash, delivery: { vehicleType: "scooter", vehicleNumber: "KA05PN4321" } });
  await log({ actor: pendingRider._id, actorName: pendingRider.name, actorRole: "delivery", action: "auth.registered", message: `${pendingRider.name} registered as Delivery Partner (awaiting approval)`, entityType: "user", entityId: pendingRider._id, severity: "warning" });

  // Customers
  const customerNames = ["Aarav Sharma", "Diya Patel", "Ishaan Reddy", "Meera Iyer", "Rohan Jain"];
  const customers = [];
  for (const [i, name] of customerNames.entries()) {
    const coords = jitter(HOTELS[i % HOTELS.length].coords, 3);
    customers.push(await User.create({ name, email: `customer${i + 1}@${DOMAIN}`, phone: `+91 98888 8888${i}`, role: "user", status: "active", passwordHash, addresses: [{ label: "Home", line1: `${10 + i}, ${rand(["5th Cross", "Main Rd", "2nd Stage", "Layout"])}`, city: "Bengaluru", location: { type: "Point", coordinates: coords }, isDefault: true }] }));
  }

  // Orders spread over the last 7 days. Active ones get a rider who is then marked busy.
  const freeRiders = riders.slice(0, 5);
  let count = 0;
  for (let i = 0; i < 32; i++) {
    const { restaurant, items } = rand(hotels);
    const customer = rand(customers);
    let status = rand(STATUS_MIX);
    const isActive = !["delivered", "cancelled"].includes(status);
    const needsRider = ["ready", "picked_up", "delivered"].includes(status) || (isActive && Math.random() < 0.4);
    const rider = needsRider ? (isActive ? freeRiders.pop() : rand(riders.slice(0, 5))) : undefined;
    if (isActive && needsRider && !rider) status = "placed"; // ran out of free riders

    const picked = Array.from({ length: 1 + Math.floor(Math.random() * 3) }, () => rand(items));
    const lines = [...new Map(picked.map((m) => [String(m._id), m])).values()].map((m) => ({ menuItem: m._id, name: m.name, price: m.price, quantity: 1 + Math.floor(Math.random() * 2) }));
    const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
    const addr = customer.addresses![0];
    const distanceKm = Math.round(haversineKm(restaurant.location!.coordinates as [number, number], addr.location!.coordinates as [number, number]) * 10) / 10;
    const deliveryFee = subtotal >= settings.delivery!.freeDeliveryAbove ? 0 : Math.round(settings.delivery!.baseFee + distanceKm * settings.delivery!.perKmFee);
    const tax = Math.round((subtotal * settings.taxPercent) / 100);
    const createdAt = isActive ? new Date(Date.now() - Math.random() * 40 * 60000) : new Date(Date.now() - Math.random() * 7 * 86400000);
    const at = (mins: number) => new Date(createdAt.getTime() + mins * 60000);

    const flow: OrderStatus[] = ["placed", "confirmed", "preparing", "ready", "picked_up", "delivered"];
    const reached = status === "cancelled" ? flow.slice(0, 1 + Math.floor(Math.random() * 3)) : flow.slice(0, flow.indexOf(status) + 1);
    const timeline: { status: string; at: Date; byRole: string; note?: string }[] = reached.map((s, idx) => ({ status: s, at: at(idx * 6), byRole: s === "placed" ? "user" : s === "picked_up" || s === "delivered" ? "delivery" : "manager" }));
    if (rider) timeline.splice(Math.min(timeline.length, 3), 0, { status: "partner_assigned", at: at(10), byRole: "system", note: `Auto-assigned to ${rider.name}` });
    if (status === "cancelled") timeline.push({ status: "cancelled", at: at(20), byRole: "user", note: "Changed my mind" });

    const method = rand(["cod", "cod", "cod", "upi"]) as "cod" | "upi";
    const otp = generateOtp(4);
    const order = new Order({
      orderNumber: generateOrderNumber(),
      user: customer._id,
      restaurant: restaurant._id,
      deliveryPartner: rider?._id,
      items: lines,
      pricing: { subtotal, deliveryFee, tax, discount: 0, total: subtotal + deliveryFee + tax },
      deliveryAddress: { line1: addr.line1, city: addr.city, location: addr.location },
      status,
      payment: { method, status: status === "delivered" || method === "upi" ? (status === "cancelled" && method === "upi" ? "refunded" : "paid") : "pending" },
      distanceKm,
      assignedAt: rider ? at(10) : undefined,
      deliveredAt: status === "delivered" ? at(35) : undefined,
      cancellation: status === "cancelled" ? { reason: "Changed my mind", byRole: "user", at: at(20), by: customer._id } : undefined,
      timeline,
      createdAt,
      updatedAt: createdAt,
    });
    if (isActive) {
      order.deliveryOtpHash = hashOtp(order._id, otp);
      order.deliveryOtpEnc = encryptOtp(otp);
    }
    await order.save({ timestamps: false });
    if (rider && isActive) await User.updateOne({ _id: rider._id }, { "delivery.isAvailable": false, "delivery.activeOrder": order._id });
    if (rider && status === "delivered") await User.updateOne({ _id: rider._id }, { $inc: { "delivery.totalDeliveries": 1 } });
    await log({ actor: customer._id, actorName: customer.name, actorRole: "user", action: "order.placed", message: `${customer.name} placed order ${order.orderNumber} at ${restaurant.name} (₹${order.pricing?.total})`, entityType: "order", entityId: order._id, createdAt });
    count++;
  }

  console.log(`✔ Demo data created: ${hotels.length + 1} hotels, ${riders.length + 1} riders, ${customers.length} customers, ${count} orders.`);
  console.log(`  Demo logins (password Demo@1234): manager1@${DOMAIN}, rider1@${DOMAIN}, customer1@${DOMAIN}`);
}

connectDB()
  .then(() => (process.argv.includes("--reset") ? reset() : seed()))
  .catch((e) => {
    console.error("✖", e);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
