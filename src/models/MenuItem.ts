import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const menuItemSchema = new Schema(
  {
    restaurant: { type: Schema.Types.ObjectId, ref: "Restaurant", required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 500 },
    category: { type: String, trim: true, default: "Main Course" },
    price: { type: Number, required: true, min: 0 },
    image: { type: String },
    // Veg-only platform: a non-veg item can never be saved.
    isVeg: {
      type: Boolean,
      default: true,
      validate: { validator: (v: boolean) => v === true, message: "Only vegetarian items are allowed" },
    },
    isJain: { type: Boolean, default: false },
    isVegan: { type: Boolean, default: false },
    spiceLevel: { type: String, enum: ["mild", "medium", "hot"], default: "medium" },
    isAvailable: { type: Boolean, default: true }, // toggled by the hotel manager
    isBlocked: { type: Boolean, default: false }, // moderation by admin
    blockReason: { type: String, trim: true },
  },
  { timestamps: true }
);

menuItemSchema.index({ name: "text", description: "text", category: "text" });

export type MenuItemFields = InferSchemaType<typeof menuItemSchema>;

export const MenuItem: Model<MenuItemFields> =
  (mongoose.models.MenuItem as Model<MenuItemFields>) || mongoose.model<MenuItemFields>("MenuItem", menuItemSchema);
