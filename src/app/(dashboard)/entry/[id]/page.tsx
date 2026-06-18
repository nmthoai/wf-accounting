import { prisma } from "@/lib/prisma";
import { EntryForm } from "../entry-form";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function EditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  const currentUser = await prisma.user.findUnique({ where: { id: session?.user?.id } });
  const categories = await prisma.category.findMany({ orderBy: { name: "asc" } });

  const transaction = await prisma.transaction.findUnique({
    where: { id },
  });

  if (!transaction) {
    redirect("/ledger");
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Edit Entry</h1>
        <p className="text-muted-foreground mt-1">Update transaction details</p>
      </div>

      <EntryForm 
        categories={categories} 
        defaultUsdRate={currentUser?.defaultUsdRate || 25400} 
        initialData={transaction} 
      />
    </div>
  );
}
