/**
 * Display estimate of what the database's price_order() charges: a per-line % discount by
 * payment method (rounded half up) and free delivery for prepaid orders when enabled.
 * The database recalculates every order; this only keeps the product page instant.
 */
export type PriceSettings = { flatShipping: number; freeShippingAbove: number | null; freeShippingPrepaid: boolean };

export function estimateTotals(price: number, quantity: number, pct: number, prepaid: boolean, s: PriceSettings) {
  const subtotal = price * quantity;
  const discount = Math.min(Math.round((subtotal * pct) / 100), subtotal);
  const shipping = prepaid && s.freeShippingPrepaid ? 0 : s.freeShippingAbove !== null && subtotal >= s.freeShippingAbove ? 0 : s.flatShipping;
  return { subtotal, discount, shipping, total: subtotal - discount + shipping };
}
