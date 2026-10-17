export type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = "Loading" }: LoadingStateProps) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-3 rounded-lg border border-line bg-surface px-6 py-10 text-sm text-fg-muted"
    >
      <span
        aria-hidden="true"
        className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent motion-reduce:animate-none"
      />
      {label}
    </div>
  );
}
