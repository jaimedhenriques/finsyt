import React from "react";
import { motion } from "framer-motion";

export default function Privacy() {
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
            Privacy Policy
          </h1>
          <p className="text-muted-foreground">Last updated: June 2026</p>
        </motion.div>

        <div className="prose prose-lg dark:prose-invert prose-headings:font-display prose-p:text-muted-foreground prose-p:leading-relaxed prose-li:text-muted-foreground max-w-none space-y-8">
          <section>
            <h2 className="text-2xl font-bold mb-4">1. Introduction</h2>
            <p>
              Finsyt, Inc. ("Finsyt", "we", "our", or "us") is committed to protecting the privacy of our customers and users. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our platform and services.
            </p>
            <p>
              By accessing or using Finsyt, you agree to the practices described in this policy. If you do not agree, please discontinue use of our services.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">2. Information We Collect</h2>
            <p>We collect information in the following ways:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Account information</strong> — name, email address, organization name, and credentials when you register.</li>
              <li><strong>Usage data</strong> — queries submitted to the platform, documents uploaded, workspaces created, and features used.</li>
              <li><strong>Technical data</strong> — IP addresses, browser type, operating system, referring URLs, and session identifiers.</li>
              <li><strong>Communications</strong> — messages you send to our support or sales team.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">3. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Provide, operate, and improve the Finsyt platform.</li>
              <li>Authenticate users and enforce organizational access controls.</li>
              <li>Send transactional and product communications relevant to your account.</li>
              <li>Monitor platform performance, security, and compliance.</li>
              <li>Respond to support requests and inquiries.</li>
            </ul>
            <p>We do not sell your personal information to third parties.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">4. Data Security</h2>
            <p>
              We implement industry-standard security measures including AES-256 encryption at rest, TLS in transit, and role-based access controls. Our security posture is described in detail on our <a href="/security" className="text-primary hover:underline">Security &amp; Trust</a> page. We are pursuing SOC 2 Type 2 certification.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">5. Data Retention</h2>
            <p>
              We retain your data for as long as your account is active or as needed to provide our services. Upon account closure or a verified deletion request, we remove personal data within 30 days, except where retention is required by applicable law.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">6. Third-Party Services</h2>
            <p>
              Finsyt integrates with third-party data providers, AI services, and authentication systems. These providers are bound by their own privacy policies. We share only the minimum information necessary to operate each integration and do not authorize them to use your data for their own marketing purposes.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">7. Your Rights</h2>
            <p>
              Depending on your jurisdiction, you may have the right to access, correct, or delete the personal information we hold about you. To exercise these rights, contact us at <a href="mailto:privacy@finsyt.com" className="text-primary hover:underline">privacy@finsyt.com</a>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">8. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify registered users of material changes by email. Continued use of the platform after changes take effect constitutes your acceptance of the revised policy.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-4">9. Contact Us</h2>
            <p>
              For privacy-related questions or requests, please contact us at <a href="mailto:privacy@finsyt.com" className="text-primary hover:underline">privacy@finsyt.com</a> or write to Finsyt, Inc., attention Privacy Team.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
