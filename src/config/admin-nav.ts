import {
  BarChart3,
  HandCoins,
  HardHat,
  Inbox,
  Percent,
  Receipt,
  Route,
  Ruler,
  Scale,
  Store,
  ClipboardList,
  Wallet,
  Bike,
  Bot,
  Camera,
  Cog,
  Crown,
  ShieldCheck,
  SlidersHorizontal,
  Boxes,
  FileText,
  FolderTree,
  History,
  IdCard,
  IndianRupee,
  ListTodo,
  LockKeyhole,
  Wrench,
  KeyRound,
  Megaphone,
  LayoutDashboard,
  Package,
  ReceiptText,
  Settings,
  ShoppingBag,
  Tag,
  TicketPercent,
  Sparkles,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { allows, type Module, type Permissions } from "@/features/auth/permissions";

export type AdminNavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Phase in which the module becomes fully functional. */
  phase?: number;
  /** Permission module that must allow "view". Pages and actions enforce the same server-side. */
  module: Module;
  /** Only Super Admins see this item. */
  superAdminOnly?: boolean;
};

export type AdminNavGroup = { label: string; items: AdminNavItem[] };

export const adminNav: AdminNavGroup[] = [
  {
    label: "Main",
    items: [{ title: "Overview", href: "/admin", icon: LayoutDashboard, module: "overview" }],
  },
  {
    label: "Super Admin",
    items: [
      { title: "Control Centre", href: "/super-admin", icon: Crown, module: "users", superAdminOnly: true },
      { title: "Admin Accounts", href: "/super-admin/admins", icon: ShieldCheck, module: "users", superAdminOnly: true },
      { title: "Permissions", href: "/super-admin/permissions", icon: KeyRound, module: "users", superAdminOnly: true },
      { title: "System Settings", href: "/super-admin/settings", icon: SlidersHorizontal, module: "settings", superAdminOnly: true },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { title: "Products", href: "/admin/products", icon: Package, module: "products", phase: 5 },
      { title: "Categories", href: "/admin/categories", icon: FolderTree, module: "categories", phase: 5 },
      { title: "Bicycles", href: "/admin/bicycles", icon: Bike, module: "categories" },
      { title: "Brands", href: "/admin/brands", icon: Tag, module: "brands", phase: 5 },
      { title: "Warranties", href: "/admin/warranties", icon: ShieldCheck, module: "products" },
      { title: "Inventory", href: "/admin/inventory", icon: Boxes, module: "inventory", phase: 6 },
      { title: "Purchases", href: "/admin/purchases", icon: ClipboardList, module: "purchases" },
    ],
  },
  {
    label: "Sales",
    items: [
      { title: "Orders", href: "/admin/orders", icon: ShoppingBag, module: "orders", phase: 9 },
      { title: "Billing", href: "/admin/billing", icon: ReceiptText, module: "orders" },
      { title: "Customers", href: "/admin/customers", icon: Users, module: "customers", phase: 7 },
      { title: "Coupons", href: "/admin/coupons", icon: TicketPercent, module: "coupons", phase: 8 },
      { title: "Promotions", href: "/admin/promotions", icon: Megaphone, module: "customers" },
      { title: "Top Bar Messages", href: "/admin/announcements", icon: Megaphone, module: "cms" },
      { title: "Royal Moments", href: "/admin/instagram", icon: Camera, module: "cms" },
      { title: "Seasonal Themes", href: "/admin/themes", icon: Sparkles, module: "cms" },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Analytics", href: "/admin/analytics", icon: BarChart3, module: "analytics", phase: 10 },
      { title: "AI Analyst", href: "/admin/ai", icon: Bot, module: "analytics" },
      { title: "Reports", href: "/admin/reports", icon: FileText, module: "reports", phase: 10 },
    ],
  },
  {
    // Kept to what the team uses every day; the other BEST FIT pages stay reachable from
    // links on these pages (settings tabs, booking page), nothing was deleted.
    label: "Service Management",
    items: [
      { title: "Service Bookings", href: "/admin/service", icon: Wrench, module: "service" },
      { title: "Service Invoices", href: "/admin/service/invoices", icon: ReceiptText, module: "service" },
      { title: "Inspection Pre-Invoices", href: "/admin/service/pre-invoices", icon: FileText, module: "service" },
      { title: "Spare Parts", href: "/admin/spare-parts", icon: Cog, module: "spare_parts" },
      { title: "Service Centres", href: "/admin/service/centres", icon: Store, module: "service" },
      { title: "Inspection Charges (km)", href: "/admin/service/slabs", icon: Ruler, module: "best_fit" },
      { title: "Service Settings", href: "/admin/service/catalog", icon: SlidersHorizontal, module: "service" },
    ],
  },
  {
    label: "BEST FIT",
    items: [
      { title: "Unassigned Services", href: "/admin/best-fit", icon: Inbox, module: "best_fit" },
      { title: "Work Orders", href: "/admin/best-fit/work-orders", icon: ClipboardList, module: "best_fit" },
      { title: "Technicians", href: "/admin/best-fit/technicians", icon: HardHat, module: "best_fit" },
      { title: "Route Planning", href: "/admin/best-fit/routes", icon: Route, module: "best_fit" },
      { title: "Technician Pay Settings", href: "/admin/best-fit/commissions", icon: Percent, module: "best_fit" },
      { title: "Technician Invoices", href: "/admin/best-fit/technician-invoices", icon: FileText, module: "accounts" },
      { title: "Staff Management", href: "/admin/staff", icon: IdCard, module: "staff" },
      { title: "Task Management", href: "/admin/tasks", icon: ListTodo, module: "staff" },
      { title: "Salary & Payroll", href: "/admin/payroll", icon: IndianRupee, module: "payroll" },
    ],
  },
  {
    label: "Accounts",
    items: [
      { title: "Accounts Dashboard", href: "/admin/accounts", icon: LayoutDashboard, module: "accounts" },
      { title: "Technician Payments", href: "/admin/accounts/technician-payments", icon: HandCoins, module: "accounts" },
      { title: "Reclaim Invoices", href: "/admin/accounts/reclaims", icon: Receipt, module: "accounts" },
      { title: "Payment History", href: "/admin/accounts/payments", icon: History, module: "accounts" },
      { title: "Expenses", href: "/admin/expenses?from=accounts", icon: Wallet, module: "expenses" },
      { title: "Profit & Loss", href: "/admin/accounts/profit-loss", icon: Scale, module: "accounts" },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Users & Roles", href: "/admin/users", icon: UserCog, module: "users" },
      { title: "Password Resets", href: "/admin/password-resets", icon: LockKeyhole, module: "password_resets" },
      { title: "Audit Logs", href: "/admin/audit-log", icon: History, module: "audit" },
      { title: "Settings", href: "/admin/settings", icon: Settings, phase: 4, module: "settings" },
    ],
  },
];

/** Nav filtered to what the user may open. `null` = local preview (everything). */
export function navFor(permissions: Permissions | null, isSuperAdmin = false): AdminNavGroup[] {
  return adminNav
    .map((g) => ({
      ...g,
      items: g.items.filter((i) => permissions === null || ((!i.superAdminOnly || isSuperAdmin) && allows(permissions, i.module, "view"))),
    }))
    .filter((g) => g.items.length > 0);
}

export const adminNavFlat = adminNav.flatMap((g) => g.items);
