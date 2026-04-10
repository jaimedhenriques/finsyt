'use client';

import Script from 'next/script';

/**
 * AssistLoop AI Support Widget
 *
 * Embeds the AssistLoop customer support agent configured via:
 * NEXT_PUBLIC_ASSISTLOOP_AGENT_ID in Vercel environment
 */
export function AssistLoopWidget() {
  const agentId = process.env.NEXT_PUBLIC_ASSISTLOOP_AGENT_ID;

  if (!agentId) {
    return null;
  }

  return (
    <>
      {/* AssistLoop Widget Script */}
      <Script
        id="assistloop-widget"
        strategy="lazyOnload"
        src={`https://widget.assistloop.ai/widget.js`}
        data-agent-id={agentId}
      />

      {/* Alternative: Inline configuration if needed */}
      <Script
        id="assistloop-config"
        strategy="lazyOnload"
        dangerouslySetInnerHTML={{
          __html: `
            window.AssistLoopConfig = {
              agentId: "${agentId}",
              position: "bottom-right",
              theme: "auto"
            };
          `,
        }}
      />
    </>
  );
}

export default AssistLoopWidget;
