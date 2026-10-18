"use client";

import "./globals.css";
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";
import BoardlyErrorState from "@/components/BoardlyErrorState";
import { getThemeInitScript } from "@/lib/theme";
import { getAppShellInitScript } from "@/lib/app-shell";

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
        <script
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: getAppShellInitScript() }}
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
