// The logo as on gsmatok.com: cream lettering in a dark chocolate box, a line beside "של".
export function BrandMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = { sm: "px-2 py-1 text-[0.8rem]", md: "px-3 py-2 text-lg", lg: "px-5 py-4 text-3xl" }[size];
  return (
    <div className={`inline-flex flex-col items-stretch bg-brand-dark font-display leading-[1.05] text-brand-cream ${s}`} aria-label="גוונים של מתוק">
      <span className="mb-[0.15em] h-[0.08em] min-h-px bg-brand-cream" />
      <span>גוונים</span>
      <span className="flex items-center gap-[0.25em]">
        של<span className="h-[0.08em] min-h-px flex-1 bg-brand-cream" />
      </span>
      <span>מתוק</span>
      <span className="mt-[0.15em] h-[0.08em] min-h-px bg-brand-cream" />
    </div>
  );
}
