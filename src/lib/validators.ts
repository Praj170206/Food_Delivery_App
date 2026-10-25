import { z } from "zod";
import { passwordSchema } from "@/lib/auth/password";
import { ORDER_STATUSES, RESTAURANT_STATUSES, ROLES, USER_STATUSES } from "@/lib/constants";

const email = z.string().trim().toLowerCase().email("Enter a valid email address").max(120);
const phone = z
  .string()
  .trim()
  .regex(/^[+0-9][0-9\s-]{7,15}$/, "Enter a valid phone number");
const objectId = z.string().regex(/^[a-f\d]{24}$/i, "Invalid id");
const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Password is required").max(72),
  /** The portal the request came from; only that role may sign in there. */
  portal: z.enum(ROLES).default("user"),
});

export const registerSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("user"),
    name: z.string().trim().min(2, "Name is too short").max(80),
    email,
    phone,
    password: passwordSchema,
  }),
  z.object({
    role: z.literal("manager"),
    name: z.string().trim().min(2, "Name is too short").max(80),
    email,
    phone,
    password: passwordSchema,
    restaurant: z.object({
      name: z.string().trim().min(2, "Restaurant name is required").max(120),
      line1: z.string().trim().min(3, "Address is required").max(200),
      city: z.string().trim().min(2, "City is required").max(60),
      pincode: z.string().trim().max(10).optional(),
      fssaiLicense: z.string().trim().max(20).optional(),
      coordinates: lngLat, // required: a real map pin, never a default
    }),
  }),
  z.object({
    role: z.literal("delivery"),
    name: z.string().trim().min(2, "Name is too short").max(80),
    email,
    phone,
    password: passwordSchema,
    vehicleType: z.enum(["bicycle", "scooter", "motorbike", "ev"]),
    vehicleNumber: z.string().trim().max(15).optional(),
    licenseNumber: z.string().trim().max(20).optional(),
  }),
]);

export const forgotPasswordSchema = z.object({ email });
export const verifyEmailSchema = z.object({ email, otp: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") });
export const resendOtpSchema = z.object({ email });
export const resetPasswordSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: passwordSchema,
});

// ---------- Admin ----------

export const adminCreateUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email,
  phone: phone.optional().or(z.literal("")),
  role: z.enum(ROLES),
  password: passwordSchema,
});

export const adminUpdateUserSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  phone: phone.optional().or(z.literal("")),
  role: z.enum(ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  reason: z.string().trim().max(300).optional(),
  forceLogout: z.boolean().optional(),
  verifyEmail: z.literal(true).optional(),
});

export const adminCreateRestaurantSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional(),
  manager: objectId.optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  line1: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(60),
  state: z.string().trim().max(60).optional(),
  pincode: z.string().trim().max(10).optional(),
  coordinates: lngLat,
  cuisines: z.array(z.string().trim().min(1).max(40)).max(15).default([]),
  fssaiLicense: z.string().trim().max(20).optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
  status: z.enum(RESTAURANT_STATUSES).default("approved"),
});

export const adminUpdateRestaurantSchema = z.object({
  status: z.enum(RESTAURANT_STATUSES).optional(),
  reason: z.string().trim().max(300).optional(),
  commissionPercent: z.number().min(0).max(100).optional(),
  manager: objectId.nullable().optional(),
  isOpen: z.boolean().optional(),
});

export const adminMenuItemModerationSchema = z.object({
  isBlocked: z.boolean(),
  reason: z.string().trim().max(300).optional(),
});

export const adminOrderActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), reason: z.string().trim().min(3, "Give a reason").max(300) }),
  z.object({ action: z.literal("assign"), partnerId: objectId }),
  z.object({ action: z.literal("unassign"), reason: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("status"), status: z.enum(ORDER_STATUSES), note: z.string().trim().max(300).optional() }),
  z.object({ action: z.literal("refund"), note: z.string().trim().max(300).optional() }),
]);

// ---------- Hotel manager ----------

const imageUrl = z.string().trim().url("Enter a valid image URL").max(500).refine((u) => u.startsWith("https://"), "Image URL must use https");

export const managerRestaurantSchema = z.object({
  description: z.string().trim().max(1000).optional(),
  phone: z.string().trim().max(20).optional(),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal("")),
  line1: z.string().trim().min(3, "Address is required").max(200),
  city: z.string().trim().min(2, "City is required").max(60),
  state: z.string().trim().max(60).optional(),
  pincode: z.string().trim().max(10).optional(),
  coordinates: lngLat,
  cuisines: z.array(z.string().trim().min(1).max(40)).max(15),
  avgPrepTimeMins: z.number().int().min(5, "Prep time must be at least 5 minutes").max(120),
  fssaiLicense: z.string().trim().max(20).optional(),
  coverImage: imageUrl.optional().or(z.literal("")),
});

export const managerOpenSchema = z.object({ isOpen: z.boolean() });

export const menuItemSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  description: z.string().trim().max(500).optional().default(""),
  category: z.string().trim().min(2, "Category is required").max(40),
  price: z.number().min(1, "Price must be at least ₹1").max(100000),
  image: imageUrl.optional().or(z.literal("")),
  isJain: z.boolean().default(false),
  isVegan: z.boolean().default(false),
  spiceLevel: z.enum(["mild", "medium", "hot"]).default("medium"),
  isAvailable: z.boolean().default(true),
});
export const menuItemUpdateSchema = menuItemSchema.partial();

export const managerOrderActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("accept"), prepMins: z.number().int().min(5).max(120).optional() }),
  z.object({ action: z.literal("reject"), reason: z.string().trim().min(3, "Tell the customer why").max(300) }),
  z.object({ action: z.literal("preparing") }),
  z.object({ action: z.literal("ready") }),
]);

// ---------- Customer ----------

export const addressSchema = z.object({
  label: z.string().trim().min(1).max(30).default("Home"),
  line1: z.string().trim().min(5, "Enter your full address (house no., street, landmark)").max(200),
  city: z.string().trim().max(60).optional(),
  pincode: z.string().trim().max(10).optional(),
  coordinates: lngLat,
  isDefault: z.boolean().optional(),
});

const cartLines = z
  .array(z.object({ menuItemId: objectId, quantity: z.number().int().min(1).max(20) }))
  .min(1, "Your cart is empty")
  .max(50, "Too many different items in one order");

export const quoteSchema = z.object({
  restaurantId: objectId,
  items: cartLines,
  addressId: objectId.optional(),
  coordinates: lngLat.optional(),
});

export const placeOrderSchema = z.object({
  restaurantId: objectId,
  items: cartLines,
  addressId: objectId,
  paymentMethod: z.enum(["cod", "online"]),
  notes: z.string().trim().max(300).optional(),
  clientRequestId: z.string().regex(/^[A-Za-z0-9-]{8,64}$/, "Invalid request id"),
});

export const customerCancelSchema = z.object({ reason: z.string().trim().max(300).optional() });

// ---------- Delivery partner ----------

export const riderStatusSchema = z.object({ online: z.boolean(), coordinates: lngLat.optional() });
export const riderLocationSchema = z.object({ coordinates: lngLat, accuracy: z.number().min(0).max(100000).optional() });
export const deliverSchema = z.object({ otp: z.string().trim().regex(/^\d{4,6}$/, "Enter the customer's 4-6 digit code") });

export const settingsSchema = z.object({
  platformName: z.string().trim().min(2).max(60),
  supportEmail: email,
  supportPhone: z.string().trim().max(20).optional().default(""),
  delivery: z.object({
    baseFee: z.number().min(0).max(1000),
    perKmFee: z.number().min(0).max(200),
    freeDeliveryAbove: z.number().min(0).max(100000),
    maxDeliveryRadiusKm: z.number().min(1).max(50),
    assignmentRadiusKm: z.number().min(1).max(50),
    autoAssign: z.boolean(),
  }),
  taxPercent: z.number().min(0).max(50),
  minOrderValue: z.number().min(0).max(10000),
  otpLength: z.union([z.literal(4), z.literal(6)]),
  maxOtpAttempts: z.number().int().min(1).max(10),
  payments: z.object({
    cod: z.boolean(),
    upi: z.boolean(),
    card: z.boolean(),
    wallet: z.boolean(),
    gatewayProvider: z.enum(["none", "razorpay", "stripe", "cashfree"]),
  }),
  registration: z.object({
    customersOpen: z.boolean(),
    managersOpen: z.boolean(),
    deliveryOpen: z.boolean(),
  }),
  maintenanceMode: z.boolean(),
});
