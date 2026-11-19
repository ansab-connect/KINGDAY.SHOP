import {
  ORDER_STATUS_LABEL,
  type OrderStatus,
  type PaymentStatus,
} from "@/features/orders/types";
import { cn } from "@/lib/utils";

type Tone = "royal" | "gold" | "success" | "warning" | "info" | "danger" | "neutral";

const toneClass: Record<Tone, string> = {
  royal: "bg-royal-50 text-royal-700 ring-royal-200",
  gold: "bg-gold-50 text-gold-700 ring-gold-200",
  success: "bg-success-soft text-success ring-success/20",
  warning: "bg-warning-soft text-warning ring-warning/20",
  info: "bg-info-soft text-info ring-info/20",
  danger: "bg-danger-soft text-danger ring-danger/20",
  neutral: "bg-muted text-muted-foreground ring-border",
};

/** Every status pill carries a text label and a dot, so colour is never the only signal. */
export function Pill({ tone, children, className }: { tone: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        toneClass[tone],
        className,
      )}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

const orderTone: Record<OrderStatus, Tone> = {
  new: "royal",
  pending: "warning",
  confirmed: "info",
  processing: "info",
  packed: "gold",
  shipped: "gold",
  delivered: "success",
  cancelled: "neutral",
  returned: "danger",
  refunded: "neutral",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Pill tone={orderTone[status]}>{ORDER_STATUS_LABEL[status]}</Pill>;
}

const paymentTone: Record<PaymentStatus, Tone> = {
  pending: "warning",
  authorized: "info",
  paid: "success",
  failed: "danger",
  refunded: "neutral",
};

export function PaymentStatusBadge({ status }: { status: PaymentStatus }) {
  return <Pill tone={paymentTone[status]}>{status[0].toUpperCase() + status.slice(1)}</Pill>;
}

export function StockBadge({ stock, reorderLevel }: { stock: number; reorderLevel: number }) {
  if (stock === 0) return <Pill tone="danger">Out of stock</Pill>;
  if (stock <= reorderLevel) return <Pill tone="warning">Low · {stock}</Pill>;
  return <Pill tone="success">In stock · {stock}</Pill>;
}
