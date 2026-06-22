import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createCategory, updateCategory, deleteCategory, updateExchangeRate, createUnitRate, updateUnitRate, deleteUnitRate } from "@/app/actions/settings";
import { Trash2 } from "lucide-react";
import { auth } from "@/auth";

import { UserManagement } from "@/components/settings/user-management";
import { EditCategoryDialog } from "@/components/settings/edit-category-dialog";
import { EditUnitRateDialog } from "@/components/settings/edit-unit-rate-dialog";

export default async function SettingsPage() {
  const session = await auth();
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

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Settings</h1>
        <p className="text-muted-foreground mt-1">Manage categories and bank balance</p>
      </div>

      {isAdmin && session?.user?.id && (
        <UserManagement users={users} currentUserId={session.user.id} />
      )}

      <div className="grid gap-8 md:grid-cols-2">
        <div className="space-y-8">
          {/* Categories Section */}
          <Card>
            <CardHeader>
              <CardTitle>Categories</CardTitle>
              <CardDescription>Manage Invoice and Cost types</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form action={createCategory} className="flex gap-4 items-end">
                <div className="space-y-2 flex-1">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" name="name" placeholder="e.g. Software License" required />
                </div>
                <div className="space-y-2 w-1/3">
                  <Label htmlFor="type">Type</Label>
                  <Select name="type" required defaultValue="EXPENSE">
                    <SelectTrigger id="type">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="INCOME">Income</SelectItem>
                      <SelectItem value="EXPENSE">Expense</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit">Add</Button>
              </form>

              <div className="space-y-4">
                <div>
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">Income Categories</h4>
                  <div className="space-y-2">
                    {incomeCategories.map((c) => (
                      <div key={c.id} className="flex items-center justify-between bg-muted/50 p-2 rounded-md">
                        <span className="text-sm">{c.name}</span>
                        <div className="flex items-center gap-1">
                          <EditCategoryDialog category={c} action={updateCategory} />
                          <form action={deleteCategory.bind(null, c.id)}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                          </form>
                        </div>
                      </div>
                    ))}
                    {incomeCategories.length === 0 && <p className="text-xs text-muted-foreground">No income categories.</p>}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2 text-muted-foreground">Expense Categories</h4>
                  <div className="space-y-2">
                    {expenseCategories.map((c) => (
                      <div key={c.id} className="flex items-center justify-between bg-muted/50 p-2 rounded-md">
                        <span className="text-sm">{c.name}</span>
                        <div className="flex items-center gap-1">
                          <EditCategoryDialog category={c} action={updateCategory} />
                          <form action={deleteCategory.bind(null, c.id)}>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                          </form>
                        </div>
                      </div>
                    ))}
                    {expenseCategories.length === 0 && <p className="text-xs text-muted-foreground">No expense categories.</p>}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Unit Rates Section */}
          <Card>
            <CardHeader>
              <CardTitle>Unit Rates</CardTitle>
              <CardDescription>Reference for billing rates (Hours, Projects, Mandays)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form action={createUnitRate} className="flex gap-4 items-end flex-wrap">
                <div className="space-y-2 flex-1 min-w-[200px]">
                  <Label htmlFor="description">Description</Label>
                  <Input id="description" name="description" placeholder="e.g. Senior Developer" required />
                </div>
                <div className="space-y-2 w-32">
                  <Label htmlFor="rate">Rate (USD)</Label>
                  <Input id="rate" name="rate" type="number" step="0.01" min="0" placeholder="e.g. 50" required />
                </div>
                <div className="space-y-2 w-32">
                  <Label htmlFor="unit">Unit</Label>
                  <Select name="unit" required defaultValue="hours">
                    <SelectTrigger id="unit">
                      <SelectValue placeholder="Unit" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hours">Hours</SelectItem>
                      <SelectItem value="project">Project</SelectItem>
                      <SelectItem value="manday">Manday</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit">Add</Button>
              </form>

              <div className="space-y-2">
                {unitRates.map((r) => (
                  <div key={r.id} className="flex items-center justify-between bg-muted/50 p-2 rounded-md">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium">{r.description}</span>
                      <span className="text-xs text-muted-foreground">${r.rate} / {r.unit}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <EditUnitRateDialog unitRate={r} action={updateUnitRate} />
                      <form action={deleteUnitRate.bind(null, r.id)}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive"><Trash2 className="h-4 w-4" /></Button>
                      </form>
                    </div>
                  </div>
                ))}
                {unitRates.length === 0 && <p className="text-xs text-muted-foreground">No unit rates defined.</p>}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-8">
          {/* Global Settings Section */}
          <Card>
            <CardHeader>
              <CardTitle>Global Settings</CardTitle>
              <CardDescription>Default system values</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-6 bg-muted/50 p-4 rounded-lg flex justify-between items-center">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Current Rate</p>
                  <p className="text-2xl font-bold text-primary">
                    {new Intl.NumberFormat('vi-VN').format(currentUser?.defaultUsdRate || 25400)} <span className="text-sm font-normal text-muted-foreground">VND / USD</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Last updated</p>
                  <p className="text-sm font-medium">
                    {currentUser?.updatedAt ? currentUser.updatedAt.toLocaleDateString() : "Never"}
                  </p>
                </div>
              </div>

              <form action={updateExchangeRate} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="rate">Set New Exchange Rate</Label>
                  <Input key={currentUser?.defaultUsdRate} id="rate" name="rate" type="number" step="0.01" defaultValue={currentUser?.defaultUsdRate} required />
                  <p className="text-xs text-muted-foreground">This rate will automatically populate when logging USD transactions.</p>
                </div>
                <Button type="submit">Update Rate</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
