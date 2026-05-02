import React from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="text-center max-w-md">
        <div className="text-primary font-display font-bold text-8xl mb-4">404</div>
        <h1 className="text-2xl font-bold mb-4 text-foreground">Data not found</h1>
        <p className="text-muted-foreground mb-8">
          The terminal page you are looking for has been moved, deleted, or does not exist.
        </p>
        <Link href="/">
          <Button>Return to Platform</Button>
        </Link>
      </div>
    </main>
  );
}
