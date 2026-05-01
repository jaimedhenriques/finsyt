import React from "react";
import { Link } from "wouter";
import { ArrowRight, Search, FileText, BarChart3, ChevronRight, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Product() {
  return (
    <main className="min-h-screen bg-background">
      <section className="pt-32 pb-20 px-6 max-w-7xl mx-auto">
        <div className="mb-16">
          <h1 className="text-5xl md:text-6xl font-display font-bold text-foreground mb-6">
            The intelligent research workflow.
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl leading-relaxed">
            Finsyt doesn't just search documents—it understands them. Explore how our AI agents transform raw financial data into structured, actionable insights.
          </p>
        </div>

        {/* Feature 1 */}
        <div className="grid lg:grid-cols-2 gap-16 items-center py-16 border-t border-border">
          <div>
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-6">
              <Search className="w-6 h-6" />
            </div>
            <h2 className="text-3xl font-display font-bold mb-4">Semantic precision, not keyword matching.</h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              Ask complex financial questions exactly how you'd ask an analyst. Finsyt understands context, synonyms, and financial jargon, pulling the exact right data points from thousands of documents simultaneously.
            </p>
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span>"Summarize the key drivers of margin compression for AAPL in Q3 vs Q2."</span>
              </li>
              <li className="flex items-start gap-3">
                <ChevronRight className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span>"Create a table of restructuring charges for top 5 banks over the last 3 years."</span>
              </li>
            </ul>
          </div>
          <div className="bg-muted/30 rounded-2xl p-6 md:p-8 border border-border">
            <div className="bg-card rounded-xl border border-border shadow-md overflow-hidden">
               <div className="p-4 border-b border-border bg-muted/50 flex items-center gap-3">
                 <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
                    <span className="text-primary font-semibold text-xs">You</span>
                 </div>
                 <div className="text-sm font-medium">What is NVDA's capital return strategy?</div>
               </div>
               <div className="p-6 space-y-4">
                 <div className="flex gap-3">
                   <div className="w-8 h-8 rounded bg-primary flex items-center justify-center shrink-0">
                      <span className="text-white font-bold text-xs">F</span>
                   </div>
                   <div className="space-y-3">
                     <p className="text-sm leading-relaxed">
                       NVIDIA's capital return strategy is primarily focused on share repurchases and a modest dividend. In FY2024, the company returned <span className="bg-primary/10 text-primary px-1 rounded"><strong>$9.9 billion</strong></span> to shareholders in the form of share repurchases and cash dividends.
                     </p>
                     <div className="flex gap-2">
                        <span className="inline-flex items-center px-2 py-1 rounded bg-muted text-xs border border-border text-muted-foreground"><FileText className="w-3 h-3 mr-1"/> NVDA FY24 10-K, p. 38</span>
                     </div>
                   </div>
                 </div>
               </div>
            </div>
          </div>
        </div>

        {/* Feature 2 */}
        <div className="grid lg:grid-cols-2 gap-16 items-center py-16 border-t border-border flex-row-reverse">
          <div className="order-2 lg:order-1 bg-muted/30 rounded-2xl p-6 md:p-8 border border-border">
            <div className="bg-card rounded-xl border border-border shadow-md p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-primary"/> Extraction Table</h3>
                <Button size="sm" variant="outline" className="h-8 text-xs">Export to Excel</Button>
              </div>
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="pb-3 font-medium">Metric</th>
                    <th className="pb-3 font-medium text-right">Q1 '24</th>
                    <th className="pb-3 font-medium text-right">Q2 '24</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  <tr>
                    <td className="py-3 font-medium">Revenue</td>
                    <td className="py-3 text-right">$26.0B</td>
                    <td className="py-3 text-right">$30.0B</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium">Gross Margin</td>
                    <td className="py-3 text-right">78.4%</td>
                    <td className="py-3 text-right">75.1%</td>
                  </tr>
                  <tr>
                    <td className="py-3 font-medium">OpEx</td>
                    <td className="py-3 text-right">$3.5B</td>
                    <td className="py-3 text-right">$3.9B</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary mb-6">
              <Workflow className="w-6 h-6" />
            </div>
            <h2 className="text-3xl font-display font-bold mb-4">Structured outputs, ready for your model.</h2>
            <p className="text-muted-foreground text-lg leading-relaxed mb-8">
              Don't just read answers—use them. Finsyt automatically extracts complex financial tables, normalizes data across different companies, and allows one-click export directly into your Excel models.
            </p>
            <Link href="/request-access">
              <Button className="gap-2">
                See it in action <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}