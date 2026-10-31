"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, Loader2, UserPlus, Truck, CircleAlert } from "lucide-react";
import { createClient, deleteClient, updateClient } from "@/app/actions/clients";
import { createVendor, deleteVendor, updateVendor } from "@/app/actions/vendors";
import { EditContactDialog } from "@/components/contacts/edit-contact-dialog";
import { notify, notifyFailure } from "@/components/ui/toast";
import { PanelHead } from "@/components/wf/ledger-ui";
import { fmtVnd } from "@/lib/money";
import { cn } from "@/lib/utils";

type ClientRow = { id: string; name: string; email: string | null; phone: string | null; projectCount: number; invoiceCount: number; revenue: number };
type VendorRow = { id: string; name: string; email: string | null; phone: string | null; spend: number; txnCount: number };

export function ContactsClient({ clients, vendors, isAdmin }: {
  clients: ClientRow[]; vendors: VendorRow[];
  isAdmin: boolean; // deleting a client or vendor is the owner's decision
}) {
  const router = useRouter();
  const t = useTranslations("contacts");
  const tc = useTranslations("common");
  const [addingClient, setAddingClient] = useState(false);
  const [addingVendor, setAddingVendor] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  // The server's reason an add was refused (e.g. the name is taken), shown under that form.
  const [addErr, setAddErr] = useState<{ client?: string; vendor?: string }>({});
  // Email · phone · counts — a missing email or phone is left out, not shown as a dash.
  const clientMeta = (c: ClientRow) => [c.email, c.phone, t("clients.meta", { projects: c.projectCount, invoices: c.invoiceCount })].filter(Boolean).join(" · ");
  const vendorMeta = (v: VendorRow) => [v.email, v.phone, t("vendors.meta", { payments: v.txnCount })].filter(Boolean).join(" · ");

  async function run(id: string, fn: () => Promise<{ success: boolean; message?: string }>, done: string, detail?: string) {
    setBusyId(id);
    try {
      const res = await fn();
      if (res.success) notify.success(done, detail);
      else notifyFailure(res.message);
      router.refresh();
    } catch {
      notifyFailure();
    } finally {
      setBusyId(null);
    }
  }

  async function handleAdd(e: React.FormEvent<HTMLFormElement>, kind: "client" | "vendor") {
    e.preventDefault();
    const setBusy = kind === "client" ? setAddingClient : setAddingVendor;
    const create = kind === "client" ? createClient : createVendor;
    setBusy(true);
    setAddErr((prev) => ({ ...prev, [kind]: undefined }));
    const form = e.currentTarget;
    try {
      const res = await create(new FormData(form));
      if (!res.success) { setAddErr((prev) => ({ ...prev, [kind]: res.message || tc("errors.couldNotSave") })); return; }
      notify.success(kind === "client" ? t("toast.clientAdded") : t("toast.vendorAdded"));
      form.reset();
      router.refresh();
    } catch {
      notifyFailure();
    } finally {
      setBusy(false);
    }
  }

  const addError = (msg?: string) => msg && (
    <p className="mt-3 flex items-center gap-1.5 text-[13.5px] text-destructive" role="alert">
      <CircleAlert className="size-3.5 shrink-0" aria-hidden="true" />{msg}
    </p>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-12">
      <Card className="lg:col-span-6">
        <PanelHead title={t("clients.title")} count={clients.length} />
        <CardContent>
          <p className="text-text-secondary">{t("clients.description")}</p>
          {/* The name has its own row, so email and phone get room to be read. */}
          <form onSubmit={(e) => handleAdd(e, "client")} className="mt-4 flex flex-wrap items-end gap-3">
            <div className="grid basis-full gap-2">
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
          {addError(addErr.client)}
        </CardContent>
        <ul className="wf-rows border-t border-border">
          {clients.map((c) => (
            <li key={c.id}>
              <div className="min-w-0">
                <p className="truncate text-foreground" title={c.name}>{c.name}</p>
                <p className="truncate text-[13.5px] text-muted-foreground" title={clientMeta(c)}>{clientMeta(c)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className={cn("wf-figure mr-2", c.revenue > 0 ? "text-pos" : "text-muted-foreground")} title={t("clients.revenueTitle")}>{fmtVnd(c.revenue)}</span>
                <EditContactDialog contact={{ id: c.id, name: c.name, email: c.email, phone: c.phone }} kind="client" action={updateClient} />
                {isAdmin && (
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={tc("actions.delete")} title={tc("actions.delete")} disabled={busyId === c.id}
                    onClick={() => { if (confirm(t("clients.confirmDelete", { name: c.name }))) run(c.id, () => deleteClient(c.id), t("toast.clientDeleted"), c.name); }}>
                    <Trash2 />
                  </Button>
                )}
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
            <div className="grid basis-full gap-2">
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
          {addError(addErr.vendor)}
        </CardContent>
        <ul className="wf-rows border-t border-border">
          {vendors.map((v) => (
            <li key={v.id}>
              <div className="min-w-0">
                <p className="truncate text-foreground" title={v.name}>{v.name}</p>
                <p className="truncate text-[13.5px] text-muted-foreground" title={vendorMeta(v)}>{vendorMeta(v)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className={cn("wf-figure mr-2", v.spend > 0 ? "text-foreground" : "text-muted-foreground")}>{v.spend > 0 ? "\u2212" : ""}{fmtVnd(v.spend)}</span>
                <EditContactDialog contact={{ id: v.id, name: v.name, email: v.email, phone: v.phone }} kind="vendor" action={updateVendor} />
                {isAdmin && (
                  <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={tc("actions.delete")} title={tc("actions.delete")} disabled={busyId === v.id}
                    onClick={() => { if (confirm(t("vendors.confirmDelete", { name: v.name }))) run(v.id, () => deleteVendor(v.id), t("toast.vendorDeleted"), v.name); }}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            </li>
          ))}
          {vendors.length === 0 && <li className="text-muted-foreground">{t("vendors.empty")}</li>}
        </ul>
      </Card>
    </div>
  );
}
