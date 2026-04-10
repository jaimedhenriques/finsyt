import type { PlanCode } from "@prisma/client";

export type PlanLimits = {
  seats: number;
  monthlyResearchQueries: number;
  monthlyApiCalls: number;
  supportsMcp: boolean;
  supportsPriorityModels: boolean;
};

export const planLimits: Record<PlanCode, PlanLimits> = {
  FREE: {
    seats: 1,
    monthlyResearchQueries: 250,
    monthlyApiCalls: 500,
    supportsMcp: false,
    supportsPriorityModels: false,
  },
  PRO: {
    seats: 1,
    monthlyResearchQueries: 5000,
    monthlyApiCalls: 20000,
    supportsMcp: true,
    supportsPriorityModels: true,
  },
  TEAM: {
    seats: 10,
    monthlyResearchQueries: 50000,
    monthlyApiCalls: 200000,
    supportsMcp: true,
    supportsPriorityModels: true,
  },
  ENTERPRISE: {
    seats: 100,
    monthlyResearchQueries: 500000,
    monthlyApiCalls: 2000000,
    supportsMcp: true,
    supportsPriorityModels: true,
  },
};
