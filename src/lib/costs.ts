// Cost register vocabulary (client-safe). The keys validate input and order the
// choices; what the user sees comes from messages/<locale>/costs.json.

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
