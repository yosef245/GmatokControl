import type { Role } from "./domain/types";

export const ROLE_LABELS: Record<Role, string> = {
  admin: "מנהל מפעל",
  marketer: "משווק",
  production_manager: "מנהל ייצור",
  production_worker: "עובד ייצור",
  warehouse: "מחסן ושילוח",
};

/** Permission matrix from SRD section 2. Permissions add up across a user's roles. */
export const PERMISSIONS = {
  manageSettings: ["admin"],
  manageCustomers: ["admin", "marketer"],
  createOrder: ["admin", "marketer"],
  editOrder: ["admin", "production_manager"],
  reorderBoard: ["admin", "production_manager"],
  markProduced: ["admin", "production_manager", "production_worker"],
  manageStock: ["admin", "production_manager", "warehouse"],
  manageDeliveries: ["admin", "warehouse"],
  seePrices: ["admin", "marketer"],
  seeAllOrders: ["admin", "production_manager"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(roles: readonly Role[], permission: Permission): boolean {
  return roles.some((r) => (PERMISSIONS[permission] as readonly Role[]).includes(r));
}

export interface NavItem {
  href: string;
  label: string;
  icon: string;
}

export function navFor(roles: readonly Role[]): NavItem[] {
  const items: NavItem[] = [{ href: "/", label: "בית", icon: "home" }];
  if (can(roles, "createOrder")) items.push({ href: "/orders/new", label: "הזמנה חדשה", icon: "new" });
  if (can(roles, "seeAllOrders") || can(roles, "createOrder")) items.push({ href: "/orders", label: "הזמנות", icon: "orders" });
  if (can(roles, "markProduced") || can(roles, "reorderBoard")) items.push({ href: "/board", label: "לוח ייצור", icon: "board" });
  if (can(roles, "manageDeliveries")) items.push({ href: "/deliveries", label: "משלוחים", icon: "deliveries" });
  if (can(roles, "manageStock")) items.push({ href: "/inventory", label: "מלאי", icon: "inventory" });
  if (can(roles, "manageCustomers")) items.push({ href: "/customers", label: "לקוחות", icon: "customers" });
  if (can(roles, "seePrices")) items.push({ href: "/reports", label: "דוחות", icon: "reports" });
  if (can(roles, "manageSettings")) items.push({ href: "/settings", label: "הגדרות", icon: "settings" });
  return items;
}
