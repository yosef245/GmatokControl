"use client";

export function PrintButton() {
  return (
    <button onClick={() => window.print()} className="min-h-11 rounded-lg bg-accent px-4 font-bold text-on-accent">
      הדפסה / שמירה כ־PDF
    </button>
  );
}
