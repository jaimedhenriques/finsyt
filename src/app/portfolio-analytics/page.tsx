const modules = [
  "Performance attribution",
  "Factor exposures",
  "Risk concentration and drawdown",
  "Peer-relative performance",
  "Holdings-level news and event impact",
];

export default function PortfolioAnalyticsPage() {
  return (
    <main className="container py-12">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Portfolio Analytics</h1>
      <p className="mt-3 max-w-3xl text-slate-600">
        Unified portfolio intelligence for PM teams: monitor exposures, explain performance, and act
        on risk and event-driven changes in real time.
      </p>
      <ul className="mt-6 space-y-2 text-slate-700">
        {modules.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
