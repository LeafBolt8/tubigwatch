export default function Loading() {
  return (
    <main className="mx-4 my-8 md:mx-auto max-w-6xl px-4 py-8 md:px-8 text-zinc-900 text-[16px] leading-[1.6]">
      <div className="bg-white/95 rounded-2xl shadow-sm border border-slate-200 p-6 mb-8">
        <header className="mb-8 border-b border-slate-200 pb-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-blue-700">TubigWatch</h1>
          <p className="mt-1 text-lg text-zinc-600">Metro Manila water service advisories</p>
        </header>

        <p className="mb-6 text-zinc-700">
          Contacting Maynilad AI... This may take up to 80 seconds on a cold load.
        </p>

        <ul className="space-y-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <li key={index} className="rounded border border-zinc-200 bg-white p-4 shadow-sm">
              <div className="flex flex-col gap-2">
                <div className="h-5 w-16 bg-zinc-200 animate-pulse rounded" />
                <div className="h-3 w-full bg-zinc-100 animate-pulse rounded" />
                <div className="h-3 w-5/6 bg-zinc-100 animate-pulse rounded" />
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  <div className="h-3 w-10 bg-zinc-200 animate-pulse rounded" />
                  <div className="h-3 w-16 bg-zinc-200 animate-pulse rounded" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
