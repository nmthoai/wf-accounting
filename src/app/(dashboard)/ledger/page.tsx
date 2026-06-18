import { prisma } from "@/lib/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { deleteTransaction } from "@/app/actions/ledger";
import { Trash2, Paperclip } from "lucide-react";
import Link from "next/link";

export default async function LedgerPage() {
  const transactions = await prisma.transaction.findMany({
    orderBy: { date: "desc" },
    include: {
      category: true,
      attachments: true,
    },
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-serif font-bold text-primary">Ledger</h1>
          <p className="text-muted-foreground mt-1">All recorded transactions</p>
        </div>
        <Link href="/entry">
          <Button>New Entry</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Invoice #</TableHead>
                <TableHead>Attachments</TableHead>
                <TableHead className="text-right">Amount (VND)</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transactions.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium whitespace-nowrap">{t.date.toLocaleDateString()}</TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${t.type === "INCOME" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                      {t.type}
                    </span>
                  </TableCell>
                  <TableCell>{t.category?.name || "Uncategorized"}</TableCell>
                  <TableCell className="max-w-[200px] truncate" title={t.description || ""}>{t.description}</TableCell>
                  <TableCell>{t.invoiceNumber || "-"}</TableCell>
                  <TableCell>
                    {t.attachments.length > 0 ? (
                      <div className="flex gap-2">
                        {t.attachments.map(a => (
                          <a key={a.id} href={a.filePath} target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-700">
                            <Paperclip className="h-4 w-4" />
                          </a>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold">
                    <div className="flex flex-col items-end">
                      <span>
                        {t.currency === "USD" 
                          ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(t.amount)
                          : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(t.amount)
                        }
                      </span>
                      {t.currency === "USD" && (
                        <span className="text-xs text-muted-foreground font-normal">
                          {new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(t.amount * t.exchangeRate)}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <Link href={`/entry/${t.id}`}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-edit-2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </Button>
                      </Link>
                      <form action={deleteTransaction.bind(null, t.id)}>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </form>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {transactions.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    No transactions found. Click "New Entry" to add one.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
