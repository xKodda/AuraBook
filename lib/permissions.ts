import type { BusinessRole } from "./types";

// Reflejo en la UI de la matriz de roles. La autorización real la imponen RLS y las RPC
// (`has_business_role`, `can_see_booking`); estos helpers solo deciden qué mostrar.

export function canManageSettings(role: BusinessRole): boolean {
  return role === "owner";
}

export function canManageStaff(role: BusinessRole): boolean {
  return role === "owner" || role === "admin";
}

export function canViewAllBookings(role: BusinessRole): boolean {
  return role === "owner" || role === "admin";
}
