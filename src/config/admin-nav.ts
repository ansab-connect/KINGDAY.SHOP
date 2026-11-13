import {
  BarChart3,
  Boxes,
  FileText,
  FolderTree,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingBag,
  Tag,
  TicketPercent,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AdminNavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Phase in which the module becomes fully functional. */
  phase?: number;
};

export type AdminNavGroup = { label: string; items: AdminNavItem[] };

export const adminNav: AdminNavGroup[] = [
  {
    label: "Main",
    items: [{ title: "Overview", href: "/admin", icon: LayoutDashboard }],
  },
  {
    label: "Catalogue",
    items: [
      { title: "Products", href: "/admin/products", icon: Package, phase: 5 },
      { title: "Categories", href: "/admin/categories", icon: FolderTree, phase: 5 },
      { title: "Brands", href: "/admin/brands", icon: Tag, phase: 5 },
      { title: "Inventory", href: "/admin/inventory", icon: Boxes, phase: 6 },
    ],
  },
  {
    label: "Sales",
    items: [
      { title: "Orders", href: "/admin/orders", icon: ShoppingBag, phase: 9 },
      { title: "Customers", href: "/admin/customers", icon: Users, phase: 7 },
      { title: "Coupons", href: "/admin/coupons", icon: TicketPercent, phase: 8 },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Analytics", href: "/admin/analytics", icon: BarChart3, phase: 10 },
      { title: "Reports", href: "/admin/reports", icon: FileText, phase: 10 },
    ],
  },
  {
    label: "System",
    items: [{ title: "Settings", href: "/admin/settings", icon: Settings, phase: 4 }],
  },
];

export const adminNavFlat = adminNav.flatMap((g) => g.items);
