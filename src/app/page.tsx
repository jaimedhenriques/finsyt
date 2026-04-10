const priorities = [
  "Research chat with citations",
  "News intelligence workflows",
  "Screening and portfolio analytics",
  "AI agent workbench and automation",
  "Enterprise auth, billing, security, observability",
];

const platformPages = [
  { name: "Research", href: "/" },
  { name: "News", href: "/news" },
  { name: "Screening", href: "/screening" },
  { name: "Portfolio Analytics", href: "/portfolio-analytics" },
  { name: "AI Agents", href: "/ai-agents" },
];

const competitorMatrix = [
  { platform: "Finsyt", strengths: "Unified AI research + screening + portfolio + agents", gap: "Shipping full production parity" },
  { platform: "AlphaSense", strengths: "Document and transcript search depth", gap: "Higher cost, less customizable workflows" },
  { platform: "Rogo", strengths: "Finance-specific AI workflows", gap: "Narrower data + workflow surface area" },
  { platform: "Hebbia", strengths: "Document reasoning and knowledge workflows", gap: "Less integrated live market stack" },
  { platform: "PitchBook", strengths: "Private market and company intelligence", gap: "AI and workflow automation depth" },
  { platform: "FactSet", strengths: "Institutional data coverage and terminals", gap: "Modern AI UX and speed-to-insight" },
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

      <section className="mt-8 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Platform information architecture</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {platformPages.map((page) => (
            <a
              key={page.name}
              href={page.href}
              className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              {page.name}
            </a>
          ))}
        </div>
      </section>

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

      <section className="mt-10 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Competitive benchmark</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-slate-500">
                <th className="px-3 py-2 font-semibold">Platform</th>
                <th className="px-3 py-2 font-semibold">Current strength</th>
                <th className="px-3 py-2 font-semibold">Opportunity for Finsyt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {competitorMatrix.map((row) => (
                <tr key={row.platform}>
                  <td className="px-3 py-2 font-medium text-slate-900">{row.platform}</td>
                  <td className="px-3 py-2 text-slate-700">{row.strengths}</td>
                  <td className="px-3 py-2 text-slate-700">{row.gap}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
