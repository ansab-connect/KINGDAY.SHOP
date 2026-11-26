/**
 * Page/action permissions. Mirrors supabase/migrations/20261114001300 (private.permission_modules,
 * role_permissions seed). The database is the source of truth and enforces every write;
 * this file drives navigation, page gates and the permission editor.
 */

export const MODULES = [
  { key: "overview", label: "Overview" },
  { key: "products", label: "Products" },
  { key: "categories", label: "Categories" },
  { key: "brands", label: "Brands" },
  { key: "inventory", label: "Inventory" },
  { key: "orders", label: "Orders" },
  { key: "customers", label: "Customers" },
  { key: "coupons", label: "Coupons" },
  { key: "analytics", label: "Analytics" },
  { key: "reports", label: "Reports" },
  { key: "service", label: "Service Management" },
  { key: "staff", label: "Staff Management" },
  { key: "attendance", label: "Attendance" },
  { key: "payroll", label: "Salary & Payroll" },
  { key: "users", label: "Users & Roles" },
  { key: "audit", label: "Audit Logs" },
  { key: "settings", label: "Settings" },
  { key: "cms", label: "Website CMS" },
  { key: "backup", label: "Backup & Data" },
  { key: "spare_parts", label: "Spare Parts" },
  { key: "billing", label: "Service Billing" },
  { key: "password_resets", label: "Password Resets" },
  { key: "purchases", label: "Purchases" },
  { key: "expenses", label: "Expenses" },
  { key: "best_fit", label: "BEST FIT Operations" },
  { key: "accounts", label: "Accounts & Commissions" },
] as const;

export const ACTIONS = ["view", "create", "edit", "delete", "approve", "export"] as const;

export type Module = (typeof MODULES)[number]["key"];
export type Action = (typeof ACTIONS)[number];
export type Permissions = Partial<Record<Module, Action[]>>;

export const MODULE_KEYS = MODULES.map((m) => m.key) as Module[];
export const isModule = (v: unknown): v is Module => typeof v === "string" && (MODULE_KEYS as string[]).includes(v);
export const isAction = (v: unknown): v is Action => typeof v === "string" && (ACTIONS as readonly string[]).includes(v);

const ALL: Permissions = Object.fromEntries(MODULE_KEYS.map((m) => [m, [...ACTIONS]]));

/**
 * Role defaults, used only if the permissions migration isn't applied yet
 * (keeps the admin working during the rollout). Same as the SQL seed.
 */
export const ROLE_DEFAULTS: Record<string, Permissions> = {
  super_admin: ALL,
  admin: { ...ALL, users: ["view"], audit: [], backup: ["view", "export"], password_resets: [] },
  staff: {
    overview: ["view"],
    products: ["view", "create", "edit"],
    categories: ["view", "create", "edit"],
    brands: ["view", "create", "edit"],
    inventory: ["view", "create", "edit"],
    orders: ["view", "edit"],
    customers: ["view"],
    coupons: ["view"],
    analytics: ["view"],
    reports: ["view"],
    spare_parts: ["view"],
    purchases: ["view", "create"],
  },
  service_staff: { service: ["view", "edit"], spare_parts: ["view"] },
};

export function mergePermissions(list: Permissions[]): Permissions {
  const out: Permissions = {};
  for (const p of list) {
    for (const [m, acts] of Object.entries(p) as [Module, Action[]][]) {
      out[m] = [...new Set([...(out[m] ?? []), ...acts])];
    }
  }
  return out;
}

export function allows(perms: Permissions | null | undefined, module: Module, action: Action = "view"): boolean {
  return Boolean(perms?.[module]?.includes(action));
}
