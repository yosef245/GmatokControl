import type { OrderStatus } from "./domain/types";
import type { Tone } from "@/components/ui";

export const STATUS: Record<OrderStatus, { label: string; tone: Tone }> = {
  draft: { label: "טיוטה", tone: "neutral" },
  pending_approval: { label: "ממתינה לייצור", tone: "neutral" },
  in_production: { label: "בייצור", tone: "blue" },
  ready_for_delivery: { label: "מוכנה למשלוח", tone: "green" },
  in_transit: { label: "בדרך", tone: "blue" },
  delivered: { label: "נמסרה", tone: "green" },
  cancelled: { label: "בוטלה", tone: "red" },
};
