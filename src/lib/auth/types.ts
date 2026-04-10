import type { MembershipRole } from "@prisma/client";

export type AuthContext = {
  userId: string;
  orgId: string;
  role: MembershipRole;
};
