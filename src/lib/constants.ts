export const ROLES = ["admin", "user", "delivery", "manager"] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  user: "Customer",
  delivery: "Delivery Partner",
  manager: "Hotel Manager",
};

/** Where each role lands after signing in. */
export const ROLE_HOME: Record<Role, string> = {
  admin: "/admin",
  user: "/hotels",
  delivery: "/delivery",
  manager: "/manager",
};

/** Each role signs in through its own portal; the login API rejects other roles. */
export const ROLE_LOGIN: Record<Role, string> = {
  admin: "/admin/login",
  user: "/login",
  delivery: "/delivery/login",
  manager: "/manager/login",
};

/** Public sign-in / sign-up pages (signed-in users are bounced to their home). */
export const AUTH_PAGES = ["/login", "/register", "/forgot-password", "/reset-password", "/admin/login", "/manager/login", "/manager/register", "/delivery/login", "/delivery/register"];

/** The role a sign-in / sign-up page belongs to (null for shared pages like password reset). */
export function portalOfAuthPage(path: string): Role | null {
  if (path === "/admin/login") return "admin";
  if (path.startsWith("/manager/")) return "manager";
  if (path.startsWith("/delivery/")) return "delivery";
  if (path === "/login" || path === "/register") return "user";
  return null;
}

/** Which portal to send someone to when their session ends on `path`. */
export function loginPathFor(path: string) {
  if (path.startsWith("/admin")) return ROLE_LOGIN.admin;
  if (path.startsWith("/manager")) return ROLE_LOGIN.manager;
  if (path.startsWith("/delivery")) return ROLE_LOGIN.delivery;
  return ROLE_LOGIN.user;
}

/** Signed-in-only areas and who may enter them (used by the proxy and the login redirect). */
export const PROTECTED_AREAS: { prefix: string; roles: Role[] }[] = [
  { prefix: "/admin", roles: ["admin"] },
  { prefix: "/manager", roles: ["manager"] },
  { prefix: "/delivery", roles: ["delivery"] },
  { prefix: "/account", roles: ["user"] },
  { prefix: "/checkout", roles: ["user"] },
];

/** True if `path` is a same-site path this role may be sent to after signing in. */
export function isPathAllowedForRole(path: string, role: Role) {
  if (!path.startsWith("/") || path.startsWith("//") || path.startsWith("/api")) return false;
  const area = PROTECTED_AREAS.find((a) => path === a.prefix || path.startsWith(a.prefix + "/"));
  return area ? area.roles.includes(role) : role === "user"; // public shop pages make sense for customers only
}

export const USER_STATUSES = ["active", "pending", "suspended", "rejected"] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const RESTAURANT_STATUSES = ["pending", "approved", "suspended", "rejected"] as const;
export type RestaurantStatus = (typeof RESTAURANT_STATUSES)[number];

export const ORDER_STATUSES = [
  // Online-payment orders wait here until Razorpay confirms payment; hotels never see them.
  "payment_pending",
  "placed",
  "confirmed",
  "preparing",
  "ready",
  "picked_up",
  "delivered",
  "cancelled",
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  payment_pending: "Awaiting payment",
  placed: "Placed",
  confirmed: "Confirmed",
  preparing: "Preparing",
  ready: "Ready for pickup",
  picked_up: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Orders in these states are still "live" and can be cancelled / reassigned. */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ["placed", "confirmed", "preparing", "ready", "picked_up"];

export const PAYMENT_METHODS = ["cod", "online", "upi", "card", "wallet"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"] as const;

/**
 * Every role has its own session cookie (and role-bound token), so one browser can be signed in
 * as customer, hotel manager, rider and admin at the same time without them affecting each other.
 */
export const SESSION_COOKIES: Record<Role, string> = {
  user: "gb_user",
  manager: "gb_manager",
  delivery: "gb_delivery",
  admin: "gb_admin",
};

/** Header / query param the browser uses to say which portal's session a shared endpoint should use. */
export const PORTAL_HEADER = "x-gb-portal";

export const isRole = (v: unknown): v is Role => typeof v === "string" && (ROLES as readonly string[]).includes(v);

/** The portal (role) a page path belongs to. Public shop pages belong to customers. */
export function portalForPath(path: string): Role {
  if (path.startsWith("/admin")) return "admin";
  if (path.startsWith("/manager")) return "manager";
  if (path.startsWith("/delivery")) return "delivery";
  return "user";
}
