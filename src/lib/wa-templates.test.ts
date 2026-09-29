import { describe, expect, it } from "vitest";
import { renderTemplate, templateParam, WA_TEMPLATES } from "./wa-templates";

describe("WhatsApp templates", () => {
  it("has one described parameter per placeholder", () => {
    for (const t of Object.values(WA_TEMPLATES)) {
      const n = new Set(t.body.match(/\{\{\d+\}\}/g)).size;
      expect(n).toBe(t.params.length);
      expect(t.name).toMatch(/^[a-z0-9_]+$/);
    }
  });
  it("cleans parameters the way Meta requires", () => {
    expect(templateParam("שורה\nשנייה\tוטאב     רווחים")).toBe("שורה · שנייה · וטאב רווחים");
    expect(templateParam("  ")).toBe("-");
  });
  it("renders the text that was sent", () => {
    expect(renderTemplate(WA_TEMPLATES.transit.body, ["דנה", "1044", "רוני"])).toBe("שלום דנה, הזמנה מס׳ 1044 יצאה אליך עכשיו עם רוני.");
  });
});
