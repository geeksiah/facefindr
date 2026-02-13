export default function DashboardLoading() {
  return (
    <div className="p-6 lg:p-8">
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-56 rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="h-28 rounded-2xl bg-muted" />
          <div className="h-28 rounded-2xl bg-muted" />
          <div className="h-28 rounded-2xl bg-muted" />
          <div className="h-28 rounded-2xl bg-muted" />
        </div>
        <div className="h-72 rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
