"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { RecordPaymentDialog } from "@/components/invoices/payment-dialogs";
import type { AccountOpt } from "@/components/accounts/account-select";
import { fmtMoney } from "@/lib/money";

type OpenItem = {
  id: string; number: string | null; direction: string; party: string | null; status: string;
  amount: number; difference: number; currency: string; dueDate: string; overdue: boolean;
};

export function ProjectOutstanding({ items, accounts, defaultUsdRate, feeCategories }: {
  items: OpenItem[]; accounts: AccountOpt[]; defaultUsdRate: number; feeCategories: { id: string; name: string }[];
}) {
  const t = useTranslations("projects");
  const tc = useTranslations("common");
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("outstanding.empty")}</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((i) => (
        <div key={i.id} className="flex items-center justify-between gap-3 bg-muted/50 p-3 rounded-md flex-wrap">
          <div className="flex items-center gap-2 min-w-[160px]">
            {i.direction === "PAYABLE"
              ? <ArrowUpRight className="h-4 w-4 text-red-500" />
              : <ArrowDownLeft className="h-4 w-4 text-green-600" />}
            <div className="flex flex-col">
              <span className="text-sm font-medium flex items-center gap-2">
                {i.direction === "PAYABLE" ? t("outstanding.youOwe") : t("outstanding.owedToYou")}
                {i.overdue
                  ? <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700 inline-flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{t("outstanding.overdue")}</span>
                  : <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">{i.status === "PARTIAL" ? tc("invoiceStatus.PARTIAL") : t("outstanding.unpaid")}</span>}
              </span>
              <span className="text-xs text-muted-foreground">{t("outstanding.due", { ref: [i.number, i.party].filter(Boolean).join(" · ") || "—", date: i.dueDate })}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className={`text-sm font-semibold ${i.direction === "PAYABLE" ? "text-red-600" : "text-green-700"}`}>{fmtMoney(i.difference, i.currency)}</div>
              {i.status === "PARTIAL" && <div className="text-xs text-muted-foreground">{t("outstanding.openOf", { amount: fmtMoney(i.amount, i.currency) })}</div>}
            </div>
            <RecordPaymentDialog invoice={i} accounts={accounts} defaultUsdRate={defaultUsdRate} feeCategories={feeCategories} />
          </div>
        </div>
      ))}
    </div>
  );
}
