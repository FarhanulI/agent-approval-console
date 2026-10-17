"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";

export default function ConsoleError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-3xl py-8">
      <ErrorState
        title="Console section could not be loaded"
        action={
          <Button onClick={reset} variant="secondary">
            Try again
          </Button>
        }
      />
    </div>
  );
}