import type { KnownBlock, View } from "@slack/web-api";

const POINTS_ROW1 = ["1", "2", "3", "5"];
const POINTS_ROW2 = ["8", "13", "21", "?"];

function makeVoteButton(p: string, messageTs: string) {
  return {
    type: "button" as const,
    text: { type: "plain_text" as const, text: p },
    action_id: `vote_${p === "?" ? "question" : p}`,
    value: messageTs,
  };
}

export function estimateModal(channelId: string, ticketPrefill = ""): View {
  return {
    type: "modal",
    callback_id: "estimate_modal",
    private_metadata: channelId,
    title: { type: "plain_text", text: "New Estimation" },
    submit: { type: "plain_text", text: "Start" },
    close: { type: "plain_text", text: "Cancel" },
    blocks: [
      {
        type: "input",
        block_id: "ticket",
        label: { type: "plain_text", text: "Ticket" },
        element: {
          type: "plain_text_input",
          action_id: "ticket_input",
          placeholder: { type: "plain_text", text: "Title or URL" },
          ...(ticketPrefill ? { initial_value: ticketPrefill } : {}),
        },
      },
      {
        type: "input",
        block_id: "voters",
        label: { type: "plain_text", text: "Who's voting?" },
        element: {
          type: "multi_users_select",
          action_id: "voters_input",
          placeholder: { type: "plain_text", text: "Select team members" },
        },
      },
    ],
  };
}

export function votingBlocks(
  messageTs: string,
  ticket: string,
  voteCount: number,
  discussCount: number,
  totalVoters: number
): KnownBlock[] {
  const voted = `*${voteCount}* of *${totalVoters}* voted`;
  const discuss =
    discussCount > 0
      ? ` · *${discussCount}* want${discussCount === 1 ? "s" : ""} to discuss live`
      : "";

  return [
    {
      type: "section",
      block_id: `estimate_${messageTs}`,
      text: {
        type: "mrkdwn",
        text: `*Estimating:* ${ticket}\n_${voted}${discuss} — results hidden until revealed_`,
      },
    },
    {
      type: "actions",
      block_id: `votes_row1_${messageTs}`,
      elements: POINTS_ROW1.map((p) => makeVoteButton(p, messageTs)),
    },
    {
      type: "actions",
      block_id: `votes_row2_${messageTs}`,
      elements: POINTS_ROW2.map((p) => makeVoteButton(p, messageTs)),
    },
    {
      type: "actions",
      block_id: `control_${messageTs}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Discuss Live" },
          action_id: "discuss_live",
          value: messageTs,
        },
        {
          type: "button",
          text: { type: "plain_text", text: "Reveal Votes" },
          action_id: "reveal",
          value: messageTs,
          style: "primary" as const,
        },
      ],
    },
  ];
}

export function revealedBlocks(
  ticket: string,
  votes: Map<string, string>,
  userNames: Map<string, string>,
  discussLive: Set<string>
): KnownBlock[] {
  const voteLines = [...votes.entries()]
    .map(([uid, val]) => `• ${userNames.get(uid) ?? uid}  →  *${val}*`)
    .join("\n");

  const values = [...votes.values()].filter((v) => v !== "?").map(Number);
  const avg = values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : "—";

  const discussLine =
    discussLive.size > 0
      ? `\n\n:speech_balloon: *Wants to discuss live:* ${[...discussLive]
          .map((uid) => userNames.get(uid) ?? uid)
          .join(", ")}`
      : "";

  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Estimating:* ${ticket}` },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: (voteLines || "_No votes were cast._") + discussLine,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `_${votes.size} vote${votes.size !== 1 ? "s" : ""} · average (excl. ?): ${avg}_`,
        },
      ],
    },
  ];
}
