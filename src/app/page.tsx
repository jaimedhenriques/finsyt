const priorities = [
  "Research chat with citations",
  "Data provider orchestration",
  "Watchlists + monitoring workflows",
  "Excel and MCP integrations",
  "Enterprise auth, security, observability",
];

export default function HomePage() {
  return (
    <main className="container py-12">
      <p className="text-sm font-semibold uppercase tracking-wide text-blue-700">Finsyt</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight text-slate-900">Financial intelligence platform foundation</h1>
      <p className="mt-4 max-w-3xl text-slate-600">
        This repository now hosts the canonical engineering foundation for Finsyt. The backend
        service layer, API skeleton, and product execution plan are defined so Claude and Cursor can
        collaborate continuously toward a competitor-grade platform.
      </p>

      <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Execution priorities</h2>
        <ul className="mt-4 space-y-3 text-slate-700">
          {priorities.map((priority) => (
            <li key={priority} className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden />
              <span>{priority}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
