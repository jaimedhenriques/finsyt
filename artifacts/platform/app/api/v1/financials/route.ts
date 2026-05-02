import { NextRequest } from "next/server";
import { withPublicApi, callInternalGet, corsPreflight } from "@/lib/api-key-auth";
import { GET as internalFinancials } from "@/app/api/financials/route";

export const runtime = "nodejs";

const INCOME_TO_MNEMONIC: Record<string, string> = {
  revenue: "iq_total_rev",
  totalrevenue: "iq_total_rev",
  grossprofit: "iq_gross_profit",
  grossmargin: "iq_gross_profit_margin",
  ebitda: "iq_ebitda",
  ebitdamargin: "iq_ebitda_margin",
  ebit: "iq_ebit",
  operatingincome: "iq_ebit",
  operatingmargin: "iq_ebit_margin",
  netincome: "iq_net_inc",
  netmargin: "iq_net_inc_margin",
  eps: "iq_eps_basic",
  epsdiluted: "iq_eps_diluted",
  sga: "iq_sga",
  rd: "iq_rd_exp",
  da: "iq_da_suppl",
  interestexpense: "iq_int_exp",
  taxexpense: "iq_tax_exp",
  costofrevenue: "iq_cost_rev",
  cogs: "iq_cost_rev",
  dilutedshares: "iq_diluted_shares",
  operatingexpenses: "iq_operating_exp",
  opex: "iq_operating_exp",
};

const BALANCE_TO_MNEMONIC: Record<string, string> = {
  totalassets: "iq_total_assets",
  cash: "iq_cash_equiv",
  cashandequivalents: "iq_cash_equiv",
  cashandshortterminvestments: "iq_cash_st_invest",
  ar: "iq_ar",
  receivables: "iq_ar",
  inventory: "iq_inventory",
  totalcurrentassets: "iq_total_current_assets",
  ppe: "iq_ppe_net",
  ppenet: "iq_ppe_net",
  goodwill: "iq_goodwill",
  intangibles: "iq_intangibles",
  totalliabilities: "iq_total_liab",
  totalcurrentliabilities: "iq_total_current_liab",
  shorttermdebt: "iq_st_debt",
  longtermdebt: "iq_lt_debt",
  totaldebt: "iq_total_debt",
  netdebt: "iq_net_debt",
  totalequity: "iq_total_equity",
  bookvaluepershare: "iq_book_val_share",
  retainedearnings: "iq_retained_earnings",
};

const CASH_TO_MNEMONIC: Record<string, string> = {
  operatingcashflow: "iq_net_cash_ops",
  ocf: "iq_net_cash_ops",
  capex: "iq_capex",
  capitalexpenditure: "iq_capex",
  freecashflow: "iq_free_cash_flow",
  fcf: "iq_free_cash_flow",
  netcashinvesting: "iq_net_cash_inv",
  netcashfinancing: "iq_net_cash_finan",
  dividendspaid: "iq_div_paid",
  da: "iq_da_cf",
  stockbasedcomp: "iq_stock_comp",
  sbc: "iq_stock_comp",
  buybacks: "iq_buy_back",
  netchangeincash: "iq_net_change_cash",
};

function normaliseStatement(s: string): "income" | "balance" | "cash" | null {
  const t = s.toLowerCase().replace(/[\s_-]/g, "");
  if (t.startsWith("income") || t === "is" || t === "pl") return "income";
  if (t.startsWith("balance") || t === "bs") return "balance";
  if (t.startsWith("cash") || t === "cf") return "cash";
  return null;
}

function pickMap(stmt: "income" | "balance" | "cash"): Record<string, string> {
  if (stmt === "income") return INCOME_TO_MNEMONIC;
  if (stmt === "balance") return BALANCE_TO_MNEMONIC;
  return CASH_TO_MNEMONIC;
}

/**
 * Translate `type=<statement>` + friendly `metric` (e.g. "revenue",
 * "freeCashFlow") into the internal `iq_*` mnemonic the underlying
 * /api/financials route expects. This keeps the public v1 API ergonomic
 * for Excel + external callers without changing the internal contract.
 */
function rewriteUrl(req: NextRequest): NextRequest {
  const sp = req.nextUrl.searchParams;
  const type = sp.get("type");
  const metric = sp.get("metric");
  if (!type || !metric) return req;
  const stmt = normaliseStatement(type);
  if (!stmt) return req;
  // Already a mnemonic — pass through.
  if (metric.startsWith("iq_")) return req;
  const key = metric.toLowerCase().replace(/[\s_-]/g, "");
  const mnemonic = pickMap(stmt)[key];
  if (!mnemonic) return req;
  const u = new URL(req.url);
  u.searchParams.set("metric", mnemonic);
  u.searchParams.delete("type");
  return new NextRequest(u, req);
}

export const GET = withPublicApi(
  async (req) =>
    callInternalGet(internalFinancials, rewriteUrl(req), [
      "symbol", "metric", "metrics", "period", "offset", "limit",
    ]),
  { endpoint: "/v1/financials" },
);

export async function OPTIONS(req: NextRequest) {
  return corsPreflight(req);
}
