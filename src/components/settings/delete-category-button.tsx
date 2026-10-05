"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Loader2, Trash2 } from "lucide-react";
import { deleteCategory } from "@/app/actions/settings";

// Delete a category — refused, with the reason, while entries or invoices use it.
export function DeleteCategoryButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!confirm(`Delete the category "${name}"?`)) return;
    setBusy(true);
    try {
      const res = await deleteCategory(id);
      if (!res.success) alert(res.message);
      router.refresh();
    } finally { setBusy(false); }
  }
  return (
    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={busy} onClick={remove} title="Delete">
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
    </Button>
  );
}
