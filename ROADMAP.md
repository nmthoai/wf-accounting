# WF Accounting — Progress & Roadmap

A simple-but-intelligent finance tracker for a small AI / software services
company. Tracks **invoices, costs, project profitability, and cash position** —
a private "lock-box" used by the owner (and, optionally, a couple of invited
internal staff).

> Operating model is **cash-basis**: income/expenses count when money actually
> moves; committed-but-unpaid amounts live as **open invoices/bills** (AR/AP).

---

## ✅ Completed

### Foundation & security
- Dockerized deployment behind nginx + auto-renewing TLS.
- **Lock-box auth** — invite-only, no public sign-up. Forced onboarding wizard
  (change default password → enrol 2FA). Admin-only user management
  (create / reset password / reset 2FA / deactivate / delete) with
  self/last-admin guards. ±30s TOTP tolerance.
- Daily backup of the database + uploaded receipts (14-day retention).
- **Session security** — HttpOnly/Secure/SameSite cookies, **12h hard session cap**,
  and **30-min idle auto-logout** (so an unattended browser signs itself out).
- **Brute-force lockout** — 5 failed logins → account locked for 15 min (auto-unlocks,
  so admin can't be permanently locked out). Admins can unlock staff from Settings →
  Users; a server-side `reset-lock.sh` clears an admin's own lock. Clean confirmed sign-out.

### Phase 0 — Trustworthy foundation
- **Fixed the cash math** (previously double-counted the bank balance).
- **Receipts persisted** to the data volume (survive redeploys) and served
  through an **auth-protected** route (financial docs require login).

### Phase 1 — Invoices, costs & projects
- **Clients, Vendors, Projects** (Clients & Vendors live in their own tab).
- **Invoices & Bills** — two-way **AR/AP**: *Receivable* (a client owes you) or
  *Payable* (you owe a vendor). Lifecycle **Open → Paid** (+ Void); marking paid
  auto-creates the matching ledger entry (so AR/AP and cash never double-count).
  Each carries a **category**, **project**, due date, and the real **PDF**.
- **Per-project profitability** + **cost breakdown by category** + transaction log.
- **Project details & documents** — description, start/end dates, and attached
  contracts/files (same secure pipeline as receipts). Editable from the project detail page.
- **Coming Payments** on the dashboard (what you'll pay vs receive) and a
  **per-project "unpaid" badge / Outstanding list**.
- **Balance tab** — bank cash via an opening balance + deposits/withdrawals,
  with business income/expenses auto-tracked from the ledger.
- **Chart of accounts** — clean income/expense categories.
- **Monthly P&L report** — income & expenses by category for any month, with a
  prior-month comparison (Reports tab).

---

## 🛣️ Roadmap

### Near-term
- **Revert invoice → Open** automatically when its ledger entry is deleted.
- **Off-server backup** (push the nightly archive to another host / object store).
- **Edit invoice** — reclassify direction/party/category in place (vs delete+recreate).

### Phase 2 — Intelligence (AI layer, Claude API)
- **Receipt OCR auto-fill** — snap a photo → vendor / amount / date / category.
- **Natural-language entry** — "paid 2.5M for AWS yesterday" → a categorised entry.
- **Auto-categorisation** of new transactions.
- **Monthly narrative insights** — burn rate, runway, "spend rose 18% MoM, …".
- **Ask-your-finances** — "how much did I spend on software in Q2?".

### Later / optional
- Category **budgets** (monthly targets).
- Invoice **line items**.
- **Accrual-basis** toggle (alongside cash-basis).

---

## 🧭 How to use it (the routine)

1. **New client work** → *Projects* → add a project (pick the client).
2. **You bill a client** → *Invoices & Bills → Receivable*; **Mark Paid** when they pay.
3. **A vendor bills you** → *Invoices & Bills → Payable*; **Mark Paid** when you pay.
4. **Recurring/small costs** (cloud, software, fees) → *New Entry → Expense* (tag project + category + vendor).
5. **Non-business bank cash** (capital, owner draw, transfers) → *Balance* tab.
6. **Monthly** → review the Dashboard, check each project's profit, and add a
   Balance adjustment if the app's Cash on Hand drifts from your real bank.

**One rule:** never log the same money twice — invoiced money goes through
*Invoices & Bills*, everything else through *New Entry*. The ledger flags
invoice-generated rows with a "from invoice" badge.
