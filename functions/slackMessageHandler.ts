import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}));

    // Slack URL verification challenge
    if (body.type === 'url_verification') {
      return Response.json({ challenge: body.challenge });
    }

    const event = body.data?.event;
    if (!event) {
      return Response.json({ ok: true });
    }

    const text = event.text || '';
    const channel = event.channel;
    const user = event.user;

    // Get Slack token from env
    const slackToken = Deno.env.get('SLACK_BOT_TOKEN') || '';

    // Post a reply back to the channel
    await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${slackToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: channel,
        text: `Hey <@${user}>! I got your message: "${text}". I'm Base44 Agent and I'm here to help! 🤖`,
        username: 'Base44 Agent',
        icon_emoji: ':robot_face:',
      }),
    });

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
