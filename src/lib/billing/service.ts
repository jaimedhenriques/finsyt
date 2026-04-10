import { getPrismaClient } from "@/lib/db/prisma";
import { planLimits } from "@/lib/billing/plan";
import type { PlanCode } from "@/lib/billing/plan";

export async function getOrgPlan(organizationId: string): Promise<PlanCode> {
  const prisma = getPrismaClient();
  const subscription = await prisma.subscription.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });

  return (subscription?.planCode as PlanCode | undefined) ?? "FREE";
}

export async function getOrgPlanLimits(organizationId: string) {
  const plan = await getOrgPlan(organizationId);
  return {
    plan,
    limits: planLimits[plan],
  };
}
