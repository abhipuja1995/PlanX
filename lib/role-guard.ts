import { getServerSession } from "next-auth";
import { authOptions, type UserRole } from "@/lib/auth";
import { NextResponse } from "next/server";

export const VENDOR_ROLES: UserRole[] = ['finance', 'admin', 'super_admin'];
export const APPROVER_ROLES: UserRole[] = ['manager', 'finance', 'admin', 'super_admin'];
export const ADMIN_ROLES: UserRole[] = ['admin', 'super_admin'];
export const ALL_PRICING_ROLES: UserRole[] = ['sales', 'manager', 'finance', 'admin', 'super_admin'];

export async function getSessionWithRole() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) return { session: null, role: null, error: unauthorized() };
  // @ts-expect-error role injected by jwt callback
  const role: UserRole | null = session.user.role ?? null;
  return { session, role, error: null };
}

export function requireRole(role: UserRole | null, allowed: UserRole[]) {
  if (!role || !allowed.includes(role)) return unauthorized();
  return null;
}

export function canSeeVendorData(role: UserRole | null): boolean {
  return !!role && VENDOR_ROLES.includes(role);
}

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
}
