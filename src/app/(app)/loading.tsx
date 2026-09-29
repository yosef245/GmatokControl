/** Shown the moment a page link is tapped, while the page's data loads, so the app never looks frozen. */
export default function Loading() {
  return (
    <div className="flex animate-pulse flex-col gap-5" role="status" aria-label="טוען">
      <div className="h-8 w-48 rounded-lg bg-sunken" />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl border border-line bg-surface" />
        ))}
      </div>
      <div className="h-64 rounded-xl border border-line bg-surface" />
    </div>
  );
}
