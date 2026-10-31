"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Loader2, UserPlus, Truck } from "lucide-react";
import { createClient, deleteClient, updateClient } from "@/app/actions/clients";
import { createVendor, deleteVendor, updateVendor } from "@/app/actions/vendors";
import { EditContactDialog } from "@/components/contacts/edit-contact-dialog";
import { notify } from "@/components/ui/toast";
import { PanelHead } from "@/components/wf/ledger-ui";
import { fmtVnd } from "@/lib/money";
import { cn } from "@/lib/utils";

type ClientRow = { id: string; name: string; email: string | null; phone: string | null; projectCount: number; invoiceCount: number; revenue: number };
type VendorRow = { id: string; name: string; email: string | null; phone: string | null; spend: number; txnCount: number };

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
    <div className="grid gap-6 lg:grid-cols-12">
      <Card className="lg:col-span-6">
        <PanelHead title={t("clients.title")} count={clients.length} />
        <CardContent>
          <p className="text-text-secondary">{t("clients.description")}</p>
          <form onSubmit={(e) => handleAdd(e, "client")} className="mt-4 flex flex-wrap items-end gap-3">
            <div className="grid min-w-[7rem] flex-[1.2] gap-2">
              <Label htmlFor="cname">{t("form.name")}</Label>
              <Input id="cname" name="name" placeholder={t("clients.namePlaceholder")} required />
            </div>
            <div className="grid min-w-[7rem] flex-1 gap-2">
              <Label htmlFor="cemail">{t("form.emailOptional")}</Label>
              <Input id="cemail" name="email" type="email" placeholder="billing@acme.co" />
            </div>
            <div className="grid min-w-[7rem] flex-1 gap-2">
              <Label htmlFor="cphone">{t("form.phoneOptional")}</Label>
              <Input id="cphone" name="phone" type="tel" placeholder="+84 …" />
            </div>
            <Button type="submit" disabled={addingClient}>
              {addingClient ? <Loader2 className="animate-spin" aria-hidden="true" /> : <UserPlus aria-hidden="true" />}{tc("actions.add")}
            </Button>
          </form>
        </CardContent>
        <ul className="wf-rows border-t border-border">
          {clients.map((c) => (
            <li key={c.id}>
              <div className="min-w-0">
                <p className="truncate text-foreground">{c.name}</p>
                <p className="truncate text-[12px] text-muted-foreground">{t("clients.meta", { contact: [c.email, c.phone].filter(Boolean).join(" · ") || "—", projects: c.projectCount, invoices: c.invoiceCount })}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className={cn("wf-figure mr-2", c.revenue > 0 ? "text-pos" : "text-muted-foreground")} title={t("clients.revenueTitle")}>{fmtVnd(c.revenue)}</span>
                <EditContactDialog contact={{ id: c.id, name: c.name, email: c.email, phone: c.phone }} kind="client" action={updateClient} />
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={tc("actions.delete")} title={tc("actions.delete")} disabled={busyId === c.id}
                  onClick={() => { if (confirm(t("clients.confirmDelete", { name: c.name }))) run(c.id, () => deleteClient(c.id), t("toast.clientDeleted"), c.name); }}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
          {clients.length === 0 && <li className="text-muted-foreground">{t("clients.empty")}</li>}
        </ul>
      </Card>

      <Card className="lg:col-span-6">
        <PanelHead title={t("vendors.title")} count={vendors.length} />
        <CardContent>
          <p className="text-text-secondary">{t("vendors.description")}</p>
          <form onSubmit={(e) => handleAdd(e, "vendor")} className="mt-4 flex flex-wrap items-end gap-3">
            <div className="grid min-w-[7rem] flex-[1.2] gap-2">
              <Label htmlFor="vname">{t("form.name")}</Label>
              <Input id="vname" name="name" placeholder={t("vendors.namePlaceholder")} required />
            </div>
            <div className="grid min-w-[7rem] flex-1 gap-2">
              <Label htmlFor="vemail">{t("form.emailOptional")}</Label>
              <Input id="vemail" name="email" type="email" placeholder="billing@zdn.co" />
            </div>
            <div className="grid min-w-[7rem] flex-1 gap-2">
              <Label htmlFor="vphone">{t("form.phoneOptional")}</Label>
              <Input id="vphone" name="phone" type="tel" placeholder="+84 …" />
            </div>
            <Button type="submit" disabled={addingVendor}>
              {addingVendor ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Truck aria-hidden="true" />}{tc("actions.add")}
            </Button>
          </form>
        </CardContent>
        <ul className="wf-rows border-t border-border">
          {vendors.map((v) => (
            <li key={v.id}>
              <div className="min-w-0">
                <p className="truncate text-foreground">{v.name}</p>
                <p className="truncate text-[12px] text-muted-foreground">{t("vendors.meta", { contact: [v.email, v.phone].filter(Boolean).join(" · ") || "—", payments: v.txnCount })}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className={cn("wf-figure mr-2", v.spend > 0 ? "text-foreground" : "text-muted-foreground")}>{v.spend > 0 ? "\u2212" : ""}{fmtVnd(v.spend)}</span>
                <EditContactDialog contact={{ id: v.id, name: v.name, email: v.email, phone: v.phone }} kind="vendor" action={updateVendor} />
                <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={tc("actions.delete")} title={tc("actions.delete")} disabled={busyId === v.id}
                  onClick={() => { if (confirm(t("vendors.confirmDelete", { name: v.name }))) run(v.id, () => deleteVendor(v.id), t("toast.vendorDeleted"), v.name); }}>
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
          {vendors.length === 0 && <li className="text-muted-foreground">{t("vendors.empty")}</li>}
        </ul>
      </Card>
    </div>
  );
}
