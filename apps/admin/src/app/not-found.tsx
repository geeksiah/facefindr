import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center">
        <h1 className="text-2xl font-semibold text-foreground">Page Not Found</h1>
        <p className="mt-3 text-sm text-muted-foreground">
          The admin page you requested does not exist or may have moved.
        </p>
        <Link
          href="/"
          className="mt-6 inline-flex h-10 items-center justify-center rounded-md bg-foreground px-4 text-sm font-medium text-background hover:bg-foreground/90"
        >
          Back To Dashboard
        </Link>
      </div>
    </main>
  );
}
