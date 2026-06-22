"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Loader2, UserPlus, Truck } from "lucide-react";
import { createClient, deleteClient, updateClient } from "@/app/actions/clients";
import { createVendor, deleteVendor, updateVendor } from "@/app/actions/vendors";
import { EditContactDialog } from "@/components/contacts/edit-contact-dialog";

type ClientRow = { id: string; name: string; email: string | null; phone: string | null; projectCount: number; invoiceCount: number; revenue: number };
type VendorRow = { id: string; name: string; email: string | null; phone: string | null; spend: number; txnCount: number };

const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";

export function ContactsClient({ clients, vendors }: { clients: ClientRow[]; vendors: VendorRow[] }) {
  const router = useRouter();
  const [addingClient, setAddingClient] = useState(false);
  const [addingVendor, setAddingVendor] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<{ success: boolean; message?: string }>) {
    setBusyId(id);
    try {
      const res = await fn();
      if (!res.success && res.message) alert(res.message);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>, kind: "client" | "vendor") {
    e.preventDefault();
    const setBusy = kind === "client" ? setAddingClient : setAddingVendor;
    const create = kind === "client" ? createClient : createVendor;
    setBusy(true);
    const form = e.currentTarget;
    try {
      const res = await create(new FormData(form));
      if (!res.success) { alert(res.message); return; }
      form.reset();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Clients</CardTitle>
          <CardDescription>Who you invoice and run projects for. Revenue is total income received from them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={(e) => handleAdd(e, "client")} className="flex gap-3 items-end flex-wrap">
            <div className="space-y-2 flex-1 min-w-[160px]">
              <Label htmlFor="cname">Name</Label>
              <Input id="cname" name="name" placeholder="e.g. Acme Co" required />
            </div>
            <div className="space-y-2 flex-1 min-w-[140px]">
              <Label htmlFor="cemail">Email (optional)</Label>
              <Input id="cemail" name="email" type="email" placeholder="billing@acme.co" />
            </div>
            <div className="space-y-2 w-40">
              <Label htmlFor="cphone">Phone (optional)</Label>
              <Input id="cphone" name="phone" type="tel" placeholder="+84 …" />
            </div>
            <Button type="submit" disabled={addingClient} className="gap-2">
              {addingClient ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add
            </Button>
          </form>
          <div className="space-y-2">
            {clients.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 bg-muted/50 p-3 rounded-md">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{[c.email, c.phone].filter(Boolean).join(" · ") || "—"} · {c.projectCount} projects · {c.invoiceCount} invoices</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-green-700" title="Revenue received">{vnd(c.revenue)}</span>
                  <EditContactDialog contact={{ id: c.id, name: c.name, email: c.email, phone: c.phone }} kind="client" action={updateClient} />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled={busyId === c.id}
                    onClick={() => { if (confirm(`Delete client ${c.name}?`)) run(c.id, () => deleteClient(c.id)); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {clients.length === 0 && <p className="text-sm text-muted-foreground">No clients yet.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vendors</CardTitle>
          <CardDescription>Who you pay (e.g. subcontractors, services). Spend is total expenses tagged to them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={(e) => handleAdd(e, "vendor")} className="flex gap-3 items-end flex-wrap">
            <div className="space-y-2 flex-1 min-w-[160px]">
              <Label htmlFor="vname">Name</Label>
              <Input id="vname" name="name" placeholder="e.g. ZDN" required />
            </div>
            <div className="space-y-2 flex-1 min-w-[140px]">
              <Label htmlFor="vemail">Email (optional)</Label>
              <Input id="vemail" name="email" type="email" placeholder="billing@zdn.co" />
            </div>
            <div className="space-y-2 w-40">
              <Label htmlFor="vphone">Phone (optional)</Label>
              <Input id="vphone" name="phone" type="tel" placeholder="+84 …" />
            </div>
            <Button type="submit" disabled={addingVendor} className="gap-2">
              {addingVendor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Add
            </Button>
          </form>
          <div className="space-y-2">
            {vendors.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 bg-muted/50 p-3 rounded-md">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{v.name}</span>
                  <span className="text-xs text-muted-foreground">{[v.email, v.phone].filter(Boolean).join(" · ") || "—"} · {v.txnCount} payments</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-red-600">{vnd(v.spend)}</span>
                  <EditContactDialog contact={{ id: v.id, name: v.name, email: v.email, phone: v.phone }} kind="vendor" action={updateVendor} />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled={busyId === v.id}
                    onClick={() => { if (confirm(`Delete vendor ${v.name}?`)) run(v.id, () => deleteVendor(v.id)); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {vendors.length === 0 && <p className="text-sm text-muted-foreground">No vendors yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
