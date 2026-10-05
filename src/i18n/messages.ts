import type { Locale } from "./config";

import enCommon from "../../messages/en/common.json";
import enAuth from "../../messages/en/auth.json";
import enDashboard from "../../messages/en/dashboard.json";
import enLedger from "../../messages/en/ledger.json";
import enInvoices from "../../messages/en/invoices.json";
import enProjects from "../../messages/en/projects.json";
import enContacts from "../../messages/en/contacts.json";
import enAccounts from "../../messages/en/accounts.json";
import enBank from "../../messages/en/bank.json";
import enCosts from "../../messages/en/costs.json";
import enReports from "../../messages/en/reports.json";
import enHandover from "../../messages/en/handover.json";
import enSettings from "../../messages/en/settings.json";
import enProfile from "../../messages/en/profile.json";

import viCommon from "../../messages/vi/common.json";
import viAuth from "../../messages/vi/auth.json";
import viDashboard from "../../messages/vi/dashboard.json";
import viLedger from "../../messages/vi/ledger.json";
import viInvoices from "../../messages/vi/invoices.json";
import viProjects from "../../messages/vi/projects.json";
import viContacts from "../../messages/vi/contacts.json";
import viAccounts from "../../messages/vi/accounts.json";
import viBank from "../../messages/vi/bank.json";
import viCosts from "../../messages/vi/costs.json";
import viReports from "../../messages/vi/reports.json";
import viHandover from "../../messages/vi/handover.json";
import viSettings from "../../messages/vi/settings.json";
import viProfile from "../../messages/vi/profile.json";

// Static imports (not a dynamic import per locale), so the same loader works in
// Next and in the plain-Node test runner.
type Messages = Record<string, unknown>;

const en: Messages = {
  common: enCommon, auth: enAuth, dashboard: enDashboard, ledger: enLedger, invoices: enInvoices,
  projects: enProjects, contacts: enContacts, accounts: enAccounts, bank: enBank, costs: enCosts,
  reports: enReports, handover: enHandover, settings: enSettings, profile: enProfile,
};
const vi: Messages = {
  common: viCommon, auth: viAuth, dashboard: viDashboard, ledger: viLedger, invoices: viInvoices,
  projects: viProjects, contacts: viContacts, accounts: viAccounts, bank: viBank, costs: viCosts,
  reports: viReports, handover: viHandover, settings: viSettings, profile: viProfile,
};

// A message missing in Vietnamese shows in English rather than as a raw key.
// (tests/unit/i18n.test.ts keeps the two languages complete.)
function withFallback(base: Messages, over: Messages): Messages {
  const out: Messages = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = base[k];
    out[k] = v && typeof v === "object" && b && typeof b === "object"
      ? withFallback(b as Messages, v as Messages)
      : v;
  }
  return out;
}

export const MESSAGES: Record<Locale, Messages> = { en, vi: withFallback(en, vi) };
export const RAW_MESSAGES: Record<Locale, Messages> = { en, vi };
