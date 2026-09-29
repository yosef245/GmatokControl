/** Reading customers, products, raw materials and price lists from a spreadsheet (first row = headers). */

type ColType = "text" | "number" | "phone" | "type";
interface Column {
  key: string;
  label: string;
  aliases: string[];
  required?: boolean;
  type?: ColType;
}

export const IMPORT_KINDS = {
  customers: {
    label: "לקוחות",
    hint: "לקוח עם אותו טלפון מתעדכן; כתובת חדשה נוספת לו.",
    columns: [
      { key: "name", label: "שם", aliases: ["שם לקוח", "לקוח", "שם העסק", "name"], required: true },
      { key: "phone", label: "טלפון", aliases: ["נייד", "טלפון נייד", "phone"], required: true, type: "phone" },
      { key: "contact_name", label: "איש קשר", aliases: ["contact"] },
      { key: "type", label: "סוג", aliases: ["סוג לקוח", "type"], type: "type" },
      { key: "address", label: "כתובת", aliases: ["רחוב", "address"] },
      { key: "city", label: "עיר", aliases: ["ישוב", "יישוב", "city"] },
      { key: "delivery_notes", label: "הערות למשלוח", aliases: ["הערות משלוח"] },
      { key: "notes", label: "הערות", aliases: ["notes"] },
      { key: "marketer_email", label: "אימייל משווק", aliases: ["מייל משווק"] },
      { key: "price_list", label: "מחירון", aliases: ["price list"] },
    ],
  },
  products: {
    label: "מוצרים",
    hint: "מוצר עם אותו שם מתעדכן.",
    columns: [
      { key: "name", label: "שם", aliases: ["מוצר", "שם מוצר", "name"], required: true },
      { key: "category", label: "קטגוריה", aliases: ["category"] },
      { key: "price", label: "מחיר", aliases: ["מחיר לפני מעמ", "price"], required: true, type: "number" },
      { key: "minutes", label: "דקות ליחידה", aliases: ["דקות", "דקות עבודה", "זמן ייצור"], type: "number" },
    ],
  },
  materials: {
    label: "חומרי גלם",
    hint: "חומר עם אותו שם מתעדכן. עמודת המלאי נרשמת כספירת מלאי.",
    columns: [
      { key: "name", label: "שם", aliases: ["חומר", "חומר גלם", "name"], required: true },
      { key: "unit", label: "יחידה", aliases: ["יחידת מידה", "unit"], required: true },
      { key: "stock", label: "מלאי", aliases: ["כמות", "כמות במלאי", "stock"], type: "number" },
      { key: "minimum", label: "מינימום", aliases: ["מלאי מינימום", "סף"], type: "number" },
      { key: "supplier_name", label: "ספק", aliases: ["שם ספק"] },
      { key: "supplier_phone", label: "טלפון ספק", aliases: [] },
    ],
  },
  prices: {
    label: "מחירונים",
    hint: "מחירון שלא קיים נוצר. המוצר חייב להיות קיים כבר.",
    columns: [
      { key: "price_list", label: "מחירון", aliases: ["שם מחירון"], required: true },
      { key: "product", label: "מוצר", aliases: ["שם מוצר"], required: true },
      { key: "price", label: "מחיר", aliases: ["מחיר לפני מעמ"], required: true, type: "number" },
    ],
  },
} satisfies Record<string, { label: string; hint: string; columns: Column[] }>;

export type ImportKind = keyof typeof IMPORT_KINDS;
export type ImportRow = Record<string, string | number>;
export interface ParseResult {
  rows: ImportRow[];
  errors: { row: number; message: string }[];
  missing: string[];
  ignored: string[];
}

export const MAX_ROWS = 2000;

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .replace(/[״"׳'`.]/g, "")
    .replace(/\s+/g, " ")
    .trim();

function toNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v ?? "").replace(/[₪,\s]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toPhone(v: unknown): string | null {
  // Excel drops the leading zero of a phone typed as a number: 501234567 → 0501234567
  let s = typeof v === "number" ? String(Math.round(v)) : String(v ?? "").trim();
  if (/^[1-9]\d{7,8}$/.test(s)) s = "0" + s;
  return s.replace(/\D/g, "").length >= 9 ? s : null;
}

const TYPES: Record<string, string> = { פרטי: "private", private: "private", עסקי: "business", עסק: "business", business: "business" };

/** Maps a sheet (array of rows, first non-empty row = headers) to import rows, with row-numbered errors. */
export function parseSheet(kind: ImportKind, table: unknown[][]): ParseResult {
  const columns: Column[] = IMPORT_KINDS[kind].columns;
  const start = table.findIndex((r) => r.some((c) => String(c ?? "").trim() !== ""));
  const result: ParseResult = { rows: [], errors: [], missing: [], ignored: [] };
  if (start < 0) {
    result.errors.push({ row: 0, message: "הקובץ ריק." });
    return result;
  }
  const headers = table[start].map(norm);
  const index = new Map<string, number>();
  headers.forEach((h, i) => {
    if (!h) return;
    const col = columns.find((c) => norm(c.label) === h || c.aliases.some((a) => norm(a) === h));
    if (col && !index.has(col.key)) index.set(col.key, i);
    else result.ignored.push(String(table[start][i]).trim());
  });
  result.missing = columns.filter((c) => c.required && !index.has(c.key)).map((c) => c.label);
  if (result.missing.length) return result;

  for (let r = start + 1; r < table.length; r++) {
    const cells = table[r];
    if (!cells.some((c) => String(c ?? "").trim() !== "")) continue;
    const rowNo = r + 1;
    const row: ImportRow = {};
    const problems: string[] = [];
    for (const c of columns) {
      const i = index.get(c.key);
      const raw = i === undefined ? "" : cells[i];
      const empty = String(raw ?? "").trim() === "";
      if (empty) {
        if (c.required) problems.push(`חסר ${c.label}`);
        continue;
      }
      if (c.type === "number") {
        const n = toNumber(raw);
        if (n === null || n < 0) problems.push(`${c.label} לא מספר תקין`);
        else row[c.key] = n;
      } else if (c.type === "phone") {
        const p = toPhone(raw);
        if (!p) problems.push("טלפון לא תקין");
        else row[c.key] = p;
      } else if (c.type === "type") {
        const t = TYPES[norm(raw)];
        if (!t) problems.push("סוג צריך להיות פרטי או עסקי");
        else row[c.key] = t;
      } else {
        row[c.key] = String(raw).trim();
      }
    }
    if (problems.length) result.errors.push({ row: rowNo, message: problems.join(", ") });
    else result.rows.push(row);
  }
  if (result.rows.length + result.errors.length > MAX_ROWS) {
    result.errors.unshift({ row: 0, message: `אפשר לייבא עד ${MAX_ROWS} שורות בפעם אחת.` });
  }
  return result;
}

/** Splits CSV text (comma, semicolon or tab separated; quoted fields) into rows. */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, "");
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === "") quoted = true;
    else if (ch === sep) { row.push(field); field = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** A CSV template with the kind's headers, for Excel (UTF-8 with BOM so Hebrew opens correctly). */
export function templateCsv(kind: ImportKind): string {
  return "﻿" + IMPORT_KINDS[kind].columns.map((c) => c.label).join(",") + "\r\n";
}
