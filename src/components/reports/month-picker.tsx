"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function MonthPicker({ month }: { month: string }) {
  const router = useRouter();
  const go = (m: string) => router.push(`/reports?month=${m}`);

  const shift = (delta: number) => {
    const [y, mo] = month.split("-").map(Number);
    const d = new Date(y, mo - 1 + delta, 1);
    go(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shift(-1)} aria-label="Previous month">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <input
        type="month"
        value={month}
        onChange={(e) => e.target.value && go(e.target.value)}
        className="h-9 rounded-md border border-input bg-background px-3 text-sm shadow-sm"
      />
      <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => shift(1)} aria-label="Next month">
        <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
