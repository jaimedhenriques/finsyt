export type AuthContext = {
  userId: string;
  orgId: string;
  role: "OWNER" | "ADMIN" | "MEMBER" | "VIEWER";
};

export type MembershipRole = AuthContext["role"];
