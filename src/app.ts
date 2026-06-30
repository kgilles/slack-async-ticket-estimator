import "dotenv/config";
import { App } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { createSession, getSession, deleteSession, type Session } from "./sessions.js";
import { estimateModal, votingBlocks, revealedBlocks } from "./blocks.js";

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
});

// ── Helpers ────────────────────────────────────────────────────────────────

function allVotersResponded(session: Session): boolean {
  return session.allowedVoters.every(
    (uid) => session.votes.has(uid) || session.discussLive.has(uid)
  );
}

async function doReveal(session: Session, client: WebClient) {
  const allUserIds = new Set([...session.votes.keys(), ...session.discussLive]);
  const userNames = new Map<string, string>();
  await Promise.all(
    [...allUserIds].map(async (uid) => {
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
    ts: session.messageTs,
    blocks: revealedBlocks(session.ticket, session.votes, userNames, session.discussLive),
    text: `Estimation complete: ${session.ticket}`,
  });

  deleteSession(session.messageTs);
}

// ── /estimate → open modal ─────────────────────────────────────────────────

app.command("/estimate", async ({ command, ack, client }) => {
  await ack();
  await client.views.open({
    trigger_id: command.trigger_id,
    view: estimateModal(command.channel_id, command.text.trim()),
  });
});

// ── Modal submission → create session + post message ──────────────────────

app.view("estimate_modal", async ({ view, ack, body, client }) => {
  await ack();

  const ticket = view.state.values.ticket.ticket_input.value!;
  const allowedVoters = view.state.values.voters.voters_input.selected_users ?? [];
  const channelId = view.private_metadata;

  const result = await client.chat.postMessage({
    channel: channelId,
    blocks: votingBlocks("placeholder", ticket, 0, 0, allowedVoters.length),
    text: `Estimating: ${ticket}`,
  });

  const messageTs = result.ts!;
  createSession({ messageTs, channelId, hostUserId: body.user.id, ticket, allowedVoters });

  await Promise.all([
    client.chat.update({
      channel: channelId,
      ts: messageTs,
      blocks: votingBlocks(messageTs, ticket, 0, 0, allowedVoters.length),
      text: `Estimating: ${ticket}`,
    }),
    client.chat.postMessage({
      channel: channelId,
      thread_ts: messageTs,
      text: "Use this thread to discuss the ticket.",
    }),
  ]);
});

// ── Vote ───────────────────────────────────────────────────────────────────

app.action(/^vote_/, async ({ action, body, ack, client }) => {
  await ack();

  const act = action as { action_id: string; value?: string };
  const raw = act.action_id.replace(/^vote_/, "");
  const pointValue = raw === "question" ? "?" : raw;
  const messageTs = act.value!;

  const session = getSession(messageTs);
  if (!session || session.revealed) return;

  const userId = body.user.id;

  if (session.allowedVoters.length && !session.allowedVoters.includes(userId)) {
    await client.chat.postEphemeral({
      channel: session.channelId,
      user: userId,
      text: "You're not a voter in this estimation session.",
    });
    return;
  }

  const wasDiscussing = session.discussLive.delete(userId);
  session.votes.set(userId, pointValue);

  await Promise.all([
    client.chat.update({
      channel: session.channelId,
      ts: messageTs,
      blocks: votingBlocks(messageTs, session.ticket, session.votes.size, session.discussLive.size, session.allowedVoters.length),
      text: `Estimating: ${session.ticket}`,
    }),
    client.chat.postEphemeral({
      channel: session.channelId,
      user: userId,
      text: wasDiscussing
        ? `You voted *${pointValue}*. Your discuss live flag was removed.`
        : `You voted *${pointValue}*.`,
    }),
  ]);

  if (allVotersResponded(session)) await doReveal(session, client);
});

// ── Discuss Live ───────────────────────────────────────────────────────────

app.action("discuss_live", async ({ action, body, ack, client }) => {
  await ack();

  const messageTs = (action as { value?: string }).value!;
  const session = getSession(messageTs);
  if (!session || session.revealed) return;

  const userId = body.user.id;

  if (session.allowedVoters.length && !session.allowedVoters.includes(userId)) {
    await client.chat.postEphemeral({
      channel: session.channelId,
      user: userId,
      text: "You're not a voter in this estimation session.",
    });
    return;
  }

  if (session.discussLive.has(userId)) {
    await client.chat.postEphemeral({
      channel: session.channelId,
      user: userId,
      text: "You've already flagged this for live discussion.",
    });
    return;
  }

  const hadVote = session.votes.delete(userId);
  session.discussLive.add(userId);

  await Promise.all([
    client.chat.update({
      channel: session.channelId,
      ts: messageTs,
      blocks: votingBlocks(messageTs, session.ticket, session.votes.size, session.discussLive.size, session.allowedVoters.length),
      text: `Estimating: ${session.ticket}`,
    }),
    client.chat.postEphemeral({
      channel: session.channelId,
      user: userId,
      text: hadVote
        ? "You flagged this for live discussion. Your vote was removed."
        : "You flagged this for live discussion.",
    }),
  ]);

  if (allVotersResponded(session)) await doReveal(session, client);
});

// ── Manual reveal ──────────────────────────────────────────────────────────

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

  await doReveal(session, client);
});

// ── Start ──────────────────────────────────────────────────────────────────

(async () => {
  const port = Number(process.env.PORT) || 3000;
  await app.start(port);
  console.log(`slack-async-ticket-estimator running on port ${port}`);
})();
