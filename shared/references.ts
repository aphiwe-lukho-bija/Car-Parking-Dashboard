/**
 * Payment reference generator.
 *
 * Lives in `shared/` because both the live API and the seeder mint references,
 * and `payments.reference` is covered by a unique index. If the two ever
 * disagreed on the format they would collide — the seeder originally numbered
 * from an array index while the API numbered from the session id, so a
 * simulated checkout could collide with seeded history.
 *
 * The session id is the only part that guarantees uniqueness, since each
 * session is settled exactly once.
 */
export function paymentReference(sessionId: number, paidAt: Date): string {
  return `APX-${paidAt.getFullYear()}-${String(sessionId).padStart(6, "0")}`;
}