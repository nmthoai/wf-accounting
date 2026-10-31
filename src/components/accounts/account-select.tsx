"use client";

import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

export type AccountOpt = { id: string; name: string; currency: string; type: string; isActive: boolean };

export function AccountSelect({
  accounts, value, onChange, placeholder,
}: {
  accounts: AccountOpt[]; value: string; onChange: (id: string) => void; placeholder?: string;
}) {
  const t = useTranslations("accounts");
  const sel = accounts.find((a) => a.id === value);
  return (
    <Select value={value} onValueChange={(v) => onChange(v || "")}>
      <SelectTrigger>
        {sel ? <span>{sel.name} · {sel.currency}</span> : <span className="text-muted-foreground">{placeholder ?? t("select.placeholder")}</span>}
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
