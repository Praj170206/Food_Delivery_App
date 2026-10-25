/** The fields of an activity entry a non-admin may see (no IPs, user agents, internal meta or other actors' ids). */
export function publicActivity(d: Record<string, unknown>) {
  return {
    _id: d._id,
    action: d.action,
    message: d.message,
    entityType: d.entityType,
    entityId: d.entityId,
    severity: d.severity,
    actorRole: d.actorRole,
    createdAt: d.createdAt,
  };
}
