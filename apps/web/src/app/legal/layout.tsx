import Link from 'next/link';

export default function LegalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <Link href="/" className="text-xl font-bold text-primary">
            FaceFind
          </Link>
        </div>
      </header>

      {/* Sidebar + Content */}
      <div className="container mx-auto px-4 py-8">
        <div className="flex gap-8">
          {/* Sidebar */}
          <aside className="hidden md:block w-64 flex-shrink-0">
            <nav className="sticky top-8 space-y-1">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-4">
                Legal Documents
              </h3>
              <NavLink href="/legal/terms-photographers">Terms of Service (Photographers)</NavLink>
              <NavLink href="/legal/terms-attendees">Terms of Use (Attendees)</NavLink>
              <NavLink href="/legal/privacy">Privacy Policy</NavLink>
              <NavLink href="/legal/biometric">Biometric Data Policy</NavLink>
              <NavLink href="/legal/cookies">Cookie Policy</NavLink>
              <NavLink href="/legal/dmca">DMCA Policy</NavLink>
            </nav>
          </aside>

          {/* Content */}
          <main className="flex-1 max-w-3xl">
            {children}
          </main>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t py-8 mt-auto">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} FaceFind. All rights reserved.</p>
          <p className="mt-2">
            Questions? Contact us at{' '}
            <a href="mailto:legal@facefind.app" className="text-primary hover:underline">
              legal@facefind.app
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block px-3 py-2 text-sm rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
    >
      {children}
    </Link>
  );
}
