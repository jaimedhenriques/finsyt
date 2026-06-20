import React from "react";
import { Link } from "wouter";
import { ShieldCheck, Lock, CheckCircle2 } from "lucide-react";

export function Footer() {
  return (
    <footer className="bg-[#0F111F] text-white mt-20">
      {/* Trust Strip */}
      <div className="border-b border-white/10">
        <div className="max-w-7xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-white/60">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" />
            <span className="font-medium text-white">Bank-grade security</span>
          </div>
          <div className="flex flex-wrap justify-center gap-6">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4" /> AES-256 encryption at rest
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> SOC 2 Type 2 in progress
            </div>
            <Link href="/security" className="flex items-center gap-2 hover:text-white transition-colors">
              <CheckCircle2 className="w-4 h-4" /> Security &amp; Trust →
            </Link>
          </div>
        </div>
      </div>

      {/* Main Footer */}
      <div className="max-w-7xl mx-auto px-6 py-16 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 lg:gap-8">
        <div className="lg:col-span-2">
          <Link href="/" className="flex items-center gap-2 mb-6">
            <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white rounded-sm" />
            </div>
            <span className="font-display font-bold text-xl tracking-tight text-white">Finsyt</span>
          </Link>
          <p className="text-white/60 text-sm leading-relaxed max-w-sm mb-6">
            The AI-native financial intelligence platform for institutional investors.
            Query filings, transcripts, and internal documents in natural language.
          </p>
        </div>

        <div>
          <h3 className="font-semibold text-white mb-4 text-sm">Platform</h3>
          <ul className="flex flex-col gap-3">
            <li><Link href="/product" className="text-sm text-white/60 hover:text-white transition-colors">How it Works</Link></li>
            <li><Link href="/solutions" className="text-sm text-white/60 hover:text-white transition-colors">Solutions</Link></li>
            <li><Link href="/pricing" className="text-sm text-white/60 hover:text-white transition-colors">Pricing</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-white mb-4 text-sm">Company</h3>
          <ul className="flex flex-col gap-3">
            <li><Link href="/about" className="text-sm text-white/60 hover:text-white transition-colors">About Us</Link></li>
            <li><a href="mailto:hello@finsyt.com" className="text-sm text-white/60 hover:text-white transition-colors">Contact</a></li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-white mb-4 text-sm">Legal</h3>
          <ul className="flex flex-col gap-3">
            <li><Link href="/privacy" className="text-sm text-white/60 hover:text-white transition-colors">Privacy Policy</Link></li>
            <li><Link href="/terms" className="text-sm text-white/60 hover:text-white transition-colors">Terms of Service</Link></li>
            <li><Link href="/security" className="text-sm text-white/60 hover:text-white transition-colors">Security</Link></li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-white/50">© 2026 Finsyt. All rights reserved.</p>
      </div>
    </footer>
  );
}
