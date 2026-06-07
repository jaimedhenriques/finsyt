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
            <li><Link href="#" className="text-sm text-white/60 hover:text-white transition-colors">Careers</Link></li>
            <li><Link href="#" className="text-sm text-white/60 hover:text-white transition-colors">Blog</Link></li>
            <li><Link href="#" className="text-sm text-white/60 hover:text-white transition-colors">Contact</Link></li>
          </ul>
        </div>

        <div>
          <h3 className="font-semibold text-white mb-4 text-sm">Legal</h3>
          <ul className="flex flex-col gap-3">
            <li><Link href="#" className="text-sm text-white/60 hover:text-white transition-colors">Privacy Policy</Link></li>
            <li><Link href="#" className="text-sm text-white/60 hover:text-white transition-colors">Terms of Service</Link></li>
            <li><Link href="/security" className="text-sm text-white/60 hover:text-white transition-colors">Security</Link></li>
          </ul>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-white/50">© 2026 Finsyt. All rights reserved.</p>
        <div className="flex gap-4">
          <a href="#" className="text-white/50 hover:text-white transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
            </svg>
          </a>
          <a href="#" className="text-white/50 hover:text-white transition-colors">
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
              <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
            </svg>
          </a>
        </div>
      </div>
    </footer>
  );
}
