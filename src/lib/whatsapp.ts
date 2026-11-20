import { formatPaise } from "@/lib/format";

export type WhatsAppOrder = {
  name: string;
  sku: string;
  /** Selling price in paise. */
  price: number;
  variant: string | null;
  quantity: number;
  url: string;
  /** Amount payable for this order in paise (incl. delivery), when known. */
  total?: number;
};

/** Pre-filled BUY NOW message for a product order on WhatsApp. */
export function buildWhatsAppOrderMessage(o: WhatsAppOrder): string {
  return [
    "Hi KING DAY, I'd like to buy this product:",
    "",
    `Product: ${o.name}`,
    `SKU: ${o.sku}`,
    `Price: ${formatPaise(o.price)}`,
    ...(o.variant ? [`Variant: ${o.variant}`] : []),
    `Quantity: ${o.quantity}`,
    ...(o.total !== undefined ? [`Amount payable: ${formatPaise(o.total)} (incl. delivery)`] : []),
    `Link: ${o.url}`,
  ].join("\n");
}

/** wa.me deep link; works in the WhatsApp app on mobile and WhatsApp Web on desktop. */
export function whatsappOrderUrl(number: string, o: WhatsAppOrder): string {
  const digits = number.replace(/\D/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(buildWhatsAppOrderMessage(o))}`;
}
