import { describe, expect, it } from "vitest";
import { parseCsv, parseSheet } from "./import";

describe("parseCsv", () => {
  it("handles quotes, BOM, CRLF and semicolons", () => {
    expect(parseCsv('﻿שם;מחיר\r\n"שוקולד ""מריר""";12,5\r\n')).toEqual([["שם", "מחיר"], ['שוקולד "מריר"', "12,5"]]);
    expect(parseCsv("a,b\n1,\"x,y\"")).toEqual([["a", "b"], ["1", "x,y"]]);
  });
});

describe("parseSheet", () => {
  it("maps Hebrew headers and aliases, and reports row errors", () => {
    const r = parseSheet("customers", [
      [],
      ["שם לקוח", "נייד", "סוג", "עיר", "כתובת", "עמודה אחרת"],
      ["קפה גלית", 527777777, "עסקי", "חיפה", "הרצל 5", "x"],
      ["", "", "", "", "", ""],
      ["בלי טלפון", "", "פרטי", "", "", ""],
      ["סוג שגוי", "050-1234567", "סיטונאי", "", "", ""],
    ]);
    expect(r.missing).toEqual([]);
    expect(r.ignored).toEqual(["עמודה אחרת"]);
    expect(r.rows).toEqual([{ name: "קפה גלית", phone: "0527777777", type: "business", city: "חיפה", address: "הרצל 5" }]);
    expect(r.errors).toEqual([
      { row: 5, message: "חסר טלפון" },
      { row: 6, message: "סוג צריך להיות פרטי או עסקי" },
    ]);
  });

  it("reads numbers with shekel signs and thousands", () => {
    const r = parseSheet("products", [["מוצר", "מחיר לפני מע״מ", "דקות"], ["מארז", "₪1,250.50", 3]]);
    expect(r.rows).toEqual([{ name: "מארז", price: 1250.5, minutes: 3 }]);
  });

  it("names missing required columns", () => {
    expect(parseSheet("materials", [["שם", "מלאי"], ["סוכר", 3]]).missing).toEqual(["יחידה"]);
  });
});
