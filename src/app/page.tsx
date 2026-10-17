export default function Home() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <div
              aria-hidden="true"
              className="flex size-10 items-center justify-center rounded-xl bg-accent text-lg font-semibold text-white"
            >
              A
            </div>
            <div>
              <p className="font-semibold tracking-tight">
                Agent Approval Console
              </p>
              <p className="text-xs text-slate-500">Human-supervised actions</p>
            </div>
          </div>
          <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-800">
            Foundation
          </span>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 py-14 sm:px-8 sm:py-20">
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-accent">
          Project foundation · Module 01
        </p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          Review every agent action with confidence.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600">
          A workspace for understanding what an AI agent proposes, why it
          proposes it, and what needs human approval.
        </p>

        <section
          aria-labelledby="foundation-heading"
          className="mt-12 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8"
        >
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
            <div
              aria-hidden="true"
              className="flex size-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-accent"
            >
              <svg
                aria-hidden="true"
                className="size-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="m5 12 4 4L19 6"
                />
              </svg>
            </div>
            <div>
              <h2
                id="foundation-heading"
                className="text-lg font-semibold tracking-tight"
              >
                Application foundation is ready
              </h2>
              <p className="mt-2 max-w-2xl leading-7 text-slate-600">
                The App Router, strict TypeScript, Tailwind CSS, linting, path
                aliases, and validated environment configuration are in place.
                The next module can add the shared domain and API contract
                without coupling it to this shell.
              </p>
            </div>
          </div>
          <div className="mt-7 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
            {["Next.js App Router", "TypeScript strict", "Tailwind CSS", "ESLint"].map(
              (item) => (
                <span
                  key={item}
                  className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700"
                >
                  {item}
                </span>
              ),
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
