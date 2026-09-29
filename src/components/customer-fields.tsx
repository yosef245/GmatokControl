import { Field, inputCls } from "./ui";

export interface CustomerValues {
  name?: string;
  contact_name?: string | null;
  phone?: string;
  type?: string;
  notes?: string | null;
  assigned_marketer_id?: string | null;
}

export function CustomerFields({ c = {}, marketers }: { c?: CustomerValues; marketers?: { id: string; full_name: string }[] }) {
  return (
    <>
      <Field label="שם הלקוח / העסק"><input name="name" defaultValue={c.name} className={inputCls} required /></Field>
      <Field label="איש קשר"><input name="contact_name" defaultValue={c.contact_name ?? ""} className={inputCls} /></Field>
      <Field label="טלפון" hint="לשליחת אישור בוואטסאפ"><input name="phone" defaultValue={c.phone} className={inputCls} dir="ltr" inputMode="tel" required /></Field>
      <Field label="סוג">
        <select name="type" defaultValue={c.type ?? "private"} className={inputCls}>
          <option value="private">פרטי</option>
          <option value="business">עסקי</option>
        </select>
      </Field>
      {marketers && (
        <Field label="משווק אחראי">
          <select name="assigned_marketer_id" defaultValue={c.assigned_marketer_id ?? ""} className={inputCls}>
            <option value="">ללא</option>
            {marketers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </select>
        </Field>
      )}
      <Field label="הערות" className="md:col-span-2"><textarea name="notes" defaultValue={c.notes ?? ""} rows={2} className={inputCls + " py-2"} /></Field>
    </>
  );
}
