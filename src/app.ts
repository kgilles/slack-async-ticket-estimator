import { App } from "@slack/bolt";
import { createSession, getSession, deleteSession } from "./sessions.js";
import { votingBlocks, revealedBlocks } from "./blocks.js";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

app.command("/estimate", async ({ command, ack, respond, client }) => {
  await ack();

  const ticket = command.text.trim();
  if (!ticket) {
    await respond({ response_type: "ephemeral", text: "Usage: `/estimate <ticket title or URL>`" });
    return;
  }

  const result = await client.chat.postMessage({
    channel: command.channel_id,
    blocks: votingBlocks("placeholder", ticket, 0),
    text: `Estimating: ${ticket}`,
  });

  const messageTs = result.ts!;
  createSession({
    messageTs,
    channelId: command.channel_id,
    hostUserId: command.user_id,
    ticket,
  });

  // Re-post with real ts so block values carry the session key
  await client.chat.update({
    channel: command.channel_id,
    ts: messageTs,
    blocks: votingBlocks(messageTs, ticket, 0),
    text: `Estimating: ${ticket}`,
  });
});

const VOTE_VALUES: Record<string, string> = {
  vote_1: "1", vote_2: "2", vote_3: "3", vote_5: "5",
  vote_8: "8", vote_13: "13", vote_21: "21", vote_question: "?",
};

for (const [actionId, pointValue] of Object.entries(VOTE_VALUES)) {
  app.action(actionId, async ({ action, body, ack, client }) => {
    await ack();

    const messageTs = (action as { value?: string }).value!;
    const session = getSession(messageTs);
    if (!session || session.revealed) return;

    session.votes.set(body.user.id, pointValue);

    await client.chat.update({
      channel: session.channelId,
      ts: messageTs,
      blocks: votingBlocks(messageTs, session.ticket, session.votes.size),
      text: `Estimating: ${session.ticket}`,
    });
  });
}

app.action("reveal", async ({ action, body, ack, client }) => {
  await ack();

  const messageTs = (action as { value?: string }).value!;
  const session = getSession(messageTs);
  if (!session || session.revealed) return;

  if (body.user.id !== session.hostUserId) {
    await client.chat.postEphemeral({
      channel: session.channelId,
      user: body.user.id,
      text: "Only the person who started this session can reveal the votes.",
    });
    return;
  }

  // Resolve display names
  const userNames = new Map<string, string>();
  await Promise.all(
    [...session.votes.keys()].map(async (uid) => {
      try {
        const info = await client.users.info({ user: uid });
        userNames.set(uid, info.user?.profile?.display_name || info.user?.real_name || uid);
      } catch {
        userNames.set(uid, uid);
      }
    })
  );

  session.revealed = true;

  await client.chat.update({
    channel: session.channelId,
    ts: messageTs,
    blocks: revealedBlocks(session.ticket, session.votes, userNames),
    text: `Estimation complete: ${session.ticket}`,
  });

  deleteSession(messageTs);
});

(async () => {
  const port = Number(process.env.PORT) || 3000;
  await app.start(port);
  console.log(`lazy-finch running on port ${port}`);
})();
