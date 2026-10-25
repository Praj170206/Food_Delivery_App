"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "@/lib/client";
import type { Role } from "@/lib/constants";

// ---------- storage (per-device conveniences; the server is always the source of truth) ----------

function load<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function save(key: string, value: unknown) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

// ---------- session ----------

export type Me = { _id: string; name: string; email: string; role: Role; addresses?: SavedAddress[] } | null;
export type SavedAddress = { _id: string; label: string; line1: string; city?: string; pincode?: string; location: { coordinates: [number, number] }; isDefault?: boolean };

// ---------- location ----------

export type DeliveryLocation = { lat: number; lng: number; label: string; addressId?: string };

// ---------- cart ----------

export type CartItem = { menuItemId: string; name: string; price: number; quantity: number };
export type Cart = { restaurantId: string; restaurantSlug: string; restaurantName: string; items: CartItem[] } | null;

type ShopCtx = {
  me: Me;
  meLoaded: boolean;
  refreshMe: () => Promise<void>;
  location: DeliveryLocation | null;
  setLocation: (l: DeliveryLocation | null) => void;
  pickerOpen: boolean;
  setPickerOpen: (v: boolean) => void;
  cart: Cart;
  cartCount: number;
  cartTotal: number;
  /** Returns false if the cart holds another hotel's items (caller asks before replacing). */
  add: (hotel: { _id: string; slug: string; name: string }, item: Omit<CartItem, "quantity">, force?: boolean) => boolean;
  setQty: (menuItemId: string, qty: number) => void;
  clearCart: () => void;
};

const Ctx = createContext<ShopCtx | null>(null);
export const useShop = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useShop must be used inside <ShopProviders>");
  return c;
};

export function ShopProviders({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me>(null);
  const [meLoaded, setMeLoaded] = useState(false);
  const [location, setLocationState] = useState<DeliveryLocation | null>(null);
  const [cart, setCart] = useState<Cart>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setLocationState(load<DeliveryLocation>("gb_location"));
    setCart(load<Cart>("gb_cart"));
  }, []);

  const refreshMe = useCallback(async () => {
    try {
      const res = await api<{ user: NonNullable<Me> }>("/api/auth/me");
      setMe(res.user);
    } catch {
      setMe(null);
    } finally {
      setMeLoaded(true);
    }
  }, []);
  useEffect(() => {
    void refreshMe();
  }, [refreshMe]);

  const setLocation = useCallback((l: DeliveryLocation | null) => {
    setLocationState(l);
    save("gb_location", l);
  }, []);

  const writeCart = useCallback((c: Cart) => {
    const next = c && c.items.length ? c : null;
    setCart(next);
    save("gb_cart", next);
  }, []);

  const add: ShopCtx["add"] = (hotel, item, force) => {
    if (cart && cart.restaurantId !== hotel._id && !force) return false;
    const base: NonNullable<Cart> = cart && cart.restaurantId === hotel._id ? cart : { restaurantId: hotel._id, restaurantSlug: hotel.slug, restaurantName: hotel.name, items: [] };
    const existing = base.items.find((i) => i.menuItemId === item.menuItemId);
    const items = existing
      ? base.items.map((i) => (i.menuItemId === item.menuItemId ? { ...i, quantity: Math.min(20, i.quantity + 1) } : i))
      : [...base.items, { ...item, quantity: 1 }];
    writeCart({ ...base, items });
    return true;
  };
  const setQty = (menuItemId: string, qty: number) => {
    if (!cart) return;
    writeCart({ ...cart, items: cart.items.map((i) => (i.menuItemId === menuItemId ? { ...i, quantity: Math.min(20, qty) } : i)).filter((i) => i.quantity > 0) });
  };

  const { cartCount, cartTotal } = useMemo(
    () => ({
      cartCount: cart?.items.reduce((n, i) => n + i.quantity, 0) ?? 0,
      cartTotal: cart?.items.reduce((n, i) => n + i.quantity * i.price, 0) ?? 0,
    }),
    [cart]
  );

  return (
    <Ctx.Provider
      value={{ me, meLoaded, refreshMe, location, setLocation, pickerOpen, setPickerOpen, cart, cartCount, cartTotal, add, setQty, clearCart: () => writeCart(null) }}
    >
      {children}
    </Ctx.Provider>
  );
}
