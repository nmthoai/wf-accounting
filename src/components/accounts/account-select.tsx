"use client";

import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";

export type AccountOpt = { id: string; name: string; currency: string; type: string; isActive: boolean };

export function AccountSelect({
  accounts, value, onChange, placeholder = "Choose account",
}: {
  accounts: AccountOpt[]; value: string; onChange: (id: string) => void; placeholder?: string;
}) {
  const sel = accounts.find((a) => a.id === value);
  return (
    <Select value={value} onValueChange={(v) => onChange(v || "")}>
      <SelectTrigger>
        {sel ? <span>{sel.name} · {sel.currency}</span> : <span className="text-muted-foreground">{placeholder}</span>}
      </SelectTrigger>
      <SelectContent>
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>{a.name} · {a.currency}{a.isActive ? "" : " (inactive)"}</SelectItem>
        ))}
        {accounts.length === 0 && <SelectItem value="none" disabled>No accounts — an admin adds them on the Accounts page</SelectItem>}
      </SelectContent>
    </Select>
  );
}
