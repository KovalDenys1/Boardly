"use client";

import "./globals.css";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import BoardlyErrorState from "@/components/BoardlyErrorState";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html>
      <body>
        <BoardlyErrorState
          error={error}
          onRetry={reset}
          kicker="Boardly · System Error"
        />
      </body>
    </html>
  );
}
