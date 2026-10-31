import { prisma } from "@/lib/prisma";
import { requirePageSession } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { ProfileForm } from "@/components/profile/profile-form";
import { CurrencyForm } from "@/components/profile/currency-form";
import { defaultUsdRate } from "@/lib/fx";
import { intlLocale } from "@/i18n/config";
import { getTranslations, getLocale } from "next-intl/server";
import { fmtDate } from "@/lib/format";
import { PageHeader } from "@/components/wf/page-header";
import { Chip, PanelHead } from "@/components/wf/ledger-ui";

export default async function ProfilePage() {
  const session = await requirePageSession();
  const t = await getTranslations("profile");
  const tc = await getTranslations("common");
  const locale = await getLocale();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { username: true, displayName: true, displayCurrency: true, role: true, twoFactorEnabled: true, createdAt: true },
  });
  if (!user) return null;
  const rate = new Intl.NumberFormat(intlLocale(locale)).format(await defaultUsdRate());

  const rows: [string, React.ReactNode][] = [
    [t("account.username"), <span key="u" className="wf-num font-semibold text-foreground">{user.username}</span>],
    [t("account.role"), user.role === "ADMIN" ? t("roles.ADMIN") : t("roles.USER")],
    [t("account.twoFactor"), user.twoFactorEnabled
      ? <Chip key="2fa" tone="pos" mono dot>{t("account.twoFactorEnabled")}</Chip>
      : <Chip key="2fa" tone="warn" mono dot>{t("account.twoFactorNotSetUp")}</Chip>],
    [t("account.memberSince"), <span key="d" className="wf-num">{fmtDate(user.createdAt, locale, { timeZone: "Asia/Ho_Chi_Minh" })}</span>],
  ];

  return (
    <div>
      <PageHeader kicker={tc("header.profile")} title={t("page.title")} description={t("page.subtitle")} />

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="lg:col-span-6">
          <PanelHead title={t("name.title")} />
          <CardContent className="grid gap-4">
            <p className="text-[14.5px] text-muted-foreground">{t("name.description")}</p>
            <ProfileForm displayName={user.displayName ?? ""} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-6">
          <PanelHead title={t("currency.title")} />
          <CardContent className="grid gap-4">
            <p className="text-[14.5px] text-muted-foreground">{t("currency.description", { rate })}</p>
            <CurrencyForm current={user.displayCurrency} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-6">
          <PanelHead title={t("account.title")} />
          <p className="border-b border-border px-5 py-3 text-[14.5px] text-muted-foreground">{t("account.description")}</p>
          <dl>
            {rows.map(([label, value]) => (
              <div key={label} className="flex min-h-12 items-center justify-between gap-4 border-t border-border px-5 py-3 first:border-t-0">
                <dt className="wf-label">{label}</dt>
                <dd className="text-right text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  );
}
