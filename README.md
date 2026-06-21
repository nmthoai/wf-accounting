# Workfactory Accounting Tracker

A simple-but-intelligent finance tracker for a small AI / software services company —
a private **lock-box** for tracking invoices, costs, project profitability and cash.
Built with Next.js, Prisma ORM and Tailwind CSS. Operates on a **cash basis** (income
and expenses count when money actually moves; committed-but-unpaid amounts live as open
invoices/bills).

See **[ROADMAP.md](./ROADMAP.md)** for progress, what's next, and the day-to-day routine.

## Key Features

- **Dashboard**: Cash on Hand, Net Surplus, Income/Expenses, **Coming Payments**
  (what you'll pay vs receive), and top projects by profit.
- **Invoices & Bills (AR/AP)**: Two-way tracking — *Receivable* (client owes you) and
  *Payable* (you owe a vendor). Lifecycle **Open → Paid**; marking paid auto-creates the
  ledger entry. Each carries a category, project, due date and the real PDF.
- **Projects**: Per-project profitability with a **cost breakdown by category**, a
  transaction log, and an **Outstanding (unpaid)** list per project.
- **Clients & Vendors**: Manage who you invoice and who you pay (spend-per-vendor).
- **Balance**: Bank cash via an opening balance + deposits/withdrawals, with business
  income/expenses auto-tracked from the ledger.
- **Ledger & Categories**: Full transaction history (with attachments + "from invoice"
  flags) and a clean chart of accounts.
- **Lock-box security**: Invite-only, no public sign-up. Forced onboarding (change
  password → 2FA). Admin-only user management. Auth-protected receipt files. Daily backups.

## Tech Stack

- **Framework**: [Next.js 15](https://nextjs.org/) (App Router, Server Actions)
- **Database ORM**: [Prisma](https://www.prisma.io/) 
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **UI Components**: [shadcn/ui](https://ui.shadcn.com/) (Base UI)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Language**: TypeScript

## Getting Started

### Prerequisites
- Node.js 18+ installed
- PostgreSQL database (or configured SQLite)

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd wf-accounting
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   Create a `.env` file in the root directory and add your database connection string and JWT secret:
   ```env
   DATABASE_URL="file:./dev.db" # Default SQLite setup
   JWT_SECRET="your_super_secret_key_here"
   ```

4. **Initialize the database:**
   ```bash
   npx prisma db push
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result. The application will immediately prompt for a login.

## Application Structure

- `/src/app/(dashboard)`: The authenticated app — Dashboard (`/`), Ledger (`/ledger`),
  Invoices & Bills (`/invoices`), Projects (`/projects`, `/projects/[id]`),
  Clients & Vendors (`/contacts`), Balance (`/balance`), New Entry (`/entry`), Settings (`/settings`).
- `/src/app/onboard`: First-run wizard (change password → enrol 2FA).
- `/src/app/actions`: Server actions (auth, users, ledger, invoices, clients, vendors, projects, balance, settings).
- `/src/app/api`: Auth endpoints and the auth-protected `/api/uploads/[name]` file route.
- `/src/components`: UI components, layout (Sidebar, TopNav), and per-feature client components.
- `/src/lib`: Prisma client and the shared uploads helper.
- `prisma/schema.prisma`: Schema — Users, Clients, Vendors, Projects, Invoices, Transactions,
  Attachments, Categories, BankBalance (movements), UnitRates.

## Contributing

Feedback, issues, and pull requests are welcome!

---
*Built for Workfactory.*
