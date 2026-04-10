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

    // Get slackbot token
    const tokenRes = await base44.integrations.getToken('slackbot');
    const slackToken = tokenRes.access_token;

    // Send reply
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channel,
        text: `<@${user}> got your message: "${text}" 👋 I'm Base44 Agent — fully connected now!`,
        username: 'Base44 Agent',
        icon_emoji: ':robot_face:',
      }),
    });

    const result = await res.json();
    console.log('Slack post result:', JSON.stringify(result));

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
