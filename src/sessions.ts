export interface Session {
  messageTs: string;
  channelId: string;
  hostUserId: string;
  ticket: string;
  allowedVoters: string[];       // empty = unrestricted
  votes: Map<string, string>;    // userId → point value
  discussLive: Set<string>;      // userIds who want to discuss live
  revealed: boolean;
}

const sessions = new Map<string, Session>();

export function createSession(data: Omit<Session, "votes" | "discussLive" | "revealed">): Session {
  const session: Session = { ...data, votes: new Map(), discussLive: new Set(), revealed: false };
  sessions.set(data.messageTs, session);
  return session;
}

export function getSession(messageTs: string): Session | undefined {
  return sessions.get(messageTs);
}

export function deleteSession(messageTs: string): void {
  sessions.delete(messageTs);
}
