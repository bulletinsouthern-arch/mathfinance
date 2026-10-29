// PayMongo methods supported by the course checkout integration.
export const PAYMONGO_METHODS = [
  "card",
  "gcash",
  "qrph",
  "paymaya",
  "grab_pay",
  "dob",
  "dob_ubp",
] as const;

export type PaymentMethod = (typeof PAYMONGO_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: "Cards",
  gcash: "GCash",
  qrph: "QR Ph",
  paymaya: "Maya",
  grab_pay: "GrabPay",
  dob: "Online banking",
  dob_ubp: "UnionBank",
};
