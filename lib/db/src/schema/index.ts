export * from "./tenancy";
export * from "./leads";
export * from "./research";
export * from "./compliance";
export * from "./portfolio";
export * from "./developer";
export * from "./agents";

export const TENANT_TABLES = ["leads", "research_notes", "chat_messages", "memberships", "portfolio_positions", "api_keys"] as const;
