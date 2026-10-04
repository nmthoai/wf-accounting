// Evidence and tax review for income/expense entries. Bookkeeping records what
// happened; these record what has been shown and decided. Nothing here is set
// automatically — a bank-confirmed payment stays "pending" until reviewed.

export const DOC_STATUS: Record<string, string> = {
  PENDING: "Not checked",
  INVOICE: "Invoice on file",
  RECEIPT: "Receipt only",
  PAYMENT_ONLY: "Payment proof only",
  MISSING: "Invoice missing",
};

export const PURPOSE_STATUS: Record<string, string> = {
  PENDING: "Not confirmed",
  CONFIRMED: "Business use confirmed",
  PERSONAL: "Personal — not company",
};

export const CIT_STATUS: Record<string, string> = {
  PENDING: "Pending review",
  DEDUCTIBLE: "Deductible",
  NON_DEDUCTIBLE: "Not deductible",
};

export const VAT_STATUS: Record<string, string> = {
  PENDING: "Pending review",
  CLAIMABLE: "Claimable",
  NOT_CLAIMABLE: "Not claimable",
  NO_VAT: "No VAT on document",
};

export const DOC_BADGE: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-600",
  INVOICE: "bg-green-100 text-green-700",
  RECEIPT: "bg-blue-100 text-blue-700",
  PAYMENT_ONLY: "bg-amber-100 text-amber-700",
  MISSING: "bg-red-100 text-red-700",
};

// Documents still to be found or confirmed.
export const DOC_OPEN = ["PENDING", "PAYMENT_ONLY", "MISSING"];

export type Review = {
  type: string;
  amount: number;
  docStatus: string;
  purposeStatus: string;
  citStatus: string;
  vatStatus: string;
  vatAmount: number | null;
  reviewNote: string | null;
};

// Consistency of the decisions with the evidence. These are prerequisites, not
// tax rules — the accountant's decision is recorded, never derived.
export function reviewProblem(r: Review): string | null {
  if (!(r.docStatus in DOC_STATUS)) return "Unknown document status.";
  if (r.type !== "EXPENSE") return null;
  if (!(r.purposeStatus in PURPOSE_STATUS) || !(r.citStatus in CIT_STATUS) || !(r.vatStatus in VAT_STATUS)) return "Unknown review status.";
  if (r.vatAmount != null && (!(r.vatAmount >= 0) || r.vatAmount >= r.amount)) return "The VAT amount must be less than the entry amount.";
  if ((r.citStatus === "DEDUCTIBLE" || r.vatStatus === "CLAIMABLE") && r.purposeStatus !== "CONFIRMED") {
    return "Confirm business use before marking it deductible or its VAT claimable.";
  }
  if (r.citStatus === "DEDUCTIBLE" && r.docStatus !== "INVOICE" && r.docStatus !== "RECEIPT" && !r.reviewNote?.trim()) {
    return "There is no invoice or receipt on file — record the accountant's basis for deducting it in the review note.";
  }
  if (r.vatStatus === "CLAIMABLE" && r.docStatus !== "INVOICE") return "Input VAT can only be claimable with the invoice on file.";
  if (r.vatStatus === "CLAIMABLE" && !(r.vatAmount && r.vatAmount > 0)) return "Enter the VAT amount printed on the invoice.";
  return null;
}
