import mongoose from "mongoose";
import { Restaurant } from "@/models/Restaurant";
import { MenuItem } from "@/models/MenuItem";
import { getSettings } from "@/models/Setting";
import { haversineKm } from "@/lib/geo";

export type CartLine = { menuItemId: string; quantity: number };

export type Quote = {
  ok: boolean;
  problems: string[]; // human-readable reasons the order can't be placed as-is
  restaurant: { _id: string; name: string; isOpen: boolean; avgPrepTimeMins: number } | null;
  lines: { menuItemId: string; name: string; price: number; quantity: number; available: boolean }[];
  distanceKm: number;
  pricing: { subtotal: number; deliveryFee: number; tax: number; discount: number; total: number };
  estimatedMins: number;
  minOrderValue: number;
  freeDeliveryAbove: number;
};

export const estimateMins = (prep: number, km: number) => Math.round(prep + km * 4 + 5);

/**
 * The single source of truth for what an order costs. Prices always come from the
 * database (never from the client), and every rule the admin configured is applied here.
 */
export async function buildQuote(restaurantId: string, cart: CartLine[], dest: [number, number]): Promise<Quote> {
  const settings = await getSettings();
  const problems: string[] = [];
  const d = settings.delivery!;

  const restaurant = mongoose.isValidObjectId(restaurantId) ? await Restaurant.findById(restaurantId) : null;
  const empty: Quote = {
    ok: false,
    problems: ["This hotel is not available"],
    restaurant: null,
    lines: [],
    distanceKm: 0,
    pricing: { subtotal: 0, deliveryFee: 0, tax: 0, discount: 0, total: 0 },
    estimatedMins: 0,
    minOrderValue: settings.minOrderValue,
    freeDeliveryAbove: d.freeDeliveryAbove,
  };
  if (!restaurant || restaurant.status !== "approved") return empty;

  if (settings.maintenanceMode) problems.push("We're doing some maintenance. Ordering is paused for a few minutes.");
  if (!restaurant.isOpen) problems.push(`${restaurant.name} is closed right now`);

  const distanceKm = Math.round(haversineKm(restaurant.location!.coordinates as [number, number], dest) * 10) / 10;
  if (distanceKm > d.maxDeliveryRadiusKm) problems.push(`This address is ${distanceKm} km away - ${restaurant.name} delivers up to ${d.maxDeliveryRadiusKm} km`);

  // Merge duplicate lines, then load real prices.
  const qty = new Map<string, number>();
  for (const l of cart) qty.set(l.menuItemId, Math.min(20, (qty.get(l.menuItemId) ?? 0) + l.quantity));
  const items = await MenuItem.find({ _id: { $in: [...qty.keys()].filter((id) => mongoose.isValidObjectId(id)) }, restaurant: restaurant._id }).lean();
  const byId = new Map(items.map((i) => [String(i._id), i]));

  const lines: Quote["lines"] = [];
  for (const [id, quantity] of qty) {
    const item = byId.get(id);
    if (!item) {
      problems.push("An item in your cart is no longer on the menu");
      continue;
    }
    const available = item.isAvailable && !item.isBlocked;
    if (!available) problems.push(`${item.name} is sold out`);
    lines.push({ menuItemId: id, name: item.name, price: item.price, quantity, available });
  }
  if (!lines.length) problems.push("Your cart is empty");

  const subtotal = lines.filter((l) => l.available).reduce((s, l) => s + l.price * l.quantity, 0);
  if (subtotal > 0 && subtotal < settings.minOrderValue) problems.push(`Minimum order is ₹${settings.minOrderValue}. Add ₹${settings.minOrderValue - subtotal} more.`);

  const free = d.freeDeliveryAbove > 0 && subtotal >= d.freeDeliveryAbove;
  const deliveryFee = free ? 0 : Math.round(d.baseFee + distanceKm * d.perKmFee);
  const tax = Math.round((subtotal * settings.taxPercent) / 100);

  return {
    ok: problems.length === 0,
    problems: [...new Set(problems)],
    restaurant: { _id: String(restaurant._id), name: restaurant.name, isOpen: restaurant.isOpen, avgPrepTimeMins: restaurant.avgPrepTimeMins },
    lines,
    distanceKm,
    pricing: { subtotal, deliveryFee, tax, discount: 0, total: subtotal + deliveryFee + tax },
    estimatedMins: estimateMins(restaurant.avgPrepTimeMins, distanceKm),
    minOrderValue: settings.minOrderValue,
    freeDeliveryAbove: d.freeDeliveryAbove,
  };
}
