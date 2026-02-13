export default function GalleryLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="space-y-6 animate-pulse">
        <div className="h-8 w-56 rounded bg-muted" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="h-36 rounded-2xl bg-muted" />
          <div className="h-36 rounded-2xl bg-muted" />
          <div className="h-36 rounded-2xl bg-muted" />
        </div>
        <div className="h-64 rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
