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
- ~~Balance tab~~ — replaced by the typed cash book (Accounts, Oct 2026).
- **Chart of accounts** — clean income/expense categories.
- **Monthly P&L report** — income & expenses by category for any month, with a
  prior-month comparison (Reports tab).

### Small additions (Sept 2026)
- Edit invoices & bills in place; ZIP attachments with original filenames;
  Excel export of ledger entries and invoices by date range.

### Accounting controls — the October 2026 build list (all live)
Built against the 4 Oct 2026 accounting review and the real MB statements.
1. **Typed cash book** — every movement has an account (MB VND, MB USD, term
   deposit, company cash, owner-paid, owner-held cash); balances per account and
   per currency, never summed across currencies.
2. **Transfers, capital & loans** — linked transfer legs, capital contributions,
   a loan register (received / repaid / outstanding); none of it touches P&L.
3. **Invoice ↔ payment matching** — many-to-many allocations; gross, received
   and *evidenced* fees; any remainder shown as an unmatched difference.
4. **Bookkeeping kept apart from tax** — document status, business purpose,
   CIT deductibility and input VAT per entry; all pending until reviewed.
5. **Bank import & reconciliation** — MB statement import (balance-checked:
   opening + in − out = closing), duplicate-safe, suggested matches,
   unreconciled lines both ways.
6. **Per-transaction FX** — original currency, actual VND settled, rate source.
7. **Draft → Reviewed → Posted + change history** — staff entries start as
   drafts; posting locks; corrections by reversal; who/what/when/why logged.
8. **Cost register** — cloud services and owner-paid costs from receipts;
   pending until reviewed, then into the ledger once (duplicate check).
9. **Accountant handover** — a monthly ZIP: ledger, invoices, bank
   reconciliation, missing documents, open questions and history, each entry
   linked to its evidence files.

---

## 🛣️ Roadmap

### Next
- **Gini** — the in-app accounting assistant (chat over the books, fenced to
  WF accounting and Vietnamese accounting law/news; confirm-first actions;
  Anthropic / OpenRouter / Ollama-RunPod providers). Plan agreed, not started.
- **Off-server backup** (push the nightly archive to another host / object store).

### Intelligence ideas (fold into Gini)
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

1. **Invoices & bills** → record them when issued/received; **Record payment**
   when money moves (or link an existing ledger entry — one transfer can pay several).
2. **Cloud & owner-paid receipts** → *Costs* → add the receipt; later **To ledger**
   (it offers to link an expense that's already there instead of duplicating it).
3. **Each month** → *Bank* → import both MB statements (the import refuses a file
   that doesn't add up) → accept suggested matches → **+** for new income/expense
   lines → record transfers, capital and loans on *Accounts*, then match them.
4. **Review** → approve drafts (*Ledger → Drafts*), set evidence and the
   accountant's CIT/VAT decisions, then **Post reviewed entries through** the month end.
5. **Handover** → *Handover* → check the list → download the month's ZIP for the accountant.

**One rule:** never log the same money twice — payments go through the invoice
(or are linked to it), bank lines are matched rather than re-entered, and register
receipts are linked when the expense already exists.
