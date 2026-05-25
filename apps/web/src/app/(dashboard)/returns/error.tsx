"use client";

import { useEffect } from "react";

export default function ReturnsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Returns page error:", error);
  }, [error]);

  return (
    <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-4">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-bold text-red-500">Returns Page Error</h2>
        <p className="text-sm font-mono bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded p-3 max-w-2xl text-left whitespace-pre-wrap">
          {error.message || String(error)}
        </p>
        {error.digest && <p className="text-xs text-muted-foreground">Digest: {error.digest}</p>}
      </div>
      <button onClick={reset} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm">
        Try again
      </button>
    </div>
  );
}
