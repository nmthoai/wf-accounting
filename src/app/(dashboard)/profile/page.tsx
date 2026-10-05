import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileForm } from "@/components/profile/profile-form";

export default async function ProfilePage() {
  const session = await requirePageSession();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, displayName: true, role: true, twoFactorEnabled: true, createdAt: true },
  });
  if (!user) return null;

  const rows: [string, React.ReactNode][] = [
    ["Username", <span key="u" className="font-mono">{user.username}</span>],
    ["Role", user.role === "ADMIN" ? "Admin" : "Staff"],
    ["Two-factor sign-in", user.twoFactorEnabled
      ? <span key="2fa" className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Enabled</span>
      : <span key="2fa" className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700">Not set up</span>],
    ["Member since", user.createdAt.toLocaleDateString(undefined, { timeZone: "Asia/Ho_Chi_Minh" })],
  ];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-3xl font-serif font-bold text-primary">Profile</h1>
        <p className="text-muted-foreground mt-1">Your name and account details</p>
      </div>

      <div className="grid gap-8 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your name</CardTitle>
            <CardDescription>Shown in the greeting at the top. Leave it empty to use your username.</CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileForm displayName={user.displayName ?? ""} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>To change your password or reset two-factor sign-in, ask an admin.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="divide-y">
              {rows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between gap-4 py-2.5">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="font-medium text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
