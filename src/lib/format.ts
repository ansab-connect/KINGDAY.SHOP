const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const inrCompact = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  notation: "compact",
  maximumFractionDigits: 1,
});

const number = new Intl.NumberFormat("en-IN");

/** Amounts are stored as integer paise; format as rupees. */
export function formatPaise(paise: number): string {
  return inr.format(paise / 100);
}

export function formatPaiseCompact(paise: number): string {
  return inrCompact.format(paise / 100);
}

export function formatNumber(value: number): string {
  return number.format(value);
}

export function formatPercent(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

export function discountPercent(mrpPaise: number, sellingPaise: number): number {
  if (mrpPaise <= 0 || sellingPaise >= mrpPaise) return 0;
  return Math.round(((mrpPaise - sellingPaise) / mrpPaise) * 100);
}
