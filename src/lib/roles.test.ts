import { describe, expect, it } from "vitest";
import { can, navFor } from "./roles";

describe("permissions", () => {
  it("follows the SRD matrix", () => {
    expect(can(["marketer"], "createOrder")).toBe(true);
    expect(can(["marketer"], "markProduced")).toBe(false);
    expect(can(["production_worker"], "seePrices")).toBe(false);
    expect(can(["warehouse"], "manageDeliveries")).toBe(true);
  });

  it("adds up across roles", () => {
    expect(can(["marketer", "warehouse"], "manageDeliveries")).toBe(true);
  });

  it("builds the menu per role", () => {
    expect(navFor(["production_worker"]).map((n) => n.href)).toEqual(["/", "/board"]);
    expect(navFor(["warehouse"]).map((n) => n.href)).toEqual(["/", "/deliveries", "/inventory"]);
    expect(navFor(["admin"])).toHaveLength(8);
  });
});
