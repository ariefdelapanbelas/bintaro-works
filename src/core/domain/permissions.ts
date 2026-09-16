import type { Role } from "./types";

export const PERMISSIONS = [
  "dashboard.view",
  "crm.view",
  "crm.manage",
  "customers.view",
  "customers.manage",
  "spaces.view",
  "spaces.manage",
  "contracts.view",
  "contracts.manage",
  "bookings.view",
  "bookings.manage",
  "billing.view",
  "billing.manage",
  "catalog.manage",
  "requests.manage",
  "settings.manage",
  "team.manage",
  "audit.view",
  "portal.access",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const ALL_STAFF: Permission[] = PERMISSIONS.filter((p) => p !== "portal.access");

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  OWNER: ALL_STAFF,
  ADMIN: ALL_STAFF,
  STAFF: [
    "dashboard.view",
    "crm.view",
    "crm.manage",
    "customers.view",
    "customers.manage",
    "spaces.view",
    "contracts.view",
    "contracts.manage",
    "bookings.view",
    "bookings.manage",
    "billing.view",
    "requests.manage",
  ],
  FINANCE: [
    "dashboard.view",
    "customers.view",
    "spaces.view",
    "contracts.view",
    "bookings.view",
    "billing.view",
    "billing.manage",
    "catalog.manage",
    "audit.view",
  ],
  CUSTOMER: ["portal.access"],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export const ROLE_LABELS: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  STAFF: "Staf Operasional",
  FINANCE: "Finance",
  CUSTOMER: "Pelanggan (Portal)",
};
