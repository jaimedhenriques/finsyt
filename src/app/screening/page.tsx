const screeningDimensions = [
  "Valuation multiples",
  "Revenue growth and quality",
  "Profitability and margins",
  "Balance sheet strength",
  "Estimate revisions and momentum",
];

export default function ScreeningPage() {
  return (
    <main className="container py-12">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900">Screening</h1>
      <p className="mt-3 max-w-3xl text-slate-600">
        Multi-factor equity screening with explainable filter logic and watchlist export for PM and
        analyst workflows.
      </p>
      <ul className="mt-6 space-y-2 text-slate-700">
        {screeningDimensions.map((item) => (
          <li key={item} className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-blue-600" aria-hidden />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </main>
  );
}
