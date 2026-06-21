"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Loader2, FolderPlus, UserPlus, Truck } from "lucide-react";
import { createClient, deleteClient } from "@/app/actions/clients";
import { createVendor, deleteVendor } from "@/app/actions/vendors";
import { createProject, deleteProject, updateProject } from "@/app/actions/projects";

type ProjectRow = {
  id: string; name: string; status: string; clientId: string | null; clientName: string | null;
  income: number; expense: number; net: number; txnCount: number;
};
type ClientRow = { id: string; name: string; email: string | null; projectCount: number; invoiceCount: number };
type VendorRow = { id: string; name: string; email: string | null; spend: number; txnCount: number };

const vnd = (n: number) => new Intl.NumberFormat("vi-VN").format(Math.round(n)) + " ₫";

export function ProjectsClient({ projects, clients, vendors }: { projects: ProjectRow[]; clients: ClientRow[]; vendors: VendorRow[] }) {
  const router = useRouter();
  const [addingProject, setAddingProject] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [addingVendor, setAddingVendor] = useState(false);
  const [projectClientId, setProjectClientId] = useState("");
  const [err, setErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function run(id: string, fn: () => Promise<{ success: boolean; message?: string }>) {
    setBusyId(id);
    try {
      const res = await fn();
      if (!res.success && res.message) alert(res.message);
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function handleAddProject(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddingProject(true);
    setErr("");
    const form = e.currentTarget;
    const fd = new FormData(form);
    fd.set("clientId", projectClientId);
    try {
      const res = await createProject(fd);
      if (!res.success) { setErr(res.message || "Could not create project."); return; }
      form.reset();
      setProjectClientId("");
      router.refresh();
    } finally {
      setAddingProject(false);
    }
  }

  async function handleAddClient(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddingClient(true);
    const form = e.currentTarget;
    try {
      const res = await createClient(new FormData(form));
      if (!res.success) { alert(res.message); return; }
      form.reset();
      router.refresh();
    } finally {
      setAddingClient(false);
    }
  }

  async function handleAddVendor(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddingVendor(true);
    const form = e.currentTarget;
    try {
      const res = await createVendor(new FormData(form));
      if (!res.success) { alert(res.message); return; }
      form.reset();
      router.refresh();
    } finally {
      setAddingVendor(false);
    }
  }

  const statusBadge = (s: string) => {
    const map: Record<string, string> = {
      ACTIVE: "bg-green-100 text-green-700",
      DONE: "bg-blue-100 text-blue-700",
      ARCHIVED: "bg-gray-200 text-gray-600",
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[s] || ""}`}>{s}</span>;
  };

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Project profitability</CardTitle>
          <CardDescription>Net = income − expenses from transactions tagged to each project (actual cash).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleAddProject} className="flex gap-3 items-end flex-wrap">
            <div className="space-y-2 flex-1 min-w-[160px]">
              <Label htmlFor="name">New project</Label>
              <Input id="name" name="name" placeholder="e.g. AI Character Dev" required />
            </div>
            <div className="space-y-2 w-44">
              <Label>Client</Label>
              <Select value={projectClientId} onValueChange={(v) => setProjectClientId(v === "none" ? "" : v || "")}>
                <SelectTrigger>
                  {projectClientId ? <span>{clients.find(c => c.id === projectClientId)?.name}</span> : <span className="text-muted-foreground">No client</span>}
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No client</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={addingProject} className="gap-2">
              {addingProject ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderPlus className="h-4 w-4" />} Add
            </Button>
          </form>
          {err && <p className="text-sm text-destructive">{err}</p>}

          <div className="space-y-2">
            {projects.map((p) => (
              <div key={p.id} className="flex items-center justify-between gap-3 bg-muted/50 p-3 rounded-md flex-wrap">
                <div className="flex flex-col min-w-[140px]">
                  <span className="text-sm font-medium flex items-center gap-2">{p.name} {statusBadge(p.status)}</span>
                  <span className="text-xs text-muted-foreground">{p.clientName || "No client"} · {p.txnCount} txns</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-green-600">{vnd(p.income)}</span>
                  <span className="text-red-600">−{vnd(p.expense)}</span>
                  <span className={`font-semibold ${p.net >= 0 ? "text-primary" : "text-red-600"}`}>{vnd(p.net)}</span>
                  {p.status !== "ARCHIVED" ? (
                    <Button variant="outline" size="sm" className="h-8" disabled={busyId === p.id}
                      onClick={() => { const fd = new FormData(); fd.set("name", p.name); fd.set("clientId", p.clientId || ""); fd.set("status", "ARCHIVED"); run(p.id, () => updateProject(p.id, fd)); }}>
                      Archive
                    </Button>
                  ) : (
                    <Button variant="outline" size="sm" className="h-8" disabled={busyId === p.id}
                      onClick={() => { const fd = new FormData(); fd.set("name", p.name); fd.set("clientId", p.clientId || ""); fd.set("status", "ACTIVE"); run(p.id, () => updateProject(p.id, fd)); }}>
                      Reactivate
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled={busyId === p.id}
                    onClick={() => { if (confirm(`Delete project ${p.name}?`)) run(p.id, () => deleteProject(p.id)); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {projects.length === 0 && <p className="text-sm text-muted-foreground">No projects yet.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Clients</CardTitle>
          <CardDescription>Who you invoice and run projects for.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleAddClient} className="flex gap-3 items-end flex-wrap">
            <div className="space-y-2 flex-1 min-w-[160px]">
              <Label htmlFor="cname">Name</Label>
              <Input id="cname" name="name" placeholder="e.g. Acme Co" required />
            </div>
            <div className="space-y-2 flex-1 min-w-[160px]">
              <Label htmlFor="cemail">Email (optional)</Label>
              <Input id="cemail" name="email" type="email" placeholder="billing@acme.co" />
            </div>
            <Button type="submit" disabled={addingClient} className="gap-2">
              {addingClient ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Add
            </Button>
          </form>
          <div className="space-y-2">
            {clients.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-2 bg-muted/50 p-3 rounded-md">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.email || "—"} · {c.projectCount} projects · {c.invoiceCount} invoices</span>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled={busyId === c.id}
                  onClick={() => { if (confirm(`Delete client ${c.name}?`)) run(c.id, () => deleteClient(c.id)); }}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            {clients.length === 0 && <p className="text-sm text-muted-foreground">No clients yet.</p>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Vendors</CardTitle>
          <CardDescription>Who you pay (e.g. subcontractors, services). Spend is total expenses tagged to them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <form onSubmit={handleAddVendor} className="flex gap-3 items-end flex-wrap">
            <div className="space-y-2 flex-1 min-w-[160px]">
              <Label htmlFor="vname">Name</Label>
              <Input id="vname" name="name" placeholder="e.g. ZDN" required />
            </div>
            <div className="space-y-2 flex-1 min-w-[160px]">
              <Label htmlFor="vemail">Email (optional)</Label>
              <Input id="vemail" name="email" type="email" placeholder="billing@zdn.co" />
            </div>
            <Button type="submit" disabled={addingVendor} className="gap-2">
              {addingVendor ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />} Add
            </Button>
          </form>
          <div className="space-y-2">
            {vendors.map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 bg-muted/50 p-3 rounded-md">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{v.name}</span>
                  <span className="text-xs text-muted-foreground">{v.email || "—"} · {v.txnCount} payments</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-red-600">{vnd(v.spend)}</span>
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:bg-destructive/10" disabled={busyId === v.id}
                    onClick={() => { if (confirm(`Delete vendor ${v.name}?`)) run(v.id, () => deleteVendor(v.id)); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
            {vendors.length === 0 && <p className="text-sm text-muted-foreground">No vendors yet.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
