import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES, ROLES } from "@/lib/constants";

const orderItemSchema = new Schema(
  {
    menuItem: { type: Schema.Types.ObjectId, ref: "MenuItem" },
    name: { type: String, required: true },
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const timelineSchema = new Schema(
  {
    status: { type: String, required: true }, // an order status or an event like "partner_assigned"
    note: { type: String },
    by: { type: Schema.Types.ObjectId, ref: "User" },
    byRole: { type: String, enum: [...ROLES, "system"] },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    restaurant: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    deliveryPartner: { type: Schema.Types.ObjectId, ref: "User", index: true },
    items: { type: [orderItemSchema], validate: (v: unknown[]) => v.length > 0 },
    pricing: {
      subtotal: { type: Number, required: true },
      deliveryFee: { type: Number, default: 0 },
      tax: { type: Number, default: 0 },
      discount: { type: Number, default: 0 },
      total: { type: Number, required: true },
    },
    deliveryAddress: {
      line1: { type: String, required: true },
      city: { type: String },
      pincode: { type: String },
      location: {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: { type: [Number], required: true },
      },
    },
    status: { type: String, enum: ORDER_STATUSES, default: "placed", index: true },
    payment: {
      method: { type: String, enum: PAYMENT_METHODS, default: "cod" },
      status: { type: String, enum: PAYMENT_STATUSES, default: "pending" },
      transactionId: { type: String }, // Razorpay payment id
      provider: { type: String, enum: ["razorpay"] },
      gatewayOrderId: { type: String, index: true }, // Razorpay order id
      channel: { type: String }, // upi / card / wallet / netbanking (as reported by the gateway)
      paidAt: { type: Date },
      refundId: { type: String },
      refundedAt: { type: Date },
    },
    // OTP the customer shares with the rider at handover: a hash to verify it, and an
    // encrypted copy so only the customer can see it again in their app.
    deliveryOtpHash: { type: String, select: false },
    deliveryOtpEnc: { type: String, select: false },
    // Client-generated key so a double-tapped "Place order" can't create two orders.
    clientRequestId: { type: String },
    otpAttempts: { type: Number, default: 0 },
    distanceKm: { type: Number },
    assignedAt: { type: Date },
    pickedUpAt: { type: Date },
    deliveredAt: { type: Date },
    estimatedDeliveryAt: { type: Date },
    cancellation: {
      reason: { type: String },
      by: { type: Schema.Types.ObjectId, ref: "User" },
      byRole: { type: String },
      at: { type: Date },
    },
    timeline: { type: [timelineSchema], default: [] },
    notes: { type: String, maxlength: 300 },
  },
  { timestamps: true }
);

orderSchema.index({ createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index(
  { user: 1, clientRequestId: 1 },
  { unique: true, partialFilterExpression: { clientRequestId: { $type: "string" } } }
);

export type OrderFields = InferSchemaType<typeof orderSchema>;

export const Order: Model<OrderFields> =
  (mongoose.models.Order as Model<OrderFields>) || mongoose.model<OrderFields>("Order", orderSchema);
