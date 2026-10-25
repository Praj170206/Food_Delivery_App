"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Banknote, Clock, CreditCard, Landmark, ShieldCheck, Smartphone, TriangleAlert, Wallet, type LucideIcon } from "lucide-react";
import { VegMark } from "@/components/brand";
import { api, ClientApiError, useApi } from "@/lib/client";
import { formatINR } from "@/lib/format";
import { Badge, Button, Card, EmptyState, LoadingBlock, Modal, Spinner, Textarea, cx, useToast } from "@/components/ui";
import { payWithRazorpay, type RazorpayOptions } from "@/components/shop/razorpay";
import { useShop, type SavedAddress } from "@/components/shop/ShopProviders";
import { AddressForm } from "@/components/shop/AddressForm";

type Quote = {
  ok: boolean;
  problems: string[];
  lines: { menuItemId: string; name: string; price: number; quantity: number; available: boolean }[];
  distanceKm: number;
  pricing: { subtotal: number; deliveryFee: number; tax: number; discount: number; total: number };
  estimatedMins: number;
  freeDeliveryAbove: number;
  minOrderValue: number;
};
type Config = {
  maintenanceMode: boolean;
  taxPercent: number;
  payments: { cod: boolean; online: { live: boolean; mode: "test" | "live" | null } };
};
type Method = "cod" | "online";

const METHODS: { id: Method; icon: LucideIcon; title: string; text: string }[] = [
  { id: "online", icon: ShieldCheck, title: "Pay online", text: "UPI, cards, wallets & netbanking - secured by Razorpay" },
  { id: "cod", icon: Banknote, title: "Cash on delivery", text: "Pay the rider in cash or UPI at your door" },
];

const ONLINE_CHANNELS: [LucideIcon, string][] = [[Smartphone, "UPI"], [CreditCard, "Cards"], [Wallet, "Wallets"], [Landmark, "Netbanking"]];

function newRequestId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export default function CheckoutPage() {
  const router = useRouter();
  const toast = useToast();
  const { cart, setQty, clearCart, location, setLocation } = useShop();
  const { data: addrData, reload: reloadAddresses, loading: addrLoading } = useApi<{ addresses: SavedAddress[] }>("/api/customer/addresses");
  const { data: config } = useApi<Config>("/api/public/config");
  const [addressId, setAddressId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [method, setMethod] = useState<Method>("cod");
  const [notes, setNotes] = useState("");
  const [placing, setPlacing] = useState(false);
  const [requestId] = useState(newRequestId);

  const addresses = useMemo(() => addrData?.addresses ?? [], [addrData]);

  // Default to the address used for browsing, else the saved default.
  useEffect(() => {
    if (addressId || !addresses.length) return;
    const pick = addresses.find((a) => a._id === location?.addressId) ?? addresses.find((a) => a.isDefault) ?? addresses[0];
    setAddressId(pick._id);
  }, [addresses, addressId, location]);

  // Re-price on the server whenever the cart or address changes.
  const cartKey = cart ? cart.items.map((i) => `${i.menuItemId}:${i.quantity}`).join(",") : "";
  useEffect(() => {
    if (!cart || !addressId) return;
    let cancelled = false;
    setQuoting(true);
    const t = setTimeout(async () => {
      try {
        const res = await api<{ quote: Quote }>("/api/customer/quote", {
          method: "POST",
          body: { restaurantId: cart.restaurantId, addressId, items: cart.items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })) },
        });
        if (!cancelled) setQuote(res.quote);
      } catch (e) {
        if (!cancelled) toast((e as Error).message, "error");
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cartKey, addressId]);

  if (!cart) {
    return (
      <Card>
        <EmptyState title="Your cart is empty" description="Add some delicious pure-veg dishes to get started." />
        <div className="flex justify-center pb-4"><Link href="/hotels" className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white">Browse hotels</Link></div>
      </Card>
    );
  }

  const isLive = (m: Method) => (m === "cod" ? !!config?.payments.cod : !!config?.payments.online?.live);
  const canPlace = !!quote?.ok && !!addressId && isLive(method) && !quoting && !placing;

  const place = async () => {
    if (!addressId) return;
    setPlacing(true);
    try {
      const res = await api<{ orderId: string; orderNumber: string; razorpay?: RazorpayOptions | null }>("/api/customer/orders", {
        method: "POST",
        body: {
          restaurantId: cart.restaurantId,
          addressId,
          items: cart.items.map((i) => ({ menuItemId: i.menuItemId, quantity: i.quantity })),
          paymentMethod: method,
          notes: notes.trim() || undefined,
          clientRequestId: requestId,
        },
      });
      if (res.razorpay) {
        // Online: the order only reaches the hotel once Razorpay confirms the payment.
        const paid = await payWithRazorpay(res.orderId, res.razorpay);
        clearCart();
        if (paid.status === "paid") toast(`Payment successful! Order ${res.orderNumber} is placed.`);
        else if (paid.status === "failed") toast(paid.message, "error");
        else toast("Payment not completed. You can pay or cancel from your order page within 30 minutes.", "error");
        router.replace(`/account/orders/${res.orderId}`);
        return;
      }
      clearCart();
      toast(`Order ${res.orderNumber} placed! Check your email for the delivery OTP.`);
      router.replace(`/account/orders/${res.orderId}`);
    } catch (e) {
      const problems = e instanceof ClientApiError ? (e.details as { problems?: string[] } | undefined)?.problems : undefined;
      toast(problems?.[0] ?? (e as Error).message, "error");
      setPlacing(false);
    }
  };

  const selected = addresses.find((a) => a._id === addressId);

  return (
    <div className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-6 lg:col-span-3">
        <Card title="1. Delivery address" action={addresses.length > 0 && <button onClick={() => setAdding(true)} className="text-xs font-medium text-brand-700 hover:underline">+ Add new</button>}>
          {addrLoading ? <LoadingBlock /> : addresses.length === 0 ? (
            <AddressForm
              onSaved={async (a) => {
                await reloadAddresses();
                setAddressId(a._id);
              }}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {addresses.map((a) => (
                <button
                  key={a._id}
                  onClick={() => {
                    setAddressId(a._id);
                    const [lng, lat] = a.location.coordinates;
                    setLocation({ lat, lng, label: `${a.label}: ${a.line1}`, addressId: a._id });
                  }}
                  className={cx("rounded-xl border p-3 text-left", addressId === a._id ? "border-brand-600 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:bg-slate-50")}
                >
                  <p className="text-sm font-semibold">{a.label}</p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{a.line1}{a.city ? `, ${a.city}` : ""}</p>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card title="2. Payment method">
          {config?.maintenanceMode && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">Ordering is paused for maintenance. Please try again in a few minutes.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {METHODS.map((m) => {
              const live = isLive(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => setMethod(m.id)}
                  className={cx("flex items-start gap-3 rounded-xl border p-3 text-left", method === m.id ? "border-brand-600 bg-brand-50 ring-2 ring-brand-100" : "border-slate-200 hover:bg-slate-50")}
                >
                  <span className={cx("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset", method === m.id ? "bg-brand-600 text-white ring-brand-700" : "bg-slate-50 text-slate-600 ring-slate-200")}><m.icon className="h-5 w-5" /></span>
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      {m.title}
                      {!live && <Badge value="pending" label={m.id === "online" ? "Unavailable" : "Off"} />}
                      {live && m.id === "online" && config?.payments.online.mode === "test" && <Badge value="info" label="Test mode" />}
                    </span>
                    <span className="block text-xs text-slate-500">{m.text}</span>
                  </span>
                </button>
              );
            })}
          </div>
          {method === "online" && (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-inset ring-slate-200/70">
              <div className="flex flex-wrap gap-2">
                {ONLINE_CHANNELS.map(([Icon, label]) => (
                  <span key={label} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs ring-1 ring-slate-200"><Icon className="h-3.5 w-3.5 text-brand-600" /> {label}</span>
                ))}
              </div>
              {isLive("online") ? (
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  You&apos;ll choose how to pay in Razorpay&apos;s secure window. Your order is sent to the hotel as soon as the payment succeeds; if anything fails, any amount debited is refunded automatically.
                  {config?.payments.online.mode === "test" && <span className="mt-1 block font-semibold text-sky-700">Test mode: no real money is charged. Use UPI ID <code>success@razorpay</code> or card 4111 1111 1111 1111.</span>}
                </p>
              ) : (
                <p className="mt-3 text-xs text-saffron-700">Online payment isn&apos;t available right now. Please choose Cash on Delivery.</p>
              )}
            </div>
          )}
        </Card>

        <Card title="3. Note for the hotel (optional)">
          <Textarea rows={2} maxLength={300} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Less spicy, no onion, extra chutney…" />
        </Card>
      </div>

      <div className="lg:col-span-2">
        <div className="lg:sticky lg:top-24">
          <Card title={<span>Order from <Link href={`/hotels/${cart.restaurantSlug}`} className="text-brand-700 hover:underline">{cart.restaurantName}</Link></span>} bodyClassName="p-0">
            <ul className="divide-y divide-slate-100">
              {cart.items.map((i) => {
                const line = quote?.lines.find((l) => l.menuItemId === i.menuItemId);
                return (
                  <li key={i.menuItemId} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className={cx("flex items-center gap-2 text-sm font-semibold", line && !line.available && "text-slate-400 line-through")}><VegMark className="h-3.5 w-3.5" /> {i.name}</p>
                      <p className="text-xs text-slate-500">{formatINR(line?.price ?? i.price)}{line && !line.available && <span className="ml-1 text-red-600">· sold out</span>}</p>
                    </div>
                    <div className="flex items-center rounded-lg border border-slate-200">
                      <button onClick={() => setQty(i.menuItemId, i.quantity - 1)} className="px-2.5 py-1 text-brand-700" aria-label="Remove one">−</button>
                      <span className="w-6 text-center text-sm font-semibold">{i.quantity}</span>
                      <button onClick={() => setQty(i.menuItemId, i.quantity + 1)} className="px-2.5 py-1 text-brand-700" aria-label="Add one">+</button>
                    </div>
                    <span className="w-16 text-right text-sm font-medium">{formatINR((line?.price ?? i.price) * i.quantity)}</span>
                  </li>
                );
              })}
            </ul>
            <div className="border-t border-slate-100 px-4 py-3 text-sm">
              {quoting && !quote ? (
                <div className="flex justify-center py-3 text-brand-600"><Spinner /></div>
              ) : quote ? (
                <dl className={cx("space-y-1.5", quoting && "opacity-50")}>
                  <div className="flex justify-between text-slate-600"><dt>Item total</dt><dd>{formatINR(quote.pricing.subtotal)}</dd></div>
                  <div className="flex justify-between text-slate-600">
                    <dt>Delivery fee ({quote.distanceKm} km)</dt>
                    <dd>{quote.pricing.deliveryFee === 0 ? <span className="text-brand-700">FREE</span> : formatINR(quote.pricing.deliveryFee)}</dd>
                  </div>
                  {quote.pricing.deliveryFee > 0 && quote.freeDeliveryAbove > 0 && quote.pricing.subtotal < quote.freeDeliveryAbove && (
                    <p className="text-xs text-brand-700">Add {formatINR(quote.freeDeliveryAbove - quote.pricing.subtotal)} more for free delivery</p>
                  )}
                  <div className="flex justify-between text-slate-600"><dt>Taxes ({config?.taxPercent ?? 5}% GST)</dt><dd>{formatINR(quote.pricing.tax)}</dd></div>
                  <div className="flex justify-between border-t border-slate-100 pt-2 text-base font-bold"><dt>To pay</dt><dd>{formatINR(quote.pricing.total)}</dd></div>
                  <p className="flex items-center gap-1.5 pt-1 text-xs font-medium text-brand-700"><Clock className="h-3.5 w-3.5" /> Arrives in about {quote.estimatedMins} min</p>
                </dl>
              ) : (
                <p className="text-xs text-slate-500">Choose an address to see delivery fee and total.</p>
              )}
              {quote?.problems.map((p) => <p key={p} className="mt-2 flex items-start gap-2 rounded-xl bg-saffron-50 px-3 py-2 text-xs font-medium text-saffron-700 ring-1 ring-inset ring-saffron-200"><TriangleAlert className="mt-px h-3.5 w-3.5 shrink-0" /> {p}</p>)}
            </div>
            <div className="border-t border-slate-100 p-4">
              <Button className="w-full py-3 text-base" disabled={!canPlace} loading={placing} onClick={place}>
                {!isLive(method) ? (method === "online" ? "Online payment unavailable - choose COD" : "Choose another payment method") : quote && !quote.ok ? (quote.problems[0]?.startsWith("Minimum order") ? `Add ${formatINR(Math.max(0, quote.minOrderValue - quote.pricing.subtotal))} more to place order` : "Fix the issue above to continue") : quote ? (method === "online" ? `Pay ${formatINR(quote.pricing.total)} securely` : `Place order · ${formatINR(quote.pricing.total)}`) : "Place order"}
              </Button>
              {selected && <p className="mt-2 text-center text-xs text-slate-500">Delivering to {selected.label}: {selected.line1}</p>}
            </div>
          </Card>
        </div>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Add delivery address" wide>
        <AddressForm
          onCancel={() => setAdding(false)}
          onSaved={async (a) => {
            await reloadAddresses();
            setAddressId(a._id);
            setAdding(false);
          }}
        />
      </Modal>
    </div>
  );
}
