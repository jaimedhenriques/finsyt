import React, { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Menu, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: "Product", href: "/product" },
    { name: "Solutions", href: "/solutions" },
    { name: "Excel", href: "/excel" },
    { name: "Developers", href: "/developers" },
    { name: "Demo", href: "/demo" },
    { name: "Pricing", href: "/pricing" },
    { name: "Trust", href: "/security" },
    { name: "About", href: "/about" },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 border-b ${
        isScrolled
          ? "bg-background/80 backdrop-blur-md border-border py-3"
          : "bg-transparent border-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-primary flex items-center justify-center">
            <div className="w-4 h-4 border-2 border-white rounded-sm" />
          </div>
          <span className="font-display font-bold text-xl tracking-tight">Finsyt</span>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          <div className="flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                className={`text-sm font-medium transition-colors hover:text-primary ${
                  location === link.href ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {link.name}
              </Link>
            ))}
          </div>
          <div className="flex items-center gap-4 border-l pl-6 border-border">
            <a href="/platform/sign-in" className="text-sm font-medium text-foreground hover:text-primary transition-colors">
              Sign in
            </a>
            <a href="/platform/sign-up">
              <Button size="sm" variant="outline" className="border-foreground/15 hover:bg-secondary">
                Start Free Trial
              </Button>
            </a>
            <Link href="/request-access">
              <Button size="sm" className="gap-2">
                Request Access <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </nav>

        {/* Mobile Menu Toggle */}
        <button
          className="md:hidden p-2 -mr-2 text-foreground"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile Menu Overlay */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 top-[60px] bg-background border-t border-border p-6 flex flex-col h-[calc(100vh-60px)]">
          <nav className="flex flex-col gap-6 text-lg font-medium mt-8">
            {navLinks.map((link) => (
              <Link
                key={link.name}
                href={link.href}
                onClick={() => setMobileMenuOpen(false)}
                className={`transition-colors ${
                  location === link.href ? "text-primary" : "text-foreground hover:text-primary"
                }`}
              >
                {link.name}
              </Link>
            ))}
          </nav>
          <div className="mt-auto flex flex-col gap-4 pb-8">
            <a href="/platform/sign-in" onClick={() => setMobileMenuOpen(false)} className="block">
              <Button variant="outline" className="w-full justify-center">
                Sign in
              </Button>
            </a>
            <a href="/platform/sign-up" onClick={() => setMobileMenuOpen(false)} className="block">
              <Button variant="outline" className="w-full justify-center border-primary/30 text-primary">
                Start Free Trial
              </Button>
            </a>
            <Link href="/request-access" onClick={() => setMobileMenuOpen(false)}>
              <Button className="w-full justify-center gap-2">
                Request Access <ArrowRight className="w-4 h-4" />
              </Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}