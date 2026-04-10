import type { MembershipRole } from "@/lib/auth/types";

const roleOrder: Record<MembershipRole, number> = {
  OWNER: 4,
  ADMIN: 3,
  MEMBER: 2,
  VIEWER: 1,
};

export function hasMinimumRole(currentRole: MembershipRole, requiredRole: MembershipRole): boolean {
  return roleOrder[currentRole] >= roleOrder[requiredRole];
}
