import { PlanCode } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { planLimits } from "@/lib/billing/plan";

export async function getOrgPlan(organizationId: string): Promise<PlanCode> {
  const subscription = await prisma.subscription.findFirst({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
  });

  return subscription?.planCode ?? PlanCode.FREE;
}

export async function getOrgPlanLimits(organizationId: string) {
  const plan = await getOrgPlan(organizationId);
  return {
    plan,
    limits: planLimits[plan],
  };
}
