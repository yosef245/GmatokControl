import { deliveryStep } from "@/lib/actions/deliveries";
import { ActionForm } from "@/components/action-form";
import { btnPrimary, btnSecondary, Field, inputCls } from "@/components/ui";
import type { OrderStatus } from "@/lib/domain/types";

const small = " min-h-9 px-3 text-sm";

function Hidden({ id, step }: { id: number; step: string }) {
  return (
    <>
      <input type="hidden" name="order_id" value={id} />
      <input type="hidden" name="step" value={step} />
    </>
  );
}

function AssignForm({ id, couriers }: { id: number; couriers: { id: string; name: string }[] }) {
  return (
    <ActionForm action={deliveryStep} className="mt-2 flex flex-wrap items-end gap-2">
      <Hidden id={id} step="assign" />
      {couriers.length > 0 && (
        <Field label="שליח מהצוות" className="min-w-40 flex-1">
          <select name="courier" className={inputCls} defaultValue="">
            <option value="">שליח חיצוני (שם למטה)</option>
            {couriers.map((c) => <option key={c.id} value={`user:${c.id}`}>{c.name}</option>)}
          </select>
        </Field>
      )}
      <Field label={couriers.length ? "או שם שליח / חברת משלוחים" : "שם שליח / חברת משלוחים"} className="min-w-40 flex-1">
        <input name="courier_name" className={inputCls} placeholder="למשל: גט טקסי" />
      </Field>
      <button className={btnPrimary}>שיבוץ</button>
    </ActionForm>
  );
}

function DeliverForm({ id, label }: { id: number; label: string }) {
  return (
    <ActionForm action={deliveryStep} className="mt-2 flex flex-wrap items-end gap-2">
      <Hidden id={id} step="deliver" />
      <Field label="שם המקבל (לא חובה)" className="min-w-40 flex-1"><input name="receiver" className={inputCls} /></Field>
      <button className={btnPrimary + " bg-ok"}>{label}</button>
    </ActionForm>
  );
}

/** The next delivery steps for one order, by its status. Renders nothing for other statuses. */
export function DeliveryActions({
  id,
  status,
  courier,
  pickup,
  couriers,
}: {
  id: number;
  status: OrderStatus;
  courier: string | null;
  pickup: boolean;
  couriers: { id: string; name: string }[];
}) {
  if (status === "ready_for_delivery") {
    return (
      <div className="flex flex-col gap-2">
        {pickup ? (
          <DeliverForm id={id} label="נאסף ע״י הלקוח" />
        ) : courier ? (
          <ActionForm action={deliveryStep} className="flex flex-wrap items-center gap-2">
            <Hidden id={id} step="depart" />
            <button className={btnPrimary}>יצא לאספקה</button>
          </ActionForm>
        ) : (
          <AssignForm id={id} couriers={couriers} />
        )}
        {!pickup && courier && (
          <details>
            <summary className="cursor-pointer text-sm font-bold text-accent">החלפת שליח</summary>
            <AssignForm id={id} couriers={couriers} />
          </details>
        )}
        {pickup && (
          <details>
            <summary className="cursor-pointer text-sm font-bold text-accent">לשלוח עם שליח במקום איסוף</summary>
            {courier ? (
              <ActionForm action={deliveryStep} className="mt-2">
                <Hidden id={id} step="depart" />
                <button className={btnSecondary + small}>יצא לאספקה עם {courier}</button>
              </ActionForm>
            ) : (
              <AssignForm id={id} couriers={couriers} />
            )}
          </details>
        )}
      </div>
    );
  }
  if (status === "in_transit") {
    return (
      <div className="flex flex-col gap-2">
        <DeliverForm id={id} label="נמסר ללקוח" />
        <details>
          <summary className="cursor-pointer text-sm font-bold text-muted">חזר בלי מסירה</summary>
          <ActionForm action={deliveryStep} className="mt-2 flex flex-wrap items-end gap-2">
            <Hidden id={id} step="return" />
            <Field label="מה קרה?" className="min-w-40 flex-1"><input name="notes" className={inputCls} placeholder="למשל: הלקוח לא ענה" /></Field>
            <button className={btnSecondary}>החזרה למוכנות</button>
          </ActionForm>
        </details>
      </div>
    );
  }
  return null;
}
