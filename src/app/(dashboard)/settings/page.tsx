import { prisma } from "@/lib/prisma";
import { DeleteCategoryButton } from "@/components/settings/delete-category-button";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createCategory, updateCategory, updateExchangeRate, createUnitRate, updateUnitRate, deleteUnitRate } from "@/app/actions/settings";
import { Trash2 } from "lucide-react";
import { requirePageSession } from "@/lib/session";
import { getTranslations, getLocale } from "next-intl/server";
import { fmtDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/wf/page-header";
import { PanelHead } from "@/components/wf/ledger-ui";

import { UserManagement } from "@/components/settings/user-management";
import { EditCategoryDialog } from "@/components/settings/edit-category-dialog";
import { EditUnitRateDialog } from "@/components/settings/edit-unit-rate-dialog";
import { ActionForm } from "@/components/settings/action-form";

export default async function SettingsPage() {
  const session = await requirePageSession();
  const t = await getTranslations("settings");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const [currentUser, categories, unitRates, allUsers] = await Promise.all([
    prisma.user.findUnique({ where: { id: session?.user?.id } }),
    prisma.category.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.unitRate.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, username: true, role: true, isActive: true, twoFactorEnabled: true, mustChangePassword: true, lockedUntil: true },
    }),
  ]);
  const isAdmin = currentUser?.role === "ADMIN";
  const now = new Date();
  const users = isAdmin
    ? allUsers.map((u) => ({
        id: u.id, username: u.username, role: u.role, isActive: u.isActive,
        twoFactorEnabled: u.twoFactorEnabled, mustChangePassword: u.mustChangePassword,
        locked: !!u.lockedUntil && u.lockedUntil > now,
      }))
    : [];

  const incomeCategories = categories.filter((c) => c.type === "INCOME");
  const expenseCategories = categories.filter((c) => c.type === "EXPENSE");
  const unitPer: Record<string, string> = { hours: t("unitRates.per.hours"), project: t("unitRates.per.project"), manday: t("unitRates.per.manday") };

  // One group of categories: a ruled sub-head with its dot, then the rows.
  const categoryGroup = (title: string, tone: "pos" | "neg", list: typeof categories, empty: string) => (
    <>
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-5 py-2.5">
        <span className={cn("size-1.5 shrink-0 rounded-full", tone === "pos" ? "bg-pos" : "bg-neg")} aria-hidden="true" />
        <h3 className="wf-label">{title}</h3>
      </div>
      <ul className="wf-rows border-b border-border last:border-b-0">
        {list.map((c) => (
          <li key={c.id} className="py-2">
            <span className="min-w-0 truncate text-foreground">{c.name}</span>
            <div className="flex shrink-0 items-center gap-1">
              <EditCategoryDialog category={c} action={updateCategory} />
              <DeleteCategoryButton id={c.id} name={c.name} />
            </div>
          </li>
        ))}
        {list.length === 0 && <li className="text-[14.5px] text-muted-foreground">{empty}</li>}
      </ul>
    </>
  );

  return (
    <div>
      <PageHeader section="settings" title={t("page.title")} description={t("page.subtitle")} />

      <div className="grid gap-6">
        {isAdmin && session?.user?.id && (
          <UserManagement users={users} currentUserId={session.user.id} />
        )}

        <div className="grid gap-6 lg:grid-cols-12">
          <div className="grid content-start gap-6 lg:col-span-6">
            <Card>
              <PanelHead title={t("categories.title")} />
              <CardContent className="grid gap-4 border-b border-border">
                <p className="text-[14.5px] text-muted-foreground">{t("categories.description")}</p>
                <ActionForm action={createCategory} success={t("categories.toast.added")} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
                  <div className="grid gap-2">
                    <Label htmlFor="name">{t("fields.name")}</Label>
                    <Input id="name" name="name" placeholder={t("categories.namePlaceholder")} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="type">{t("fields.type")}</Label>
                    <Select name="type" required defaultValue="EXPENSE" items={[{ value: "INCOME", label: tc("type.INCOME") }, { value: "EXPENSE", label: tc("type.EXPENSE") }]}>
                      <SelectTrigger id="type" className="w-full">
                        <SelectValue placeholder={t("categories.typePlaceholder")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="INCOME">{tc("type.INCOME")}</SelectItem>
                        <SelectItem value="EXPENSE">{tc("type.EXPENSE")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit">{tc("actions.add")}</Button>
                </ActionForm>
              </CardContent>
              {categoryGroup(t("categories.incomeTitle"), "pos", incomeCategories, t("categories.noIncome"))}
              {categoryGroup(t("categories.expenseTitle"), "neg", expenseCategories, t("categories.noExpense"))}
            </Card>

            <Card>
              <PanelHead title={t("unitRates.title")} />
              <CardContent className="grid gap-4 border-b border-border">
                <p className="text-[14.5px] text-muted-foreground">{t("unitRates.description")}</p>
                <ActionForm action={createUnitRate} success={t("unitRates.toast.added")} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_7rem_8rem_auto] sm:items-end">
                  <div className="grid gap-2">
                    <Label htmlFor="description">{t("fields.description")}</Label>
                    <Input id="description" name="description" placeholder={t("unitRates.descriptionPlaceholder")} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="unit-rate">{t("fields.rate")}</Label>
                    <Input id="unit-rate" name="rate" type="number" step="0.01" min="0" placeholder={t("unitRates.ratePlaceholder")} required />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="unit">{t("fields.unit")}</Label>
                    <Select name="unit" required defaultValue="hours" items={[{ value: "hours", label: t("unitRates.units.hours") }, { value: "project", label: t("unitRates.units.project") }, { value: "manday", label: t("unitRates.units.manday") }]}>
                      <SelectTrigger id="unit" className="w-full">
                        <SelectValue placeholder={t("fields.unit")} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="hours">{t("unitRates.units.hours")}</SelectItem>
                        <SelectItem value="project">{t("unitRates.units.project")}</SelectItem>
                        <SelectItem value="manday">{t("unitRates.units.manday")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button type="submit">{tc("actions.add")}</Button>
                </ActionForm>
              </CardContent>
              <ul className="wf-rows">
                {unitRates.map((r) => (
                  <li key={r.id} className="py-2.5">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{r.description}</p>
                      <p className="wf-num mt-0.5 text-[13.5px] text-muted-foreground">{t("unitRates.rateLine", { rate: r.rate, unit: unitPer[r.unit] ?? r.unit })}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <EditUnitRateDialog unitRate={r} action={updateUnitRate} />
                      <ActionForm action={deleteUnitRate.bind(null, r.id)} success={t("unitRates.toast.deleted")}>
                        <Button type="submit" variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive" aria-label={tc("actions.delete")} title={tc("actions.delete")}><Trash2 aria-hidden="true" /></Button>
                      </ActionForm>
                    </div>
                  </li>
                ))}
                {unitRates.length === 0 && <li className="text-[14.5px] text-muted-foreground">{t("unitRates.empty")}</li>}
              </ul>
            </Card>
          </div>

          <Card className="self-start lg:col-span-6">
            <PanelHead title={t("exchangeRate.title")} />
            <p className="border-b border-border px-5 py-3 text-[14.5px] text-muted-foreground">{t("exchangeRate.description")}</p>
            <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border bg-muted/40 px-5 py-4">
              <div className="grid gap-2">
                <p className="wf-label">{t("exchangeRate.current")}</p>
                <p className="flex items-baseline gap-2">
                  <span className="wf-num text-[28px] leading-none font-semibold text-primary">{new Intl.NumberFormat('vi-VN').format(currentUser?.defaultUsdRate || 25400)}</span>
                  <span className="wf-num text-[13.5px] text-muted-foreground">VND / USD</span>
                </p>
              </div>
              <div className="grid gap-2 text-right">
                <p className="wf-label">{t("exchangeRate.lastUpdated")}</p>
                <p className="wf-num text-[14.5px] text-foreground">
                  {currentUser?.updatedAt ? fmtDate(currentUser.updatedAt, locale, { timeZone: "Asia/Ho_Chi_Minh" }) : t("exchangeRate.never")}
                </p>
              </div>
            </div>
            <CardContent>
              <ActionForm action={updateExchangeRate} success={t("exchangeRate.toast.updated")} className="grid gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="rate">{t("exchangeRate.newRate")}</Label>
                  <Input key={currentUser?.defaultUsdRate} id="rate" name="rate" type="number" step="0.01" defaultValue={currentUser?.defaultUsdRate} required />
                  <p className="text-[13.5px] text-muted-foreground">{t("exchangeRate.hint")}</p>
                </div>
                <Button type="submit" className="justify-self-start">{t("exchangeRate.submit")}</Button>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
