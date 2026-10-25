import type { NextRequest } from "next/server";
import mongoose from "mongoose";
import { getSessionUser } from "@/lib/auth/session";
import { canAccessOrder } from "@/lib/auth/access";
import { Order } from "@/models/Order";
import { User } from "@/models/User";
import { isRole, ACTIVE_ORDER_STATUSES, type OrderStatus } from "@/lib/constants";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Snapshot = { status: string; riderId: string | null; location: [number, number] | null; lastLocationAt: string | null };

/**
 * Live tracking for one order (Server-Sent Events): pushes the rider's GPS position the moment it
 * is saved, plus status changes. Uses MongoDB change streams, falls back to 3s polling.
 * Only the order's customer, its hotel and admins can subscribe; the rider's position is only
 * shared while the order is in progress.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!mongoose.isValidObjectId(id)) return new Response("Not found", { status: 404 });
  const p = req.nextUrl.searchParams.get("portal");
  const portal = isRole(p) ? p : "user";
  const viewer = await getSessionUser(portal);
  if (!viewer) return new Response("Unauthorized", { status: 401 });
  const order = await Order.findById(id).select("user restaurant deliveryPartner status").lean();
  if (!order || !canAccessOrder(viewer, order)) return new Response("Not found", { status: 404 });

  const orderId = order._id;
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          cleanup();
        }
      };
      const isLive = (s: string) => ACTIVE_ORDER_STATUSES.includes(s as OrderStatus);

      let state: Snapshot = { status: order.status, riderId: order.deliveryPartner ? String(order.deliveryPartner) : null, location: null, lastLocationAt: null };
      const emitLocation = (coords: [number, number] | null | undefined, at: Date | string | null | undefined) => {
        if (!coords || !isLive(state.status)) return;
        state = { ...state, location: coords, lastLocationAt: at ? new Date(at).toISOString() : new Date().toISOString() };
        send("location", { location: state.location, lastLocationAt: state.lastLocationAt });
      };
      const loadRider = async () => {
        if (!state.riderId) return;
        const r = await User.findById(state.riderId).select("delivery.currentLocation delivery.lastLocationAt").lean();
        emitLocation(r?.delivery?.currentLocation?.coordinates as [number, number] | undefined, r?.delivery?.lastLocationAt);
      };

      // ----- change streams -----
      let riderWatch: ReturnType<typeof User.watch> | null = null;
      let orderWatch: ReturnType<typeof Order.watch> | null = null;
      let pollTimer: ReturnType<typeof setInterval> | null = null;

      const watchRider = () => {
        riderWatch?.close().catch(() => {});
        riderWatch = null;
        if (!state.riderId || pollTimer) return;
        riderWatch = User.watch([{ $match: { operationType: "update", "documentKey._id": new mongoose.Types.ObjectId(state.riderId) } }]);
        riderWatch.on("change", (c) => {
          const f = ("updateDescription" in c ? c.updateDescription?.updatedFields : undefined) as Record<string, unknown> | undefined;
          const loc = (f?.["delivery.currentLocation"] as { coordinates?: [number, number] } | undefined)?.coordinates
            ?? ((f?.delivery as { currentLocation?: { coordinates?: [number, number] } } | undefined)?.currentLocation?.coordinates);
          if (loc) emitLocation(loc, (f?.["delivery.lastLocationAt"] as Date | undefined) ?? new Date());
        });
        riderWatch.on("error", startPolling);
      };

      const onOrder = (status: string, partner: unknown) => {
        const riderId = partner ? String(partner) : null;
        const riderChanged = riderId !== state.riderId;
        if (status !== state.status || riderChanged) {
          state = { ...state, status, riderId, ...(riderChanged ? { location: null, lastLocationAt: null } : {}) };
          send("order", { status, riderId });
          if (riderChanged) {
            watchRider();
            void loadRider();
          }
        }
        if (!isLive(status) && status !== "payment_pending") setTimeout(cleanup, 1000); // delivered / cancelled: done
      };

      function startPolling() {
        if (pollTimer || closed) return;
        riderWatch?.close().catch(() => {});
        orderWatch?.close().catch(() => {});
        riderWatch = orderWatch = null;
        send("mode", { mode: "polling" });
        pollTimer = setInterval(async () => {
          try {
            const o = await Order.findById(orderId).select("status deliveryPartner").lean();
            if (o) onOrder(o.status, o.deliveryPartner);
            if (state.riderId) {
              const r = await User.findById(state.riderId).select("delivery.currentLocation delivery.lastLocationAt").lean();
              const at = r?.delivery?.lastLocationAt ? new Date(r.delivery.lastLocationAt).toISOString() : null;
              if (at && at !== state.lastLocationAt) emitLocation(r?.delivery?.currentLocation?.coordinates as [number, number], at);
            }
          } catch {}
        }, 3000);
      }

      try {
        orderWatch = Order.watch([{ $match: { "documentKey._id": orderId, operationType: { $in: ["update", "replace"] } } }], { fullDocument: "updateLookup" });
        orderWatch.on("change", (c) => {
          const doc = "fullDocument" in c ? (c.fullDocument as { status: string; deliveryPartner?: unknown } | undefined) : undefined;
          if (doc) onOrder(doc.status, doc.deliveryPartner);
        });
        orderWatch.on("error", startPolling);
        watchRider();
        send("mode", { mode: "realtime" });
      } catch {
        startPolling();
      }

      send("order", { status: state.status, riderId: state.riderId });
      void loadRider();

      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          cleanup();
        }
      }, 20000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        if (pollTimer) clearInterval(pollTimer);
        riderWatch?.close().catch(() => {});
        orderWatch?.close().catch(() => {});
        try {
          controller.close();
        } catch {}
      };
      req.signal.addEventListener("abort", cleanup);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" },
  });
}
