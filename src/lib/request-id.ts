// A form submission's id. The form makes a fresh one each time it opens, and
// the server records an entry for it once (Transaction.requestId is unique):
// a double click or a retried save is recognised and not recorded twice.
export const newRequestId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;

// The id as the server reads it from the form; none means no protection.
export const requestIdOf = (formData: FormData) => {
  const raw = formData.get("requestId");
  return (typeof raw === "string" ? raw.trim().slice(0, 100) : "") || null;
};
