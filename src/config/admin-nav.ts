import {
  BarChart3,
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
      { title: "Inventory", href: "/admin/inventory", icon: Boxes, module: "inventory", phase: 6 },
      { title: "Purchases", href: "/admin/purchases", icon: ClipboardList, module: "purchases" },
    ],
  },
  {
    label: "Sales",
    items: [
      { title: "Orders", href: "/admin/orders", icon: ShoppingBag, module: "orders", phase: 9 },
      { title: "Billing", href: "/admin/billing", icon: ReceiptText, module: "orders" },
      { title: "Expenses", href: "/admin/expenses", icon: Wallet, module: "expenses" },
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
    label: "Service & People",
    items: [
      { title: "Service Management", href: "/admin/service", icon: Wrench, module: "service" },
      { title: "Spare Parts", href: "/admin/spare-parts", icon: Cog, module: "spare_parts" },
      { title: "Staff Management", href: "/admin/staff", icon: IdCard, module: "staff" },
      { title: "Staff Tasks", href: "/admin/tasks", icon: ListTodo, module: "staff" },
      { title: "Salary & Payroll", href: "/admin/payroll", icon: IndianRupee, module: "payroll" },
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
