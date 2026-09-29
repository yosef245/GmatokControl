export type Role = "admin" | "marketer" | "production_manager" | "production_worker" | "warehouse";

export type OrderStatus =
  | "draft"
  | "pending_approval"
  | "in_production"
  | "ready_for_delivery"
  | "in_transit"
  | "delivered"
  | "cancelled";

export type AlertColor = "red" | "orange" | "green";

export interface RecipeLine {
  rawMaterialId: string;
  quantityPerUnit: number;
}

export interface Product {
  id: string;
  name: string;
  estimatedProductionMinutes: number;
  recipe: RecipeLine[];
}

export interface OrderItem {
  id: string;
  productId: string;
  quantity: number;
  producedQuantity: number;
}

export interface Order {
  id: number;
  customerName: string;
  deliveryDate: Date;
  isUrgent: boolean;
  status: OrderStatus;
  createdAt: Date;
  items: OrderItem[];
}

export interface ShiftSettings {
  shiftWorkers: number;
  shiftHours: number;
  deliveryMinutes: number;
}
