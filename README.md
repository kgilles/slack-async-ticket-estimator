# lazy-finch

Async Fibonacci story point estimation for Slack. One command starts a session; team votes privately with buttons; host reveals results when ready.

**Scale:** 1, 2, 3, 5, 8, 13, 21, ?

## Usage

```
/estimate Fix auth bug — users can't log in on mobile
```

A message appears with voting buttons. Anyone in the channel can vote. Votes stay hidden until the session creator clicks **Reveal**.

## Setup

### 1. Create a Slack App

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From scratch**
2. Under **OAuth & Permissions**, add these scopes:
   - `chat:write`
   - `commands`
   - `users:read`
3. Under **Slash Commands**, add `/estimate` with the Request URL:
   ```
   https://<your-host>/slack/events
   ```
4. Under **Interactivity & Shortcuts**, enable interactivity and set the Request URL to the same endpoint.
5. Install the app to your workspace and copy the **Bot User OAuth Token**.
6. Copy the **Signing Secret** from **Basic Information**.

### 2. Configure Environment

```bash
cp .env.example .env
# fill in SLACK_BOT_TOKEN and SLACK_SIGNING_SECRET
```

### 3. Run

```bash
npm install
npm run dev        # development (hot reload via tsx)
npm run build && npm start   # production
```

For local development, expose port 3000 with [ngrok](https://ngrok.com):

```bash
ngrok http 3000
```

Use the ngrok HTTPS URL as your Slack Request URLs.

## Deploy to Railway

1. Push this repo to GitHub
2. New project → **Deploy from GitHub repo**
3. Add environment variables: `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`
4. Railway auto-detects `npm start` as the start command
5. Update your Slack app's Request URLs to the Railway domain

## Architecture

| File | Purpose |
|------|---------|
| `src/app.ts` | Bolt app, `/estimate` command, action handlers |
| `src/sessions.ts` | In-memory session store |
| `src/blocks.ts` | Block Kit message builders |

State is in-memory — active sessions are lost on restart, which is acceptable for short-lived estimation sessions.
