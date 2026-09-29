import { describe, expect, it } from "vitest";
import { confirmationMessage, waLink, waNumber } from "./whatsapp";

describe("whatsapp", () => {
  it("normalises Israeli numbers", () => {
    expect(waNumber("050-1234567")).toBe("972501234567");
    expect(waNumber("04-8123456")).toBe("97248123456");
    expect(waNumber("12")).toBeNull();
  });
  it("builds a prefilled link", () => {
    const msg = confirmationMessage({
      businessName: "גוונים של מתוק", orderId: 1049, customerName: "רותם", deliveryText: "מחר 12:00",
      addressText: null, lines: [{ name: "מארז פרלינים", quantity: 2, notes: "לוגו" }], totalText: "₪100",
    });
    expect(msg).toContain("הזמנה מס׳ 1049");
    expect(msg).toContain("• מארז פרלינים × 2 (לוגו)");
    expect(msg).toContain("איסוף עצמי");
    expect(waLink("0501234567", msg)).toMatch(/^https:\/\/wa\.me\/972501234567\?text=/);
  });
});
