"use client";

import Script from "next/script";

type AssistLoopWindow = Window & {
  AssistLoopWidget?: {
    init: (config: { agentId: string }) => void;
  };
};

const agentId = process.env.NEXT_PUBLIC_ASSISTLOOP_AGENT_ID;

export function AssistLoopWidget() {
  if (!agentId) {
    return null;
  }

  return (
    <Script
      id="assistloop-widget"
      src="https://assistloop.ai/assistloop-widget.js"
      strategy="afterInteractive"
      onLoad={() => {
        (window as AssistLoopWindow).AssistLoopWidget?.init({ agentId });
      }}
    />
  );
}
