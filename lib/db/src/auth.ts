import { ROLES, roleAtLeast, type Role } from "./schema/tenancy";

export class AuthorizationError extends Error {
  readonly status = 403;
  constructor(message = "Forbidden") {
    super(message);
    this.name = "AuthorizationError";
  }
}

export class AuthenticationError extends Error {
  readonly status = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "AuthenticationError";
  }
}

export interface Principal {
  userId: string;
  orgId: string;
  role: Role;
}

/**
 * Throws unless `principal` has at least the required role within their org.
 * Use at the top of every protected API route and before rendering any UI
 * affordance whose action requires elevated privileges.
 */
export function assertRole(
  principal: Principal | null | undefined,
  required: Role,
): asserts principal is Principal {
  if (!principal) throw new AuthenticationError();
  if (!ROLES.includes(principal.role)) {
    throw new AuthorizationError(`Unknown role: ${principal.role}`);
  }
  if (!roleAtLeast(principal.role, required)) {
    throw new AuthorizationError(
      `Requires role '${required}' or higher (have '${principal.role}')`,
    );
  }
}

export { ROLES, roleAtLeast };
export type { Role };
