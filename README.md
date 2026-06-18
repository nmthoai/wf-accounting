# Workfactory Accounting Entry Tracker

A modern, fast, and secure accounting ledger application tailored for recording financial transactions, categorizing entries, and maintaining transparent records. Built with Next.js 15, Prisma ORM, and styled with Tailwind CSS, this app provides a responsive dashboard, ledger overview, and settings management out of the box.

## Key Features

- **Dashboard**: A comprehensive snapshot of the company's financial health, displaying Total Cash, Net Amount, Expenses, and Recent Transactions at a glance.
- **Ledger System**: A detailed and paginated list of all financial entries. Easily browse through income and expenses with descriptions, categorized accurately.
- **Entry Management**: Log new transactions quickly with a streamlined "New Entry" form supporting dates, robust categorized dropdowns, custom units, and amounts.
- **Categorization & Rates**: Define and manage global transaction categories. Maintain reference tables for Unit Rates (e.g., hourly rates, project rates) directly in the Settings dashboard.
- **Authentication**: Secure JWT-based sign-in system using cookies for session management to ensure sensitive financial data is protected.
- **Responsive Design**: Beautifully styled UI utilizing shadcn/ui components, completely responsive from desktop to mobile views, featuring dark/light mode adaptable aesthetics.

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

- `/src/app/(dashboard)`: The authenticated core application containing the Dashboard (`/`), Ledger (`/ledger`), Entry Creation (`/entry`), and Settings (`/settings`).
- `/src/app/api`: Backend routes, including authentication endpoints.
- `/src/components`: Reusable UI components, layout wrappers (Sidebar, TopNav), and customized shadcn elements.
- `/src/lib`: Core libraries and utilities, including Prisma client instantiation and session helpers.
- `prisma/schema.prisma`: The database schema definition representing Transactions, Categories, Users, and Unit Rates.

## Contributing

Feedback, issues, and pull requests are welcome!

---
*Built for Workfactory.*
