import React from "react";
import { renderToString } from "react-dom/server";
import { Router, Switch, Route } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import Home from "@/pages/Home";
import Product from "@/pages/Product";
import Solutions from "@/pages/Solutions";
import Pricing from "@/pages/Pricing";
import About from "@/pages/About";
import RequestAccess from "@/pages/RequestAccess";
import Security from "@/pages/Security";

export { ROUTE_META } from "@/lib/routeMeta";

export function render(url: string): string {
  const queryClient = new QueryClient();

  return renderToString(
    <QueryClientProvider client={queryClient}>
      <Router ssrPath={url}>
        <div className="flex flex-col min-h-screen">
          <Navbar />
          <div className="flex-1">
            <Switch>
              <Route path="/" component={Home} />
              <Route path="/product" component={Product} />
              <Route path="/solutions" component={Solutions} />
              <Route path="/pricing" component={Pricing} />
              <Route path="/about" component={About} />
              <Route path="/request-access" component={RequestAccess} />
              <Route path="/security" component={Security} />
            </Switch>
          </div>
          <Footer />
        </div>
      </Router>
    </QueryClientProvider>,
  );
}
