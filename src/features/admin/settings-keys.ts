/** Store settings editable from Admin → Settings (keys match supabase/seed.sql). */
export const EDITABLE_SETTINGS = {
  "store.name": { label: "Store name", kind: "text", isPublic: true },
  "store.tagline": { label: "Tagline", kind: "text", isPublic: true },
  "checkout.cod_enabled": { label: "Cash on delivery enabled", kind: "boolean", isPublic: true },
  "checkout.cod_max_order_value": { label: "COD max order value (₹)", kind: "rupees", isPublic: false },
  "shipping.flat_rate": { label: "Flat shipping rate (₹)", kind: "rupees", isPublic: true },
  "shipping.free_shipping_threshold": { label: "Free shipping above (₹, blank = never)", kind: "rupees", isPublic: true },
  "tax.prices_include_gst": { label: "Prices include GST", kind: "boolean", isPublic: true },
  "service.basic_charge": { label: "Default basic service charge (₹)", kind: "rupees", isPublic: true },
} as const;
