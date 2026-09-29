import { describe, expect, it } from "vitest";
import { fromIsraelLocal, toIsraelLocal } from "./dates";

describe("Israel local time", () => {
  it("reads winter and summer wall-clock times", () => {
    expect(fromIsraelLocal("2026-01-15", "10:00")?.toISOString()).toBe("2026-01-15T08:00:00.000Z");
    expect(fromIsraelLocal("2026-07-15", "10:00")?.toISOString()).toBe("2026-07-15T07:00:00.000Z");
  });
  it("round-trips", () => {
    const at = fromIsraelLocal("2026-10-01", "14:30")!;
    expect(toIsraelLocal(at)).toEqual({ date: "2026-10-01", time: "14:30" });
  });
  it("rejects junk", () => {
    expect(fromIsraelLocal("", "10:00")).toBeNull();
    expect(fromIsraelLocal("2026-01-15", "25:00")).toBeNull();
  });
});
