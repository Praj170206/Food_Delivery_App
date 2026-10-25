import { NextResponse } from "next/server";
import { route, parseBody, ApiError, clientInfo } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { User } from "@/models/User";
import { Restaurant } from "@/models/Restaurant";
import { getSettings } from "@/models/Setting";
import { registerSchema } from "@/lib/validators";
import { hashPassword } from "@/lib/auth/password";
import { issueEmailOtp } from "@/lib/auth/emailOtp";
import { rateLimit } from "@/lib/rateLimit";
import { logActivity } from "@/lib/audit";
import { uniqueRestaurantSlug } from "@/lib/slug";
import { ROLE_LABELS } from "@/lib/constants";


export const POST = route(async (req) => {
  const { ip } = clientInfo(req);
  const limit = rateLimit(`register:${ip}`, 10, 60 * 60 * 1000);
  if (!limit.ok) throw new ApiError(429, "Too many sign-ups from this network. Try again later.");

  const body = await parseBody(req, registerSchema);
  await connectDB();

  const settings = await getSettings();
  const open = {
    user: settings.registration?.customersOpen,
    manager: settings.registration?.managersOpen,
    delivery: settings.registration?.deliveryOpen,
  }[body.role];
  if (!open) throw new ApiError(403, `${ROLE_LABELS[body.role]} registration is currently closed`);

  if (await User.exists({ email: body.email })) throw new ApiError(409, "An account with this email already exists");

  // Customers are active immediately; hotel managers and delivery partners need admin approval.
  const needsApproval = body.role !== "user";
  const user = new User({
    name: body.name,
    email: body.email,
    phone: body.phone,
    role: body.role,
    status: needsApproval ? "pending" : "active",
    emailVerified: false, // no session until the emailed OTP is entered
    passwordHash: await hashPassword(body.password),
  });

  if (body.role === "delivery") {
    user.delivery = {
      vehicleType: body.vehicleType,
      vehicleNumber: body.vehicleNumber,
      licenseNumber: body.licenseNumber,
      isOnline: false,
      isAvailable: false,
      totalDeliveries: 0,
      rating: 0,
    };
  }

  let restaurant = null;
  if (body.role === "manager") {
    const r = body.restaurant;
    restaurant = new Restaurant({
      name: r.name,
      slug: await uniqueRestaurantSlug(r.name),
      manager: user._id,
      phone: body.phone,
      email: body.email,
      address: { line1: r.line1, city: r.city, pincode: r.pincode },
      location: { type: "Point", coordinates: r.coordinates },
      locationConfirmed: true,
      fssaiLicense: r.fssaiLicense,
      status: "pending",
    });
    await restaurant.validate();
    user.restaurant = restaurant._id;
  }

  await user.save();
  if (restaurant) {
    try {
      await restaurant.save();
    } catch (err) {
      await User.deleteOne({ _id: user._id }); // keep user + restaurant creation all-or-nothing
      throw err;
    }
  }

  await logActivity({
    actor: user,
    action: "auth.registered",
    message: `${user.name} registered as ${ROLE_LABELS[user.role]}${needsApproval ? " (awaiting approval)" : ""}`,
    entityType: "user",
    entityId: user._id,
    severity: needsApproval ? "warning" : "info",
    meta: { role: user.role },
    req,
  });

  await issueEmailOtp(user);
  return NextResponse.json(
    { verifyEmail: true, email: user.email, message: `We sent a 6-digit code to ${user.email}.` },
    { status: 201 }
  );
});
