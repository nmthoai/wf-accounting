"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Edit2 } from "lucide-react";
import { editBankBalance } from "@/app/actions/settings";

export function EditBalanceDialog({ 
  id, 
  currentBalance, 
  currentDescription 
}: { 
  id: string; 
  currentBalance: number; 
  currentDescription: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    await editBankBalance(id, formData);
    setIsOpen(false);
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary" />}>
        <Edit2 className="h-4 w-4" />
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Bank Balance</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4 pt-4">
          <div className="space-y-2">
            <Label htmlFor="balance">Balance (VND)</Label>
            <Input id="balance" name="balance" type="number" step="0.01" defaultValue={currentBalance} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="description">Note</Label>
            <Input id="description" name="description" defaultValue={currentDescription} />
          </div>
          <Button type="submit" className="w-full">Save Changes</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
