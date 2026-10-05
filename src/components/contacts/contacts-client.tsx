"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Loader2, UserPlus, Truck } from "lucide-react";
import { createClient, deleteClient, updateClient } from "@/app/actions/clients";
import { createVendor, deleteVendor, updateVendor } from "@/app/actions/vendors";
import { EditContactDialog } from "@/components/contacts/edit-contact-dialog";
import { notify } from "@/components/ui/toast";

type ClientRow = { id: string; name: string; email: string | null; phone: string | null; projectCount: number; invoiceCount: number; revenue: number };
type VendorRow = { id: string; name: string; email: string | null; phone: string | null; spend: number; txnCount: number };

const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";

export function ContactsClient({ clients, vendors }: { clients: ClientRow[]; vendors: VendorRow[] }) {
  const router = useRouter();
  const t = useTranslations("contacts");
  const tc = useTranslations("common");
  const [addingClient, setAddingClient] = useState(false);
  const [addingVendor, setAddingVendor] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<{ success: boolean; message?: string }>, done: string, detail?: string) {
    setBusyId(id);
    try {
      const res = await fn();
      if (res.success) notify.success(done, detail);
      else if (res.message) notify.error(res.message);
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
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
      if (!res.success) { notify.error(res.message || tc("errors.couldNotSave")); return; }
      notify.success(kind === "client" ? t("toast.clientAdded") : t("toast.vendorAdded"));
      form.reset();
      router.refresh();
    } catch {
      notify.error(tc("errors.somethingWrong"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>{t("clients.title")}</CardTitle>
          <CardDescription>{t("clients.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={(e) => handleAdd(e, "client")} className="flex gap-3 items-end flex-wrap">
            <div className="space-y-2 flex-1 min-w-[160px]">
              <Label htmlFor="cname">{t("form.name")}</Label>
              <Input id="cname" name="name" placeholder={t("clients.namePlaceholder")} required />
            </div>
            <div className="space-y-2 flex-1 min-w-[140px]">
              <Label htmlFor="cemail">{t("form.emailOptional")}</Label>
              <Input id="cemail" name="email" type="email" placeholder="billing@acme.co" />
            </div>
            <div className="space-y-2 w-40">
              <Label htmlFor="cphone">{t("form.phoneOptional")}</Label>
              <Input id="cphone" name="phone" type="tel" placeholder="+84 …" />
            </div>
            <Button type="submit" disabled={addingClient} className="gap-2">
              {addingClient ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} {tc("actions.add")}
            </Button>
          </form>
          <div className="space-y-2">
            {clients.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 bg-muted/50 p-3 rounded-md">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{t("clients.meta", { contact: [c.email, c.phone].filter(Boolean).join(" · ") || "—", projects: c.projectCount, invoices: c.invoiceCount })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-green-700" title={t("clients.revenueTitle")}>{vnd(c.revenue)}</span>
                  <EditContactDialog contact={{ id: c.id, name: c.name, email: c.email, phone: c.phone }} kind="client" action={updateClient} />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled={busyId === c.id}
                    onClick={() => { if (confirm(t("clients.confirmDelete", { name: c.name }))) run(c.id, () => deleteClient(c.id), t("toast.clientDeleted"), c.name); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {clients.length === 0 && <p className="text-sm text-muted-foreground">{t("clients.empty")}</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("vendors.title")}</CardTitle>
          <CardDescription>{t("vendors.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={(e) => handleAdd(e, "vendor")} className="flex gap-3 items-end flex-wrap">
            <div className="space-y-2 flex-1 min-w-[160px]">
              <Label htmlFor="vname">{t("form.name")}</Label>
              <Input id="vname" name="name" placeholder={t("vendors.namePlaceholder")} required />
            </div>
            <div className="space-y-2 flex-1 min-w-[140px]">
              <Label htmlFor="vemail">{t("form.emailOptional")}</Label>
              <Input id="vemail" name="email" type="email" placeholder="billing@zdn.co" />
            </div>
            <div className="space-y-2 w-40">
              <Label htmlFor="vphone">{t("form.phoneOptional")}</Label>
              <Input id="vphone" name="phone" type="tel" placeholder="+84 …" />
            </div>
            <Button type="submit" disabled={addingVendor} className="gap-2">
              {addingVendor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} {tc("actions.add")}
            </Button>
          </form>
          <div className="space-y-2">
            {vendors.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 bg-muted/50 p-3 rounded-md">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{v.name}</span>
                  <span className="text-xs text-muted-foreground">{t("vendors.meta", { contact: [v.email, v.phone].filter(Boolean).join(" · ") || "—", payments: v.txnCount })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-red-600">{vnd(v.spend)}</span>
                  <EditContactDialog contact={{ id: v.id, name: v.name, email: v.email, phone: v.phone }} kind="vendor" action={updateVendor} />
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled={busyId === v.id}
                    onClick={() => { if (confirm(t("vendors.confirmDelete", { name: v.name }))) run(v.id, () => deleteVendor(v.id), t("toast.vendorDeleted"), v.name); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {vendors.length === 0 && <p className="text-sm text-muted-foreground">{t("vendors.empty")}</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
