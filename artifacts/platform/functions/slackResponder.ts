import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // The Slack event is under body.data.event
    const event = body.data?.event;
    if (!event || !event.text) {
      return Response.json({ ok: true });
    }

    // Avoid responding to bot messages (prevent loops)
    if (event.bot_id || event.subtype === 'bot_message') {
      return Response.json({ ok: true });
    }

    const channel = event.channel;
    const user = event.user;
    const text = event.text;

    // Send reply using the SDK's connector integration
    const result = await base44.integrations.slack('POST', 'chat.postMessage', {
      channel: channel,
      text: `<@${user}> got your message: "${text}" 👋 I'm Base44 Agent — fully connected now!`,
      username: 'Base44 Agent',
      icon_emoji: ':robot_face:',
    });

    console.log('Slack post result:', JSON.stringify(result));
    return Response.json({ ok: true });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
