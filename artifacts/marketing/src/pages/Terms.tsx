import React from "react";
import { motion } from "framer-motion";

export default function Terms() {
  return (
    <main className="min-h-screen bg-background pt-32 pb-24 px-6">
      <div className="max-w-3xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6 border border-primary/20">
            Legal
          </div>
          <h1 className="text-4xl md:text-5xl font-display font-bold mb-4 leading-tight">
            Terms of Service
          </h1>
          <p className="text-muted-foreground">Last updated: June 2026</p>
        </motion.div>

        <div className="prose prose-lg dark:prose-invert prose-headings:font-display prose-p:text-muted-foreground prose-p:leading-relaxed prose-li:text-muted-foreground max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold mb-4">1. Acceptance of Terms</h2>
            <p>
              By accessing or using Finsyt ("the Service"), you agree to be bound by these Terms of Service ("Terms"). If you are using Finsyt on behalf of an organization, you represent that you have the authority to bind that organization to these Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">2. Description of Service</h2>
            <p>
              Finsyt is an AI-native financial intelligence platform designed for institutional investors. The Service provides tools for querying SEC filings, earnings transcripts, broker research, and other financial documents using natural language; generating AI-assisted research summaries; and managing collaborative research workspaces.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">3. Accounts and Access</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>You must provide accurate and complete registration information.</li>
              <li>You are responsible for maintaining the confidentiality of your credentials and for all activity under your account.</li>
              <li>Accounts are provisioned per organization. Sharing credentials between organizations is prohibited.</li>
              <li>We reserve the right to suspend or terminate accounts that violate these Terms.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">4. Acceptable Use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Use the Service for any unlawful purpose or in violation of applicable securities laws or regulations.</li>
              <li>Attempt to reverse-engineer, decompile, or extract proprietary algorithms or models.</li>
              <li>Resell, sublicense, or redistribute access to the Service without written authorization.</li>
              <li>Use automated means to scrape or extract data in excess of normal platform usage.</li>
              <li>Introduce malicious code or attempt to disrupt platform availability.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">5. AI-Generated Content</h2>
            <p>
              Finsyt uses large language models to generate summaries, answers, and analysis. AI-generated content is provided for informational purposes only and does not constitute investment advice, legal advice, or financial recommendations. You are solely responsible for any investment decisions made in reliance on information provided through the Service. Always verify material information against primary sources.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">6. Intellectual Property</h2>
            <p>
              Finsyt and its licensors own all right, title, and interest in the platform, including its software, models, and proprietary data aggregation methods. You retain ownership of documents and data you upload. By uploading content, you grant Finsyt a limited license to process it solely for the purpose of providing the Service to you.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">7. Subscription and Payment</h2>
            <p>
              Access to Finsyt is provided on a subscription basis. Fees are as described on our <a href="/pricing" className="text-primary hover:underline">Pricing</a> page. Subscriptions auto-renew unless cancelled prior to the renewal date. All fees are non-refundable except as required by law or as otherwise agreed in writing.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">8. Limitation of Liability</h2>
            <p>
              To the maximum extent permitted by law, Finsyt shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of profits, data, or business opportunities, arising out of or related to your use of the Service. Our total aggregate liability shall not exceed the fees paid by you in the twelve months preceding the claim.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">9. Modifications</h2>
            <p>
              We reserve the right to modify these Terms at any time. We will provide reasonable notice of material changes. Continued use of the Service after changes take effect constitutes acceptance of the revised Terms.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">10. Governing Law</h2>
            <p>
              These Terms are governed by the laws of the State of Delaware, without regard to its conflict of law provisions. Any disputes shall be resolved exclusively in the state or federal courts located in Delaware.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">11. Contact</h2>
            <p>
              Questions regarding these Terms may be directed to <a href="mailto:legal@finsyt.com" className="text-primary hover:underline">legal@finsyt.com</a>.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
