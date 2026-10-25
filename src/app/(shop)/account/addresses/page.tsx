"use client";

import { useState } from "react";
import { api, useApi } from "@/lib/client";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorBlock, LoadingBlock, useToast } from "@/components/ui";
import { AddressForm } from "@/components/shop/AddressForm";
import { useShop, type SavedAddress } from "@/components/shop/ShopProviders";

export default function AddressesPage() {
  const toast = useToast();
  const { refreshMe, location, setLocation } = useShop();
  const { data, error, loading, reload } = useApi<{ addresses: SavedAddress[] }>("/api/customer/addresses");
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState<SavedAddress | null>(null);

  const call = async (url: string, method: string, msg: string) => {
    try {
      await api(url, { method });
      toast(msg);
      await Promise.all([reload(), refreshMe()]);
    } catch (e) {
      toast((e as Error).message, "error");
      throw e;
    }
  };

  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorBlock message={error ?? "Failed"} onRetry={reload} />;

  return (
    <div className="space-y-6">
      {adding ? (
        <Card title="Add address">
          <AddressForm onCancel={() => setAdding(false)} onSaved={() => { setAdding(false); reload(); toast("Address saved"); }} />
        </Card>
      ) : (
        <Button onClick={() => setAdding(true)}>+ Add address</Button>
      )}
      {data.addresses.length === 0 ? <Card><EmptyState title="No saved addresses" description="Save your home or work address for faster checkout." /></Card> : (
        <div className="grid gap-4 sm:grid-cols-2">
          {data.addresses.map((a) => (
            <Card key={a._id}>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-slate-900">{a.label}</p>
                {a.isDefault && <Badge value="active" label="Default" />}
              </div>
              <p className="mt-1 text-sm text-slate-600">{a.line1}{a.city ? `, ${a.city}` : ""} {a.pincode}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!a.isDefault && <Button size="sm" variant="secondary" onClick={() => call(`/api/customer/addresses/${a._id}`, "PATCH", "Default address updated").catch(() => {})}>Make default</Button>}
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const [lng, lat] = a.location.coordinates;
                    setLocation({ lat, lng, label: `${a.label}: ${a.line1}`, addressId: a._id });
                    toast(`Delivering to ${a.label}`);
                  }}
                  disabled={location?.addressId === a._id}
                >
                  {location?.addressId === a._id ? "Delivering here" : "Deliver here"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setDeleting(a)}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <ConfirmDialog
        open={!!deleting}
        title="Delete address"
        message={`Remove "${deleting?.label}: ${deleting?.line1}"?`}
        confirmLabel="Delete"
        onConfirm={() => call(`/api/customer/addresses/${deleting!._id}`, "DELETE", "Address deleted")}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
