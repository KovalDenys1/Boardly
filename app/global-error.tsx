"use client";

import "./globals.css";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import BoardlyErrorState from "@/components/BoardlyErrorState";
import { getThemeInitScript } from "@/lib/theme";

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
    <html suppressHydrationWarning>
      <head>
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: getThemeInitScript() }}
        />
      </head>
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
