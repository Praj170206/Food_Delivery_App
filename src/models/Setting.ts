import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

// Single document (key: "platform") holding platform-wide configuration.
const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: "platform" },
    platformName: { type: String, default: "GreenBite" },
    supportEmail: { type: String, default: "support@greenbite.app" },
    supportPhone: { type: String, default: "" },
    delivery: {
      baseFee: { type: Number, default: 25, min: 0 },
      perKmFee: { type: Number, default: 6, min: 0 },
      freeDeliveryAbove: { type: Number, default: 499, min: 0 },
      maxDeliveryRadiusKm: { type: Number, default: 10, min: 1 },
      assignmentRadiusKm: { type: Number, default: 5, min: 1 },
      autoAssign: { type: Boolean, default: true },
    },
    taxPercent: { type: Number, default: 5, min: 0, max: 50 },
    minOrderValue: { type: Number, default: 99, min: 0 },
    otpLength: { type: Number, default: 4, enum: [4, 6] },
    maxOtpAttempts: { type: Number, default: 5, min: 1 },
    payments: {
      cod: { type: Boolean, default: true },
      upi: { type: Boolean, default: false },
      card: { type: Boolean, default: false },
      wallet: { type: Boolean, default: false },
      gatewayProvider: { type: String, enum: ["none", "razorpay", "stripe", "cashfree"], default: "none" },
    },
    registration: {
      customersOpen: { type: Boolean, default: true },
      managersOpen: { type: Boolean, default: true },
      deliveryOpen: { type: Boolean, default: true },
    },
    maintenanceMode: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export type SettingFields = InferSchemaType<typeof settingSchema>;

export const Setting: Model<SettingFields> =
  (mongoose.models.Setting as Model<SettingFields>) || mongoose.model<SettingFields>("Setting", settingSchema);

export async function getSettings() {
  return Setting.findOneAndUpdate(
    { key: "platform" },
    { $setOnInsert: { key: "platform" } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}
