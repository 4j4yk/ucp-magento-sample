import { CheckoutSessionRecord } from './sessionTypes';

// Abstracts session persistence behind a minimal get/set interface.
export interface SessionRepository {
  // Returns a session by id or undefined if missing.
  get(id: string): CheckoutSessionRecord | undefined;
  // Persists or replaces a session record.
  set(record: CheckoutSessionRecord): void;
}

// In-memory repository for MVP/testing; swap with DB-backed implementation in production.
export class InMemorySessionRepository implements SessionRepository {
  private sessions = new Map<string, CheckoutSessionRecord>();

  // Reads a session record from the in-memory map.
  get(id: string): CheckoutSessionRecord | undefined {
    return this.sessions.get(id);
  }

  // Writes a session record to the in-memory map.
  set(record: CheckoutSessionRecord): void {
    this.sessions.set(record.id, record);
  }
}
