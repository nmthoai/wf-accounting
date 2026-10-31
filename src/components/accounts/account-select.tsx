"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

export type AccountOpt = { id: string; name: string; currency: string; type: string; isActive: boolean };

export function AccountSelect({
  id, accounts, value, onChange, placeholder, className, required,
}: {
  id?: string; accounts: AccountOpt[]; value: string; onChange: (id: string) => void; placeholder?: string; className?: string; required?: boolean;
}) {
  const t = useTranslations("accounts");
  const sel = accounts.find((a) => a.id === value);
  const shown = sel ? `${sel.name} · ${sel.currency}` : placeholder ?? t("select.placeholder");
  return (
    <Select value={value} onValueChange={(v) => onChange(v || "")} required={required}>
      <SelectTrigger id={id} className={className}>
        <span className={sel ? "min-w-0 truncate" : "min-w-0 truncate text-muted-foreground"} title={shown}>{shown}</span>
      </SelectTrigger>
      <SelectContent>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>{a.isActive ? <>{a.name} · {a.currency}</> : t("select.inactiveOption", { name: a.name, currency: a.currency })}</SelectItem>
        ))}
        {accounts.length === 0 && <SelectItem value="none" disabled>{t("select.empty")}</SelectItem>}
      </SelectContent>
    </Select>
  );
}
