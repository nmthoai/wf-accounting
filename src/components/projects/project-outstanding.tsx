"use client";

import { useTranslations } from "next-intl";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { RecordPaymentDialog } from "@/components/invoices/payment-dialogs";
import type { AccountOpt } from "@/components/accounts/account-select";
import { fmtMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import { Chip, INVOICE_STATUS_TONE } from "@/components/wf/ledger-ui";

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
    return (
      <ul className="wf-rows">
        <li className="text-muted-foreground">{t("outstanding.empty")}</li>
      </ul>
    );
  }

  return (
    <ul className="wf-rows">
      {items.map((i) => {
        const payable = i.direction === "PAYABLE";
        return (
          <li key={i.id}>
            <div className="flex min-w-0 items-center gap-3">
              {payable
                ? <ArrowUpRight className="size-4 shrink-0 text-neg" aria-hidden="true" />
                : <ArrowDownLeft className="size-4 shrink-0 text-pos" aria-hidden="true" />}
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-foreground">
                  {payable ? t("outstanding.youOwe") : t("outstanding.owedToYou")}
                  {i.overdue
                    ? <Chip tone={INVOICE_STATUS_TONE.OVERDUE} mono>{t("outstanding.overdue")}</Chip>
                    : <Chip tone={INVOICE_STATUS_TONE[i.status] ?? "warn"} mono>{i.status === "PARTIAL" ? tc("invoiceStatus.PARTIAL") : t("outstanding.unpaid")}</Chip>}
                </p>
                <p className="truncate text-[12px] text-muted-foreground">
                  {t("outstanding.due", { ref: [i.number, i.party].filter(Boolean).join(" · ") || "—", date: i.dueDate })}
                </p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <div className="text-right">
                <p className={cn("wf-figure", payable ? "text-neg" : "text-pos")}>{fmtMoney(i.difference, i.currency)}</p>
                {i.status === "PARTIAL" && <p className="text-[12px] text-muted-foreground">{t("outstanding.openOf", { amount: fmtMoney(i.amount, i.currency) })}</p>}
              </div>
              <RecordPaymentDialog invoice={i} accounts={accounts} defaultUsdRate={defaultUsdRate} feeCategories={feeCategories} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
