import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { RESTAURANT_STATUSES } from "@/lib/constants";

const restaurantSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, trim: true, maxlength: 1000 },
    manager: { type: Schema.Types.ObjectId, ref: "User", index: true },
    phone: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    address: {
      line1: { type: String, trim: true, required: true },
      city: { type: String, trim: true, required: true },
      state: { type: String, trim: true },
      pincode: { type: String, trim: true },
    },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    cuisines: { type: [String], default: [] },
    coverImage: { type: String },
    fssaiLicense: { type: String, trim: true },
    // The whole platform is pure-veg; this is stored so it is explicit in data exports.
    pureVeg: { type: Boolean, default: true, immutable: true },
    // False until someone actually pins the hotel on a map; customers and riders are matched by this point.
    locationConfirmed: { type: Boolean, default: false },
    isOpen: { type: Boolean, default: false },
    status: { type: String, enum: RESTAURANT_STATUSES, default: "pending", index: true },
    statusReason: { type: String, trim: true },
    avgPrepTimeMins: { type: Number, default: 20, min: 1 },
    commissionPercent: { type: Number, default: 15, min: 0, max: 100 },
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

restaurantSchema.index({ location: "2dsphere" });
restaurantSchema.index({ name: "text", "address.city": "text", cuisines: "text" });

export type RestaurantFields = InferSchemaType<typeof restaurantSchema>;

export const Restaurant: Model<RestaurantFields> =
  (mongoose.models.Restaurant as Model<RestaurantFields>) ||
  mongoose.model<RestaurantFields>("Restaurant", restaurantSchema);
