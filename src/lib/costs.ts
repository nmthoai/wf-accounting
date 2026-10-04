// Cost register vocabulary (client-safe).

export const PAYER: Record<string, string> = {
  COMPANY: "Company",
  OWNER: "Owner, personally",
  UNKNOWN: "Not established",
};

export const REIMBURSEMENT: Record<string, string> = {
  UNRESOLVED: "Unresolved",
  NOT_NEEDED: "Not needed — company paid",
  OWED: "Company owes the owner",
  REIMBURSED: "Reimbursed",
};

export const COST_STATUS: Record<string, string> = {
  PENDING: "Pending review",
  CONVERTED: "In the ledger",
  DISMISSED: "Not a company cost",
};
