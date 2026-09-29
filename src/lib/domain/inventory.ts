import type { AlertColor } from "./types";

export interface InventoryFigures {
  inStock: number;
  reserved: number;
  available: number;
  toOrder: number;
  color: AlertColor;
}

/** The four stock figures from SRD 5.2 and the colour rule from 5.3 (same maths as inventory_status_view). */
export function inventoryFigures(inStock: number, reserved: number, minimum: number): InventoryFigures {
  const available = inStock - reserved;
  const color: AlertColor = available < 0 ? "red" : available < minimum ? "orange" : "green";
  const toOrder = available < 0 ? reserved - inStock + minimum : available < minimum ? minimum - available : 0;
  return { inStock, reserved, available, toOrder, color };
}
