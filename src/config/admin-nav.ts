import {
  BarChart3,
  Boxes,
  FileText,
  FolderTree,
  History,
  IdCard,
  Wrench,
  KeyRound,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingBag,
  Tag,
  TicketPercent,
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
    label: "Catalogue",
    items: [
      { title: "Products", href: "/admin/products", icon: Package, module: "products", phase: 5 },
      { title: "Categories", href: "/admin/categories", icon: FolderTree, module: "categories", phase: 5 },
      { title: "Brands", href: "/admin/brands", icon: Tag, module: "brands", phase: 5 },
      { title: "Inventory", href: "/admin/inventory", icon: Boxes, module: "inventory", phase: 6 },
    ],
  },
  {
    label: "Sales",
    items: [
      { title: "Orders", href: "/admin/orders", icon: ShoppingBag, module: "orders", phase: 9 },
      { title: "Customers", href: "/admin/customers", icon: Users, module: "customers", phase: 7 },
      { title: "Coupons", href: "/admin/coupons", icon: TicketPercent, module: "coupons", phase: 8 },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Analytics", href: "/admin/analytics", icon: BarChart3, module: "analytics", phase: 10 },
      { title: "Reports", href: "/admin/reports", icon: FileText, module: "reports", phase: 10 },
    ],
  },
  {
    label: "Service & People",
    items: [
      { title: "Service Management", href: "/admin/service", icon: Wrench, module: "service" },
      { title: "Staff Management", href: "/admin/staff", icon: IdCard, module: "staff" },
    ],
  },
  {
    label: "System",
    items: [
      { title: "Users & Roles", href: "/admin/users", icon: UserCog, module: "users" },
      { title: "Permissions", href: "/admin/permissions", icon: KeyRound, module: "users", superAdminOnly: true },
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
