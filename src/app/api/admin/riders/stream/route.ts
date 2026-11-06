import type { NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { User } from "@/models/User";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RiderPing = {
  id: string;
  location: [number, number] | null; // [lng, lat]
  at: string | null;
  isOnline: boolean;
  isAvailable: boolean;
  busy: boolean;
};

type RiderDoc = {
  _id: unknown;
  delivery?: { currentLocation?: { coordinates?: number[] }; lastLocationAt?: Date; isOnline?: boolean; isAvailable?: boolean; activeOrder?: unknown };
};

const toPing = (d: RiderDoc): RiderPing => ({
  id: String(d._id),
  location: d.delivery?.currentLocation?.coordinates?.length === 2 ? (d.delivery.currentLocation.coordinates as [number, number]) : null,
  at: d.delivery?.lastLocationAt ? new Date(d.delivery.lastLocationAt).toISOString() : null,
  isOnline: !!d.delivery?.isOnline,
  isAvailable: !!d.delivery?.isAvailable,
  busy: !!d.delivery?.activeOrder,
});

/**
 * Live fleet feed for the admin map (Server-Sent Events): every rider's GPS fix and online /
 * available state, pushed the moment it's saved (MongoDB change stream; 3 s polling fallback).
 */
export async function GET(req: NextRequest) {
  const admin = await getSessionUser("admin");
  if (!admin) return new Response("Unauthorized", { status: 401 });

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

      let watch: ReturnType<typeof User.watch> | null = null;
      let poll: ReturnType<typeof setInterval> | null = null;

      const startPolling = () => {
        if (poll || closed) return;
        watch?.close().catch(() => {});
        watch = null;
        send("mode", { mode: "polling" });
        let since = new Date(Date.now() - 5000);
        poll = setInterval(async () => {
          try {
            const from = since;
            since = new Date();
            const docs = await User.find({ role: "delivery", updatedAt: { $gte: from } }).select("delivery").lean<RiderDoc[]>();
            for (const d of docs) send("rider", toPing(d));
          } catch {}
        }, 3000);
      };

      try {
        watch = User.watch(
          [
            { $match: { operationType: { $in: ["update", "replace"] }, "fullDocument.role": "delivery" } },
            { $project: { "fullDocument._id": 1, "fullDocument.delivery": 1 } },
          ],
          { fullDocument: "updateLookup" }
        );
        watch.on("change", (c) => {
          const doc = (c as { fullDocument?: RiderDoc }).fullDocument;
          if (doc) send("rider", toPing(doc));
        });
        watch.on("error", startPolling);
        send("mode", { mode: "realtime" });
      } catch {
        startPolling();
      }

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
        if (poll) clearInterval(poll);
        watch?.close().catch(() => {});
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
