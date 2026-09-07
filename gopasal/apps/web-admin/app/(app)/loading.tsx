/** Route-level skeleton so navigation never flashes an empty console. */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-ink-100" />
        <div>
          <div className="h-6 w-52 rounded-md bg-ink-100" />
          <div className="mt-2 h-3.5 w-72 rounded bg-ink-100/80" />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="gp-panel h-[132px] p-5">
            <div className="h-10 w-10 rounded-xl bg-ink-100" />
            <div className="mt-4 h-6 w-24 rounded bg-ink-100" />
            <div className="mt-2 h-3.5 w-32 rounded bg-ink-100/80" />
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <div className="gp-panel h-80 lg:col-span-2" />
        <div className="gp-panel h-80" />
      </div>
    </div>
  );
}
