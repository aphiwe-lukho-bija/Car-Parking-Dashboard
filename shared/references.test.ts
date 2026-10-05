import { describe, expect, it } from "vitest";
import { paymentReference } from "./references";

describe("paymentReference", () => {
  it("encodes the year and a zero-padded session id", () => {
    expect(paymentReference(1, new Date("2026-03-04T10:00:00"))).toBe(
      "APX-2026-000001",
    );
    expect(paymentReference(2037, new Date("2026-03-04T10:00:00"))).toBe(
      "APX-2026-002037",
    );
    expect(paymentReference(1234567, new Date("2026-03-04T10:00:00"))).toBe(
      "APX-2026-1234567",
    );
  });

  it("fits the column width for any plausible session id", () => {
    // payments.reference is VARCHAR(32); "APX-" + 4 digits + "-" + 10 digits.
    for (const id of [0, 1, 999_999, 9_999_999_999]) {
      expect(paymentReference(id, new Date("2026-01-01")).length).toBeLessThanOrEqual(32);
    }
  });

  it("is unique per session within the same year", () => {
    const paidAt = new Date("2026-06-01T09:00:00");
    const references = new Set(
      Array.from({ length: 5000 }, (_, index) => paymentReference(index, paidAt)),
    );
    expect(references.size).toBe(5000);
  });

  it("varies by session, which is what the unique index relies on", () => {
    const paidAt = new Date("2026-06-01T09:00:00");
    expect(paymentReference(7, paidAt)).not.toBe(paymentReference(8, paidAt));
  });
});