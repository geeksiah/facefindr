'use client';

import { RefreshCw, AlertTriangle } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const supportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || null;

  return (
    <html lang="en">
      <body className="bg-[#FAFAFA] dark:bg-black min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center">
          {/* Illustration */}
          <div className="relative mx-auto w-32 h-32 mb-8">
            <div className="absolute inset-0 rounded-full bg-red-500/10 animate-pulse" />
            <div className="absolute inset-4 rounded-full bg-red-500/20 flex items-center justify-center">
              <AlertTriangle className="h-12 w-12 text-red-500" />
            </div>
          </div>

          {/* Content */}
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            Critical Error
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            Something went seriously wrong. We&apos;re working on fixing this.
          </p>
          {error.digest && (
            <p className="text-xs text-gray-400 mb-6 font-mono">
              Error ID: {error.digest}
            </p>
          )}

          {/* Actions */}
          <button
            onClick={reset}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-500 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-600"
          >
            <RefreshCw className="h-4 w-4" />
            Try Again
          </button>

          {/* Help text */}
          <p className="mt-8 text-sm text-gray-400">
            If this keeps happening, please try refreshing the page or{' '}
            {supportEmail ? (
              <a href={`mailto:${supportEmail}`} className="text-blue-500 hover:underline">
                contact support
              </a>
            ) : (
              <span>contact support through your administrator</span>
            )}
          </p>
        </div>
      </body>
    </html>
  );
}
