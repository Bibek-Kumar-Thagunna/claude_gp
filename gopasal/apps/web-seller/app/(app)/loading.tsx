export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-6 h-8 w-56 gp-skeleton" />
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 gp-skeleton rounded-2xl" />
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="h-72 gp-skeleton rounded-2xl lg:col-span-2" />
        <div className="h-72 gp-skeleton rounded-2xl" />
      </div>
    </div>
  );
}
