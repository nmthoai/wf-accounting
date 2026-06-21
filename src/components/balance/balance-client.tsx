"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { Wallet, Loader2, Trash2, ArrowDownLeft, ArrowUpRight, Flag } from "lucide-react";
import { addBankMovement, deleteBankMovement } from "@/app/actions/balance";

type Movement = { id: string; type: string; amount: number; date: string; description: string | null };

const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";

export function BalanceClient({
  movements, hasOpening, summary,
}: {
  movements: Movement[]; hasOpening: boolean;
  summary: { opening: number; deposits: number; withdrawals: number; income: number; expense: number; cashOnHand: number };
}) {
  const router = useRouter();
  const [type, setType] = useState<"DEPOSIT" | "WITHDRAWAL" | "OPENING">("DEPOSIT");
  const [adding, setAdding] = useState(false);
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  async function handleAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAdding(true);
    setErr("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("type", type);
    try {
      const res = await addBankMovement(fd);
      if (!res.success) { setErr(res.message || "Could not save."); return; }
      form.reset();
      router.refresh();
    } finally {
      setAdding(false);
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this movement?")) return;
    setBusyId(id);
    try { await deleteBankMovement(id); router.refresh(); } finally { setBusyId(null); }
  }

  const icon = (t: string) =>
    t === "WITHDRAWAL" ? <ArrowUpRight className="h-4 w-4 text-red-500" />
    : t === "OPENING" ? <Flag className="h-4 w-4 text-primary" />
    : <ArrowDownLeft className="h-4 w-4 text-green-600" />;

  const Row = ({ label, value, sign }: { label: string; value: number; sign: "+" | "−" | "" }) => (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={sign === "−" ? "text-red-600" : sign === "+" ? "text-green-700" : "font-medium"}>
        {sign}{vnd(value)}
      </span>
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Cash on Hand + breakdown */}
      <Card className="lg:col-span-2 bg-primary text-primary-foreground">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Cash on Hand</CardTitle>
          <Wallet className="h-4 w-4 opacity-75" />
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{vnd(summary.cashOnHand)}</div>
          <p className="text-xs opacity-75 mt-1">Opening + deposits − withdrawals + income − expenses</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How it adds up</CardTitle>
          <CardDescription>Income &amp; expenses flow in automatically from the ledger.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Row label="Opening balance" value={summary.opening} sign="" />
          <Row label="Deposits (non-business)" value={summary.deposits} sign="+" />
          <Row label="Withdrawals (non-business)" value={summary.withdrawals} sign="−" />
          <Row label="Business income (ledger)" value={summary.income} sign="+" />
          <Row label="Business expenses (ledger)" value={summary.expense} sign="−" />
          <div className="border-t pt-2 flex items-center justify-between text-sm font-semibold">
            <span>Cash on Hand</span><span className="text-primary">{vnd(summary.cashOnHand)}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add a cash movement</CardTitle>
          <CardDescription>For money in/out that isn&apos;t a ledger income/expense — capital, owner draw, transfers, or the opening balance.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdd} className="space-y-4">
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType((v as "DEPOSIT" | "WITHDRAWAL" | "OPENING") || "DEPOSIT")}>
                <SelectTrigger>
                  <span>{type === "WITHDRAWAL" ? "Withdrawal (−)" : type === "OPENING" ? "Opening balance" : "Deposit (+)"}</span>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEPOSIT">Deposit (+)</SelectItem>
                  <SelectItem value="WITHDRAWAL">Withdrawal (−)</SelectItem>
                  <SelectItem value="OPENING">{hasOpening ? "Opening balance (replaces current)" : "Opening balance"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (VND)</Label>
              <Input id="amount" name="amount" type="number" step="1" min="0" placeholder="e.g. 50000000" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" name="date" type="date" defaultValue={today} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="description">Note (optional)</Label>
              <Input id="description" name="description" placeholder="e.g. Owner capital injection" />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" disabled={adding} className="w-full">
              {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add movement"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader><CardTitle>Movement history</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {movements.map((m) => (
            <div key={m.id} className="flex items-center justify-between gap-2 bg-muted/50 p-3 rounded-md">
              <div className="flex items-center gap-3">
                {icon(m.type)}
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {m.type === "OPENING" ? "Opening balance" : m.type === "WITHDRAWAL" ? "Withdrawal" : "Deposit"}
                  </span>
                  <span className="text-xs text-muted-foreground">{m.date}{m.description ? ` · ${m.description}` : ""}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-semibold ${m.type === "WITHDRAWAL" ? "text-red-600" : "text-green-700"}`}>
                  {m.type === "WITHDRAWAL" ? "−" : "+"}{vnd(m.amount)}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled={busyId === m.id} onClick={() => remove(m.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
          {movements.length === 0 && <p className="text-sm text-muted-foreground">No movements yet. Add your opening balance to start.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
