import type { KnownBlock } from "@slack/web-api";

const POINTS = ["1", "2", "3", "5", "8", "13", "21", "?"];

export function votingBlocks(messageTs: string, ticket: string, voteCount: number): KnownBlock[] {
  return [
    {
      type: "section",
      block_id: `estimate_${messageTs}`,
      text: { type: "mrkdwn", text: `*Estimating:* ${ticket}` },
    },
    {
      type: "actions",
      block_id: `votes_${messageTs}`,
      elements: POINTS.map((p) => ({
        type: "button" as const,
        text: { type: "plain_text" as const, text: p },
        action_id: `vote_${p === "?" ? "question" : p}`,
        value: messageTs,
      })),
    },
    {
      type: "context",
      elements: [{ type: "mrkdwn", text: `_${voteCount} voted — results hidden until revealed_` }],
    },
    {
      type: "actions",
      block_id: `control_${messageTs}`,
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "Reveal" },
          action_id: "reveal",
          value: messageTs,
          style: "primary",
        },
      ],
    },
  ];
}

export function revealedBlocks(
  ticket: string,
  votes: Map<string, string>,
  userNames: Map<string, string>
): KnownBlock[] {
  const lines = [...votes.entries()]
    .map(([uid, val]) => `• ${userNames.get(uid) ?? uid}  →  *${val}*`)
    .join("\n");

  const values = [...votes.values()].filter((v) => v !== "?").map(Number);
  const avg = values.length ? (values.reduce((a, b) => a + b, 0) / values.length).toFixed(1) : "—";

  return [
    {
      type: "section",
      text: { type: "mrkdwn", text: `*Estimating:* ${ticket}` },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: lines.length ? lines : "_No votes were cast._",
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
