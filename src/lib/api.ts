import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType } from "zod";
import mongoose from "mongoose";

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

type Ctx<P> = { params: Promise<P> };
type Handler<P> = (req: NextRequest, ctx: Ctx<P>) => Promise<Response>;

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Rejects cross-site state-changing requests (defence in depth on top of SameSite cookies). */
function assertSameOrigin(req: NextRequest) {
  if (!MUTATING.has(req.method)) return;
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (curl, server-to-server)
  const allowed = new Set([req.nextUrl.origin, process.env.APP_URL].filter(Boolean));
  if (!allowed.has(origin)) throw new ApiError(403, "Cross-origin request blocked");
}

/** Wraps a route handler with uniform error handling and JSON error shapes. */
export function route<P = Record<string, string>>(handler: Handler<P>): Handler<P> {
  return async (req, ctx) => {
    try {
      assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      if (err instanceof ApiError) {
        return NextResponse.json({ error: err.message, details: err.details }, { status: err.status });
      }
      if (err instanceof ZodError) {
        const first = err.issues[0];
        return NextResponse.json(
          { error: first?.message ?? "Invalid input", details: err.issues },
          { status: 422 }
        );
      }
      if (err instanceof mongoose.Error.CastError) {
        return NextResponse.json({ error: "Invalid id" }, { status: 400 });
      }
      if (err instanceof mongoose.Error.VersionError) {
        return NextResponse.json({ error: "This was just changed by someone else. Refresh and try again." }, { status: 409 });
      }
      if (err instanceof mongoose.Error.ValidationError) {
        const first = Object.values(err.errors)[0];
        return NextResponse.json({ error: first?.message ?? "Invalid data" }, { status: 422 });
      }
      if (typeof err === "object" && err && "code" in err && (err as { code: number }).code === 11000) {
        return NextResponse.json({ error: "A record with these details already exists" }, { status: 409 });
      }
      console.error("[api]", req.method, req.nextUrl.pathname, err);
      return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
    }
  };
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await req.json();
  } catch {
    throw new ApiError(400, "Request body must be valid JSON");
  }
  return schema.parse(json);
}

export function pagination(req: NextRequest, defaultLimit = 20) {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, Number(sp.get("page")) || 1);
  const limit = Math.min(100, Math.max(1, Number(sp.get("limit")) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

export function clientInfo(req: NextRequest) {
  const fwd = req.headers.get("x-forwarded-for");
  return {
    ip: fwd?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown",
    userAgent: req.headers.get("user-agent")?.slice(0, 300) || "",
  };
}

export function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function assertObjectId(id: string) {
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Invalid id");
}
