import { prisma } from "@/lib/prisma";
import { EntryForm } from "./entry-form";
import { auth } from "@/auth";

export default async function NewEntryPage() {
  const session = await auth();
  const currentUser = await prisma.user.findUnique({ where: { id: session?.user?.id } });
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });
  const projects = await prisma.project.findMany({
    where: { status: { not: "ARCHIVED" } },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
  const vendors = await prisma.vendor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });

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
        defaultUsdRate={currentUser?.defaultUsdRate || 25400}
      />
    </div>
  );
}
