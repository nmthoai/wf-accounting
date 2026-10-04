import { redirect } from "next/navigation";

// The single "Balance" pot was replaced by per-account balances.
export default function BalancePage() {
  redirect("/accounts");
}
