const agentCapabilities = [
  "Earnings call prep agent",
  "10-K and 10-Q diligence agent",
  "Portfolio monitor and alert agent",
  "Comps and market map agent",
  "Investment memo draft agent",
];

export default function AiAgentsPage() {
  return (
    <main className="container py-12">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">AI Agents</h1>
      <p className="mt-3 max-w-3xl text-slate-600">
        Task-specific finance agents designed for institutional workflows with auditable reasoning and
        source-cited outputs.
      </p>
      <ul className="mt-6 space-y-2 text-slate-700">
        {agentCapabilities.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
