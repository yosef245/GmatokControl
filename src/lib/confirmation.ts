import type { OrderDetail } from "./order-detail";
import { confirmationMessage, waLink } from "./whatsapp";
import { fullWhen, money } from "./format";

/** WhatsApp link with the order confirmation, or null when the customer's phone can't be used. */
export function orderWhatsApp(o: OrderDetail, businessName: string, vatPercent: number, withPrices: boolean): string | null {
  return waLink(
    o.customer.phone,
    confirmationMessage({
      businessName,
      orderId: o.id,
      customerName: o.customer.contactName || o.customer.name,
      deliveryText: fullWhen(o.deliveryDate),
      addressText: o.address ? `${o.address.address}, ${o.address.city}` : null,
      lines: o.items.map((i) => ({ name: i.productName, quantity: i.quantity, notes: i.notes })),
      totalText: withPrices ? `${money(o.total * (1 + vatPercent / 100))} כולל מע״מ` : undefined,
    }),
  );
}
