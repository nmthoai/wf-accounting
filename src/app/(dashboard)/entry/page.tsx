import { prisma } from "@/lib/prisma";
import { EntryForm } from "./entry-form";
import { defaultUsdRate } from "@/lib/fx";
import { auth } from "@/auth";

export default async function NewEntryPage() {
  const [session, usdRate, accounts, categories, projects, vendors] = await Promise.all([
    auth(),
    defaultUsdRate(),
    prisma.account.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, name: true, currency: true, type: true, isActive: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
    prisma.project.findMany({ where: { status: { not: "ARCHIVED" } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.vendor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">New Entry</h1>
        <p className="text-muted-foreground mt-1">Log a new income or expense transaction</p>
      </div>

      <EntryForm
        categories={categories}
        projects={projects}
        vendors={vendors}
        accounts={accounts}
        defaultUsdRate={usdRate}
        isAdmin={session?.user?.role === "ADMIN"}
      />
    </div>
  );
}
