"use client";

import type { ReactNode } from "react";
import { ToastProvider } from "@/components/ui";
import { ShopProviders } from "@/components/shop/ShopProviders";
import { ShopNavbar } from "@/components/shop/ShopNavbar";
import { LocationPicker } from "@/components/shop/LocationPicker";

export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <ShopProviders>
        <ShopNavbar />
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <LocationPicker />
      </ShopProviders>
    </ToastProvider>
  );
}
