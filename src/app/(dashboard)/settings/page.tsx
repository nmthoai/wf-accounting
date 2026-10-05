import { prisma } from "@/lib/prisma";
import { DeleteCategoryButton } from "@/components/settings/delete-category-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createCategory, updateCategory, updateExchangeRate, createUnitRate, updateUnitRate, deleteUnitRate } from "@/app/actions/settings";
import { Trash2 } from "lucide-react";
import { requirePageSession } from "@/lib/session";
import { getTranslations, getLocale } from "next-intl/server";
import { fmtDate } from "@/lib/format";

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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">{t("page.title")}</h1>
        <p className="text-muted-foreground mt-1">{t("page.subtitle")}</p>
      </div>

      {isAdmin && session?.user?.id && (
        <UserManagement users={users} currentUserId={session.user.id} />
      )}

      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-8">
          {/* Categories Section */}
          <Card>
            <CardHeader>
              <CardTitle>{t("categories.title")}</CardTitle>
              <CardDescription>{t("categories.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ActionForm action={createCategory} success={t("categories.toast.added")} className="flex gap-4 items-end">
                <div className="space-y-2 flex-1">
                  <Label htmlFor="name">{t("fields.name")}</Label>
                  <Input id="name" name="name" placeholder={t("categories.namePlaceholder")} required />
                </div>
                <div className="space-y-2 w-1/3">
                  <Label htmlFor="type">{t("fields.type")}</Label>
                  <Select name="type" required defaultValue="EXPENSE" items={[{ value: "INCOME", label: tc("type.INCOME") }, { value: "EXPENSE", label: tc("type.EXPENSE") }]}>
                    <SelectTrigger id="type">
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

              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">{t("categories.incomeTitle")}</h4>
                  <div className="space-y-2">
                    {incomeCategories.map((c) => (
                      <div key={c.id} className="flex items-center justify-between bg-muted/50 p-2 rounded-md">
                        <span className="text-sm">{c.name}</span>
                        <div className="flex items-center gap-1">
                          <EditCategoryDialog category={c} action={updateCategory} />
                          <DeleteCategoryButton id={c.id} name={c.name} />
                        </div>
                      </div>
                    ))}
                    {incomeCategories.length === 0 && <p className="text-xs text-muted-foreground">{t("categories.noIncome")}</p>}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">{t("categories.expenseTitle")}</h4>
                  <div className="space-y-2">
                    {expenseCategories.map((c) => (
                      <div key={c.id} className="flex items-center justify-between bg-muted/50 p-2 rounded-md">
                        <span className="text-sm">{c.name}</span>
                        <div className="flex items-center gap-1">
                          <EditCategoryDialog category={c} action={updateCategory} />
                          <DeleteCategoryButton id={c.id} name={c.name} />
                        </div>
                      </div>
                    ))}
                    {expenseCategories.length === 0 && <p className="text-xs text-muted-foreground">{t("categories.noExpense")}</p>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Unit Rates Section */}
          <Card>
            <CardHeader>
              <CardTitle>{t("unitRates.title")}</CardTitle>
              <CardDescription>{t("unitRates.description")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ActionForm action={createUnitRate} success={t("unitRates.toast.added")} className="flex gap-4 items-end flex-wrap">
                <div className="space-y-2 flex-1 min-w-[200px]">
                  <Label htmlFor="description">{t("fields.description")}</Label>
                  <Input id="description" name="description" placeholder={t("unitRates.descriptionPlaceholder")} required />
                </div>
                <div className="space-y-2 w-32">
                  <Label htmlFor="rate">{t("fields.rate")}</Label>
                  <Input id="rate" name="rate" type="number" step="0.01" min="0" placeholder={t("unitRates.ratePlaceholder")} required />
                </div>
                <div className="space-y-2 w-32">
                  <Label htmlFor="unit">{t("fields.unit")}</Label>
                  <Select name="unit" required defaultValue="hours" items={[{ value: "hours", label: t("unitRates.units.hours") }, { value: "project", label: t("unitRates.units.project") }, { value: "manday", label: t("unitRates.units.manday") }]}>
                    <SelectTrigger id="unit">
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

              <div className="space-y-2">
                {unitRates.map((r) => (
                  <div key={r.id} className="flex items-center justify-between bg-muted/50 p-2 rounded-md">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{r.description}</span>
                      <span className="text-xs text-muted-foreground">{t("unitRates.rateLine", { rate: r.rate, unit: unitPer[r.unit] ?? r.unit })}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <EditUnitRateDialog unitRate={r} action={updateUnitRate} />
                      <ActionForm action={deleteUnitRate.bind(null, r.id)} success={t("unitRates.toast.deleted")}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </ActionForm>
                    </div>
                  </div>
                ))}
                {unitRates.length === 0 && <p className="text-xs text-muted-foreground">{t("unitRates.empty")}</p>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          {/* Global Settings Section */}
          <Card>
            <CardHeader>
              <CardTitle>{t("exchangeRate.title")}</CardTitle>
              <CardDescription>{t("exchangeRate.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6 bg-muted/50 p-4 rounded-lg flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">{t("exchangeRate.current")}</p>
                  <p className="text-2xl font-bold text-primary">
                    {new Intl.NumberFormat('vi-VN').format(currentUser?.defaultUsdRate || 25400)} <span className="text-sm font-normal text-muted-foreground">VND / USD</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">{t("exchangeRate.lastUpdated")}</p>
                  <p className="text-sm font-medium">
                    {currentUser?.updatedAt ? fmtDate(currentUser.updatedAt, locale, { timeZone: "Asia/Ho_Chi_Minh" }) : t("exchangeRate.never")}
                  </p>
                </div>
              </div>

              <ActionForm action={updateExchangeRate} success={t("exchangeRate.toast.updated")} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rate">{t("exchangeRate.newRate")}</Label>
                  <Input key={currentUser?.defaultUsdRate} id="rate" name="rate" type="number" step="0.01" defaultValue={currentUser?.defaultUsdRate} required />
                  <p className="text-xs text-muted-foreground">{t("exchangeRate.hint")}</p>
                </div>
                <Button type="submit">{t("exchangeRate.submit")}</Button>
              </ActionForm>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
