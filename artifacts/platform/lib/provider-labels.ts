/**
 * Client-safe display labels for data-provider `source` codes.
 *
 * The quote/news/aggs routes tag every response with a short `source`
 * string (e.g. `fmp`, `massive`, `eodhd`). This maps those to the
 * human-readable provider name shown in the UI's freshness / attribution
 * chips. Kept deliberately free of any `process.env` / server imports so
 * it can be pulled into client components without dragging the whole
 * data-providers module (and its module-load side effects) clientside.
 */
export const PROVIDER_LABELS: Record<string, string> = {
  fmp:                 'Financial Modeling Prep',
  massive:             'Massive (Polygon.io)',
  polygon:             'Massive (Polygon.io)',
  yahoo:               'Yahoo Finance',
  eodhd:               'EODHD',
  finnhub:             'Finnhub',
  alphav:              'Alpha Vantage',
  marketstack:         'Marketstack',
  twelvedata:          'Twelve Data',
  alpaca:              'Alpaca Markets',
  databento:           'Databento',
  own:                 'OpenWebNinja',
  openwebninja:        'OpenWebNinja',
  'openwebninja-yahoo':'OpenWebNinja (Yahoo)',
  salesforce:          'Salesforce',
  hubspot:             'HubSpot',
  gmail:               'Gmail',
  microsoft365:        'Microsoft 365 (Outlook)',
  sharepoint:          'SharePoint / OneDrive',
  'google-drive':      'Google Drive',
  confluence:          'Confluence',
  notion:              'Notion',
}

/** Resolve a `source` code to its display name; falls back to a capitalised code. */
export function providerLabel(source?: string | null): string {
  if (!source) return 'Live data'
  return PROVIDER_LABELS[source] || source.charAt(0).toUpperCase() + source.slice(1)
}
