import { useEffect } from "react";
import { useLocation } from "wouter";
import { getRouteMeta } from "./routeMeta";

function setOrCreateMeta(selector: string, attrs: Record<string, string>) {
  let el = document.head.querySelector(selector) as
    | HTMLMetaElement
    | HTMLLinkElement
    | null;
  if (!el) {
    const tagName = selector.startsWith("link") ? "link" : "meta";
    el = document.createElement(tagName) as HTMLMetaElement | HTMLLinkElement;
    document.head.appendChild(el);
  }
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, v);
  }
}

export function usePageMeta() {
  const [location] = useLocation();

  useEffect(() => {
    const meta = getRouteMeta(location);

    document.title = meta.title;

    setOrCreateMeta('meta[name="description"]', {
      name: "description",
      content: meta.description,
    });
    setOrCreateMeta('meta[property="og:title"]', {
      property: "og:title",
      content: meta.ogTitle,
    });
    setOrCreateMeta('meta[property="og:description"]', {
      property: "og:description",
      content: meta.ogDescription,
    });
    setOrCreateMeta('meta[property="og:type"]', {
      property: "og:type",
      content: "website",
    });
    setOrCreateMeta('link[rel="canonical"]', {
      rel: "canonical",
      href: meta.canonical,
    });
  }, [location]);
}
