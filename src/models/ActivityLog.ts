import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const SEVERITIES = ["info", "warning", "critical"] as const;
export type Severity = (typeof SEVERITIES)[number];

const activityLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: "User", index: true },
    actorName: { type: String, required: true },
    actorRole: { type: String, required: true, index: true }, // a role or "system"
    action: { type: String, required: true, index: true },
    message: { type: String, required: true },
    entityType: { type: String, index: true },
    entityId: { type: Schema.Types.ObjectId, index: true },
    meta: { type: Schema.Types.Mixed },
    severity: { type: String, enum: SEVERITIES, default: "info", index: true },
    // Users (besides admins) who should see this event live and in their own history.
    notify: { type: [Schema.Types.ObjectId], default: undefined, index: true },
    ip: { type: String },
    userAgent: { type: String },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

activityLogSchema.index({ createdAt: -1 });

export type ActivityLogFields = InferSchemaType<typeof activityLogSchema>;

export const ActivityLog: Model<ActivityLogFields> =
  (mongoose.models.ActivityLog as Model<ActivityLogFields>) ||
  mongoose.model<ActivityLogFields>("ActivityLog", activityLogSchema);
