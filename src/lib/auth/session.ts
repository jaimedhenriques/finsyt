import { auth, currentUser } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db/prisma";
import type { AuthContext, MembershipRole } from "@/lib/auth/types";

const DEFAULT_ROLE: MembershipRole = "MEMBER";

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
}

function fallbackOrgSlug(userId: string) {
  return `team-${userId.slice(0, 10)}`;
}

export async function requireAuthContext(): Promise<AuthContext> {
  const authResult = await auth();

  if (!authResult.userId) {
    throw new Error("Unauthorized");
  }

  const clerkUser = await currentUser();
  if (!clerkUser?.primaryEmailAddress?.emailAddress) {
    throw new Error("User email missing");
  }

  const user = await prisma.user.upsert({
    where: { externalAuthId: authResult.userId },
    update: {
      email: clerkUser.primaryEmailAddress.emailAddress,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      avatarUrl: clerkUser.imageUrl,
    },
    create: {
      externalAuthId: authResult.userId,
      email: clerkUser.primaryEmailAddress.emailAddress,
      firstName: clerkUser.firstName,
      lastName: clerkUser.lastName,
      avatarUrl: clerkUser.imageUrl,
    },
  });

  const externalOrgId = authResult.orgId ?? null;

  let organization = externalOrgId
    ? await prisma.organization.findUnique({ where: { externalOrgId } })
    : null;

  if (!organization) {
    const baseSlug = slugify(clerkUser.firstName || clerkUser.username || "finsyt-team");
    organization = await prisma.organization.create({
      data: {
        externalOrgId,
        name: `${clerkUser.firstName ?? "Finsyt"} Team`,
        slug: baseSlug || fallbackOrgSlug(authResult.userId),
      },
    });
  }

  const membership = await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      userId: user.id,
      role: authResult.orgRole === "org:admin" ? "ADMIN" : DEFAULT_ROLE,
    },
  });

  return {
    userId: user.id,
    orgId: organization.id,
    role: membership.role,
  };
}
