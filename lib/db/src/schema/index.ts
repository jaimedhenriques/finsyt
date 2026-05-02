export * from "./tenancy";
export * from "./leads";
export * from "./research";
export * from "./compliance";
export * from "./portfolio";
export * from "./developer";
export * from "./agents";
export * from "./connectors";
export * from "./peers";
export * from "./alerts";
export * from "./workspaces";
export * from "./user-preferences";
export * from "./blueprints";
export * from "./matrices";
export * from "./deck-overrides";
export * from "./live-highlights";

export const TENANT_TABLES = ["leads", "research_notes", "chat_messages", "memberships", "portfolio_positions", "api_keys", "connections", "connection_credentials", "connection_operations", "connection_events", "alerts", "workspaces", "workspace_views", "matrices", "matrix_snapshots"] as const;
