import { describe, expect, it } from "vitest";
import { toE164 } from "./phone";

describe("toE164", () => {
  it("normalises Israeli mobile numbers", () => {
    expect(toE164("050-1234567")).toBe("+972501234567");
    expect(toE164("+972 52 123 4567")).toBe("+972521234567");
    expect(toE164("0521234567")).toBe("+972521234567");
  });
  it("rejects landlines and junk", () => {
    expect(toE164("04-1234567")).toBeNull();
    expect(toE164("123")).toBeNull();
  });
});
