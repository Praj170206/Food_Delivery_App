import "server-only";
import type { NextRequest } from "next/server";
import { ActivityLog } from "@/models/ActivityLog";
import { User, type UserDoc } from "@/models/User";

type Doc = Record<string, unknown> & { createdAt?: Date };

/**
 * Server-Sent Events feed of new activity-log entries.
 * - `match` is a Mongo filter on the activity document (applied to both the change stream and the polling fallback),
 *   which is how each role only ever receives events addressed to them.
 * - Uses a MongoDB change stream (Atlas / replica sets) and falls back to polling otherwise.
 * - Re-checks the account every 30s; a suspended / signed-out user's stream is closed.
 */
export function activityStream(req: NextRequest, user: UserDoc, match: Record<string, unknown>, project?: (d: Doc) => unknown) {
  const encoder = new TextEncoder();
  const shape = project ?? ((d: Doc): unknown => d);
  let cleanup = () => {};

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const write = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const send = (event: string, data: unknown) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      let pollTimer: ReturnType<typeof setInterval> | null = null;
      let lastSeen = new Date();
      const startPolling = () => {
        if (pollTimer || closed) return;
        send("mode", { mode: "polling" });
        pollTimer = setInterval(async () => {
          try {
            const fresh = await ActivityLog.find({ ...match, createdAt: { $gt: lastSeen } }).sort({ createdAt: 1 }).limit(100).lean<Doc[]>();
            for (const doc of fresh) {
              lastSeen = doc.createdAt as Date;
              send("activity", shape(doc));
            }
          } catch (e) {
            console.error("[realtime] poll failed", e);
          }
        }, 3000);
      };

      // Change-stream filters address the inserted document via `fullDocument.`.
      // (`match` holds plain field conditions only, no top-level $-operators.)
      const csMatch = Object.fromEntries(Object.entries(match).map(([k, v]) => [`fullDocument.${k}`, v]));
      let changeStream: ReturnType<typeof ActivityLog.watch> | null = null;
      try {
        changeStream = ActivityLog.watch([{ $match: { operationType: "insert", ...csMatch } }]);
        changeStream.on("change", (change) => {
          if ("fullDocument" in change && change.fullDocument) send("activity", shape(change.fullDocument as Doc));
        });
        changeStream.on("error", () => {
          changeStream?.close().catch(() => {});
          changeStream = null;
          startPolling();
        });
        send("mode", { mode: "realtime" });
      } catch {
        startPolling();
      }

      const heartbeat = setInterval(() => write(": ping\n\n"), 20000);

      // Authorization doesn't stop at connect time.
      const recheck = setInterval(async () => {
        try {
          const fresh = await User.findById(user._id).select("status tokenVersion role").lean();
          if (!fresh || fresh.status !== "active" || fresh.tokenVersion !== user.tokenVersion || fresh.role !== user.role) {
            send("session_ended", { reason: "Your session has ended. Please sign in again." });
            cleanup();
          }
        } catch {}
      }, 30000);

      cleanup = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearInterval(recheck);
        if (pollTimer) clearInterval(pollTimer);
        changeStream?.close().catch(() => {});
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
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
