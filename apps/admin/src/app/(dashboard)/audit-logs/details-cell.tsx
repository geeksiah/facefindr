'use client';

import { Copy, Expand } from 'lucide-react';
import { useMemo, useState } from 'react';

export function DetailsCell({ details }: { details: Record<string, unknown> | null }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const pretty = useMemo(() => JSON.stringify(details || {}, null, 2), [details]);
  const compact = useMemo(() => JSON.stringify(details || {}), [details]);

  if (!details || Object.keys(details).length === 0) {
    return <span className="text-muted-foreground">-</span>;
  }

  const copyDetails = async () => {
    try {
      await navigator.clipboard.writeText(pretty);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <pre className="max-w-xs truncate text-xs text-muted-foreground">{compact}</pre>
        <button
          type="button"
          onClick={copyDetails}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title={copied ? 'Copied' : 'Copy details JSON'}
        >
          <Copy className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          title="Expand details"
        >
          <Expand className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="w-full max-w-2xl rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Audit Details</h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={copyDetails}
                  className="rounded-md border border-border px-3 py-1 text-xs text-foreground hover:bg-muted"
                >
                  {copied ? 'Copied' : 'Copy JSON'}
                </button>
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="rounded-md border border-border px-3 py-1 text-xs text-foreground hover:bg-muted"
                >
                  Close
                </button>
              </div>
            </div>
            <pre className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-muted/30 p-3 text-xs text-foreground">
              {pretty}
            </pre>
          </div>
        </div>
      )}
    </>
  );
}
