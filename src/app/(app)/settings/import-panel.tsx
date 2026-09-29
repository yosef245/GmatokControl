"use client";

import { useActionState, useState } from "react";
import { importRows } from "@/lib/actions/settings";
import { IMPORT_KINDS, parseCsv, parseSheet, templateCsv, type ImportKind, type ParseResult } from "@/lib/import";
import { btnPrimary, btnSecondary, Card, Field, inputCls, Pill } from "@/components/ui";

const PREVIEW = 15;

/** Reads a .xlsx or .csv file in the browser into rows of cells. */
async function readFile(file: File): Promise<unknown[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import("read-excel-file/universal");
    return (await readSheet(await file.arrayBuffer())) as unknown[][];
  }
  const bytes = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(bytes);
  // Excel on Windows saves Hebrew CSV in windows-1255 unless "CSV UTF-8" is chosen
  if (text.includes("�")) text = new TextDecoder("windows-1255").decode(bytes);
  return parseCsv(text);
}

export function ImportPanel() {
  const [kind, setKind] = useState<ImportKind>("customers");
  const [parsed, setParsed] = useState<(ParseResult & { file: string }) | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const [state, run, pending] = useActionState(importRows, null);
  const spec = IMPORT_KINDS[kind];

  async function onFile(file: File | undefined, k = kind) {
    setParsed(null);
    setReadError(null);
    if (!file) return;
    if (!/\.(xlsx|csv)$/i.test(file.name)) {
      setReadError("אפשר לטעון קובץ Excel ‏(xlsx) או CSV. קובץ xls ישן: פותחים באקסל ושומרים בשם כ־xlsx.");
      return;
    }
    try {
      setParsed({ ...parseSheet(k, await readFile(file)), file: file.name });
    } catch {
      setReadError("לא הצלחנו לקרוא את הקובץ. בדקו שהוא לא פתוח באקסל ונסו שוב.");
    }
  }

  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(templateCsv(kind))}`;
  const ready = parsed && !parsed.missing.length && !parsed.errors.length && parsed.rows.length > 0;

  return (
    <>
      <Card title="ייבוא נתונים מאקסל">
        <p className="mb-4 text-sm text-muted">
          השורה הראשונה בקובץ היא כותרות העמודות. אפשר להוריד תבנית ולמלא אותה, או להשתמש בקובץ קיים עם אותן כותרות.
          ייבוא חוזר של אותו קובץ לא יוצר כפילויות: שורות קיימות מתעדכנות.
        </p>
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="מה מייבאים">
            <select
              value={kind}
              onChange={(e) => {
                const k = e.target.value as ImportKind;
                setKind(k);
                setParsed(null);
                const input = document.getElementById("import-file") as HTMLInputElement | null;
                if (input?.files?.[0]) void onFile(input.files[0], k);
              }}
              className={inputCls}
            >
              {(Object.keys(IMPORT_KINDS) as ImportKind[]).map((k) => <option key={k} value={k}>{IMPORT_KINDS[k].label}</option>)}
            </select>
          </Field>
          <Field label="קובץ (xlsx או csv)" className="md:col-span-2">
            <input id="import-file" type="file" accept=".xlsx,.csv" onChange={(e) => onFile(e.target.files?.[0])} className={inputCls + " py-2"} />
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <span className="font-bold">עמודות:</span>
          {spec.columns.map((c) => (
            <Pill key={c.key} tone={"required" in c && c.required ? "blue" : "neutral"}>{c.label}{"required" in c && c.required ? " *" : ""}</Pill>
          ))}
          <a href={template} download={`תבנית-${spec.label}.csv`} className={btnSecondary + " ms-auto min-h-9 px-3"}>הורדת תבנית</a>
        </div>
        <p className="mt-2 text-xs text-muted">* חובה. {spec.hint}</p>
        {readError && <p className="mt-3 font-bold text-bad" role="alert">{readError}</p>}
      </Card>

      {parsed && (
        <Card title={`בדיקת הקובץ: ${parsed.file}`}>
          {parsed.missing.length > 0 ? (
            <p className="font-bold text-bad" role="alert">חסרות עמודות: {parsed.missing.join(", ")}. בדקו שהשורה הראשונה היא הכותרות.</p>
          ) : (
            <>
              <p className="mb-3">
                <b className="text-ok">{parsed.rows.length} שורות תקינות</b>
                {parsed.errors.length > 0 && <b className="text-bad"> · {parsed.errors.length} שורות עם בעיה</b>}
                {parsed.ignored.length > 0 && <span className="text-sm text-muted"> · עמודות שלא נקראו: {parsed.ignored.join(", ")}</span>}
              </p>
              {parsed.errors.length > 0 && (
                <ul className="mb-3 flex flex-col gap-1 rounded-lg bg-bad-bg p-3 text-sm text-bad" role="alert">
                  {parsed.errors.slice(0, 20).map((e, i) => <li key={i}>{e.row ? `שורה ${e.row}: ` : ""}{e.message}</li>)}
                  {parsed.errors.length > 20 && <li>ועוד {parsed.errors.length - 20}…</li>}
                  <li className="font-bold">מתקנים את הקובץ וטוענים אותו שוב.</li>
                </ul>
              )}
              {parsed.rows.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="bg-sunken text-muted">
                      <tr>{spec.columns.map((c) => <th key={c.key} className="px-2 py-1.5 text-start">{c.label}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-line">
                      {parsed.rows.slice(0, PREVIEW).map((r, i) => (
                        <tr key={i}>{spec.columns.map((c) => <td key={c.key} className="px-2 py-1.5">{String(r[c.key] ?? "")}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                  {parsed.rows.length > PREVIEW && <p className="mt-1 text-xs text-muted">מוצגות {PREVIEW} שורות ראשונות.</p>}
                </div>
              )}
            </>
          )}
          {ready && (
            <form action={run} className="mt-4 flex flex-wrap items-center gap-3" aria-busy={pending}>
              <input type="hidden" name="kind" value={kind} />
              <input type="hidden" name="rows" value={JSON.stringify(parsed.rows)} />
              <button className={btnPrimary} disabled={pending}>{pending ? "מייבא…" : `ייבוא ${parsed.rows.length} ${spec.label}`}</button>
            </form>
          )}
          {state && "error" in state && <p className="mt-3 font-bold text-bad" role="alert">{state.error}</p>}
          {state && "ok" in state && <p className="mt-3 font-bold text-ok" role="status">{state.ok}</p>}
        </Card>
      )}
    </>
  );
}
