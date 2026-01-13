// nanoid generates short, URL-safe ids for session handles.
import { nanoid } from 'nanoid';
import { InMemorySessionRepository, SessionRepository } from './sessionRepository';
import { CheckoutSessionRecord } from './sessionTypes';

// In-memory session store for MVP usage (non-persistent).
const repository = new InMemorySessionRepository();

// Creates a new checkout session record and stores it in memory.
export function createSession(magentoCartId: string, items?: Array<{ sku: string; quantity: number }>): CheckoutSessionRecord {
  const now = new Date().toISOString();
  const rec: CheckoutSessionRecord = {
    id: nanoid(14),
    magentoCartId,
    createdAt: now,
    updatedAt: now,
    status: 'incomplete',
    items,
  };
  repository.set(rec);
  return rec;
}

// Retrieves a session or throws a 404-shaped error when missing.
export function getSession(id: string): CheckoutSessionRecord {
  const s = repository.get(id);
  if (!s) {
    const err: any = new Error(`Unknown checkout session: ${id}`);
    err.status = 404;
    throw err;
  }
  return s;
}

// Applies a partial update to a session record and bumps updatedAt.
export function updateSession(id: string, patch: Partial<CheckoutSessionRecord>): CheckoutSessionRecord {
  const s = getSession(id);
  const next: CheckoutSessionRecord = { ...s, ...patch, updatedAt: new Date().toISOString() };
  repository.set(next);
  return next;
}

// Marks a session as canceled for terminal-state handling.
export function cancelSession(id: string): CheckoutSessionRecord {
  return updateSession(id, { status: 'canceled' });
}

// Exposes the repository for dependency injection/testing.
export function getSessionRepository(): SessionRepository {
  return repository;
}
