import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    const event = body.data?.event;
    if (!event) {
      return Response.json({ ok: true });
    }

    const text = event.text || '';
    const channel = event.channel;
    const user = event.user;

    // Get slackbot token via Base44 connector
    const tokenRes = await base44.integrations.getToken('slackbot');
    const slackToken = tokenRes.access_token;

    // Post a reply back to the DM channel
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channel,
        text: `Hey <@${user}>! You said: "${text}" — I'm Base44 Agent, here to help! 🤖`,
        username: 'Base44 Agent',
        icon_emoji: ':robot_face:',
      }),
    });

    const result = await res.json();
    console.log('Slack response:', JSON.stringify(result));

    return Response.json({ ok: true });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
