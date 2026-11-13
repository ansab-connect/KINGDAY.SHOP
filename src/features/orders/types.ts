export const ORDER_STATUSES = [
  "new",
  "pending",
  "confirmed",
  "processing",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
  "returned",
  "refunded",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type PaymentMethod = "razorpay" | "cod";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  new: "New",
  pending: "Pending",
  confirmed: "Confirmed",
  processing: "Processing",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  returned: "Returned",
  refunded: "Refunded",
};

/** Statuses that still need staff action. */
export const OPEN_ORDER_STATUSES: readonly OrderStatus[] = [
  "new",
  "pending",
  "confirmed",
  "processing",
  "packed",
];
