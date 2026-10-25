import mongoose, { Schema, type InferSchemaType, type HydratedDocument, type Model } from "mongoose";
import { ROLES, USER_STATUSES } from "@/lib/constants";

const pointSchema = new Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: { type: [Number], required: true }, // [lng, lat]
  },
  { _id: false }
);

const addressSchema = new Schema(
  {
    label: { type: String, trim: true, default: "Home" },
    line1: { type: String, trim: true, required: true },
    city: { type: String, trim: true },
    pincode: { type: String, trim: true },
    location: { type: pointSchema },
    isDefault: { type: Boolean, default: false },
  },
  { timestamps: false }
);

const deliveryProfileSchema = new Schema(
  {
    vehicleType: { type: String, enum: ["bicycle", "scooter", "motorbike", "ev"], default: "scooter" },
    vehicleNumber: { type: String, trim: true, uppercase: true },
    licenseNumber: { type: String, trim: true, uppercase: true },
    isOnline: { type: Boolean, default: false },
    isAvailable: { type: Boolean, default: false }, // online AND not on an active order
    currentLocation: { type: pointSchema },
    lastLocationAt: { type: Date },
    activeOrder: { type: Schema.Types.ObjectId, ref: "Order" },
    totalDeliveries: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
  },
  { _id: false }
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, required: true, default: "user", index: true },
    status: { type: String, enum: USER_STATUSES, required: true, default: "active", index: true },
    statusReason: { type: String, trim: true },
    avatar: { type: String },

    // Email ownership. `undefined` on legacy/admin-created accounts counts as verified;
    // self-registered accounts start at `false` until they enter the emailed OTP.
    emailVerified: { type: Boolean },
    emailOtpHash: { type: String, select: false },
    emailOtpExpires: { type: Date, select: false },
    emailOtpAttempts: { type: Number, default: 0, select: false },
    emailOtpSentAt: { type: Date, select: false },

    // Session / security
    tokenVersion: { type: Number, default: 0 },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date },
    lastLoginAt: { type: Date },
    lastLoginIp: { type: String },
    passwordResetTokenHash: { type: String, select: false },
    passwordResetExpires: { type: Date, select: false },

    // Role-specific
    addresses: { type: [addressSchema], default: undefined }, // customers
    restaurant: { type: Schema.Types.ObjectId, ref: "Restaurant" }, // hotel managers
    delivery: { type: deliveryProfileSchema }, // delivery partners
  },
  { timestamps: true }
);

userSchema.index({ "delivery.currentLocation": "2dsphere" });
userSchema.index({ name: "text", email: "text" });

userSchema.set("toJSON", {
  transform(_doc, ret: Record<string, unknown>) {
    delete ret.passwordHash;
    delete ret.passwordResetTokenHash;
    delete ret.passwordResetExpires;
    delete ret.emailOtpHash;
    delete ret.emailOtpExpires;
    delete ret.emailOtpAttempts;
    delete ret.emailOtpSentAt;
    delete ret.__v;
    return ret;
  },
});

export type UserFields = InferSchemaType<typeof userSchema>;
export type UserDoc = HydratedDocument<UserFields>;

export const User: Model<UserFields> =
  (mongoose.models.User as Model<UserFields>) || mongoose.model<UserFields>("User", userSchema);
