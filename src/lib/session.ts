import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import type { AbilityContext } from './permissions';
import type { ScopeContext } from './scope';

export class UnauthenticatedError extends Error {
  constructor() {
    super('Not authenticated');
    this.name = 'UnauthenticatedError';
  }
}

/** Server-side session lookup for API routes / server actions / server components. */
export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user) throw new UnauthenticatedError();
  return session;
}

/** Convenience: build the ability/scope context object straight from the session. */
export async function requireCtx(): Promise<AbilityContext & ScopeContext> {
  const session = await requireSession();
  return {
    userId: session.user.id,
    role: session.user.role,
    companyId: session.user.companyId,
  };
}
