import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { connectDB } from "@/lib/db";
import { getSettings } from "@/models/Setting";
import { onlinePaymentsLive, gatewayStatus } from "@/lib/payments";

/** Customer-safe subset of platform settings (no internal config). */
export const GET = route(async () => {
  await connectDB();
  const s = await getSettings();
  return NextResponse.json({
    platformName: s.platformName,
    supportEmail: s.supportEmail,
    supportPhone: s.supportPhone,
    maintenanceMode: s.maintenanceMode,
    minOrderValue: s.minOrderValue,
    taxPercent: s.taxPercent,
    delivery: { baseFee: s.delivery?.baseFee, perKmFee: s.delivery?.perKmFee, freeDeliveryAbove: s.delivery?.freeDeliveryAbove, maxDeliveryRadiusKm: s.delivery?.maxDeliveryRadiusKm },
    payments: {
      cod: !!s.payments?.cod,
      // Razorpay Checkout (UPI, cards, wallets, netbanking) - live only when enabled AND keys are set.
      online: { live: await onlinePaymentsLive(), mode: gatewayStatus().mode },
    },
  });
});
