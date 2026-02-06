# OpenClaw ↔ AudioCodes Live Hub Bridge

Voice interface for OpenClaw agents via AudioCodes Live Hub.

```
Phone Call → Live Hub → STT → This Bridge → OpenClaw → Response → TTS → Caller hears Rex 🦖
```

## What is this?

This is a webhook server that implements the [AudioCodes Bot API](https://techdocs.audiocodes.com/voice-ai-connect/Content/Bot-API/ac-bot-api-mode-http.htm), allowing Live Hub to connect voice calls to an OpenClaw agent.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

```bash
export BOT_TOKEN="your-secret-token"        # Token Live Hub uses to authenticate
export OPENCLAW_URL="http://localhost:3000" # Your OpenClaw gateway
export OPENCLAW_TOKEN=""                     # Optional: OpenClaw auth token
export PORT=3100                             # Port to listen on
```

### 3. Run the server

```bash
npm start
```

### 4. Configure Live Hub

In AudioCodes Live Hub self-service:

1. Go to **Bot Connections** → **Add Bot**
2. Select **AudioCodes Bot API** as the framework
3. Enter your webhook URL: `https://your-domain.fly.dev/webhook`
4. Enter the same token you set in `BOT_TOKEN`
5. Save and assign a phone number

### 5. Call your bot!

Dial the assigned number and talk to your OpenClaw agent.

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | 3100 | Port to listen on |
| `HOST` | No | 0.0.0.0 | Host to bind to |
| `BOT_TOKEN` | Yes | - | Token for authenticating Live Hub requests |
| `OPENCLAW_URL` | Yes | - | URL of your OpenClaw gateway |
| `OPENCLAW_TOKEN` | No | - | Auth token for OpenClaw API |
| `AGENT_ID` | No | main | OpenClaw agent ID to use |

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook` | GET | Health check |
| `/webhook` | POST | Create conversation |
| `/conversation/:id/activities` | POST | Send/receive messages |
| `/conversation/:id/refresh` | POST | Keep conversation alive |
| `/conversation/:id/disconnect` | POST | End conversation |

## Deployment

### Fly.io

```bash
fly launch
fly secrets set BOT_TOKEN=your-secret-token
fly secrets set OPENCLAW_URL=https://your-openclaw-gateway
fly deploy
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│   Caller    │────▶│  Live Hub    │────▶│ This Bridge │────▶│ OpenClaw │
│   (Phone)   │◀────│  (STT/TTS)   │◀────│  (Webhook)  │◀────│  (Agent) │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────┘
     Voice              Text                  Text               Text
```

## License

MIT
