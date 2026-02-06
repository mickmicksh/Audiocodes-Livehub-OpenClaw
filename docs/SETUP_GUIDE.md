# OpenClaw ↔ AudioCodes Live Hub Setup Guide

Give your OpenClaw AI agent a phone number. People can call and talk to it.

## Overview

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│   Caller    │────▶│  Live Hub    │────▶│   Bridge    │────▶│ OpenClaw │
│   (Phone)   │◀────│  (STT/TTS)   │◀────│  (Webhook)  │◀────│  (Agent) │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────┘
     Voice              Text                  Text               Text
```

**Live Hub** handles:
- Phone number provisioning
- Speech-to-Text (STT)
- Text-to-Speech (TTS)
- Call management

**This Bridge** handles:
- AudioCodes Bot API protocol
- Connecting to your OpenClaw agent
- Caller verification (security)

**OpenClaw** handles:
- AI conversation
- Memory, tools, skills
- Your agent's personality

---

## Prerequisites

- OpenClaw instance running (with `/v1/responses` API enabled)
- AudioCodes Live Hub account ([sign up free](https://livehub.audiocodes.io))
- Fly.io account (for deployment) or your own server

---

## Step 1: Enable OpenClaw HTTP API

Add this to your OpenClaw config (`openclaw.json`):

```json
{
  "gateway": {
    "http": {
      "endpoints": {
        "responses": {
          "enabled": true
        }
      }
    }
  }
}
```

Restart OpenClaw. Test it works:

```bash
curl -X POST http://localhost:3000/v1/responses \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"model": "openclaw", "input": "Hello"}'
```

---

## Step 2: Deploy the Bridge

### Option A: Same machine as OpenClaw (recommended)

If running on Fly.io, update your `fly.toml`:

```toml
[processes]
app = "/bin/sh /data/workspace/openclaw-audiocodes-livehub/start-all.sh"

[[services]]
internal_port = 3100
protocol = "tcp"
processes = ["app"]

  [[services.ports]]
    port = 3100
    handlers = ["tls", "http"]
```

Set secrets:

```bash
fly secrets set BOT_TOKEN=<generate-a-random-token>
fly secrets set OPENCLAW_TOKEN=<your-openclaw-gateway-token>
fly secrets set TRUSTED_CALLERS=+31612345678,+31698765432
fly deploy
```

### Option B: Separate deployment

```bash
git clone https://github.com/mickmicksh/Audiocodes-Livehub-OpenClaw.git
cd Audiocodes-Livehub-OpenClaw
npm install

# Set environment variables
export BOT_TOKEN=your-secret-token
export OPENCLAW_URL=https://your-openclaw-instance
export OPENCLAW_TOKEN=your-openclaw-token
export TRUSTED_CALLERS=+31612345678

npm start
```

### Verify the bridge is running:

```bash
curl https://your-bridge-url/webhook
# Should return: {"type":"ac-bot-api","success":true}
```

---

## Step 3: Configure Live Hub

### 3.1 Create an account

Go to [livehub.audiocodes.io](https://livehub.audiocodes.io) and sign up.
You get $10 free credit to test.

### 3.2 Get a phone number

**Option A: Buy from Live Hub**
1. Go to **Voice Channels** → **Phone Numbers**
2. Select a country and purchase a number
3. Note the number for later

**Option B: Bring Your Own SIP Trunk**
1. Go to **Voice Channels** → **SIP Connections**
2. Add your SIP trunk (Twilio, sipgate, etc.)
3. Configure your numbers to route to Live Hub

### 3.3 Create the bot connection

1. Go to **Bot Connections** → **Add new voice bot connection**
2. Select **AudioCodes Bot API**
3. Fill in:

| Field | Value |
|-------|-------|
| Bot connection name | `Rex` (or your agent's name) |
| Bot connection URL | `https://your-bridge-url/webhook` |
| Token | Same token you set as `BOT_TOKEN` |
| Live Hub region | Choose closest to you |

4. Click **Validate bot configuration** — should pass ✅

### 3.4 Configure speech services

**Speech-to-Text (STT):**
- Microsoft Azure (good accuracy)
- Google V2 / Chirp 2 (very good)
- Deepgram Nova-3 (fast, good)

**Text-to-Speech (TTS):**
- ElevenLabs (most natural, premium)
- Deepgram Aura-2 (good, fast)
- Microsoft Azure (solid, many voices)
- Amazon Polly (affordable)

### 3.5 Create a routing rule

1. Go to **Routing Rules** → **Add Rule**
2. Set:
   - **Source**: Your phone number
   - **Destination**: Your bot connection (Rex)
3. Save

---

## Step 4: Test it!

Call the phone number. You should hear your AI agent respond!

---

## Security

### Trusted Callers

By default, the bridge treats unknown callers with caution:
- They get a limited greeting
- The AI won't share private information
- No actions can be taken on your behalf

Add trusted phone numbers:

```bash
fly secrets set TRUSTED_CALLERS="+31612345678,+31698765432" -a your-app
```

### Token Authentication

Live Hub authenticates to your bridge using the `BOT_TOKEN`. Keep it secret!

---

## Outbound Calling (Rex calls you)

### Enable in Live Hub

1. Go to **Settings** → **API Clients**
2. Create a new API client with dialout permissions
3. Note the Client ID and Client Secret

### Set the secrets

```bash
fly secrets set LIVEHUB_CLIENT_ID="your-client-id" -a your-app
fly secrets set LIVEHUB_CLIENT_SECRET="your-client-secret" -a your-app
```

### Trigger a call (API)

```bash
curl -X POST "https://livehub.audiocodes.io/api/v1/actions/dialout" \
  -H "Content-Type: application/json" \
  -u "CLIENT_ID:CLIENT_SECRET" \
  -d '{
    "bot": "Rex",
    "target": "tel:+31612345678",
    "caller": "+31YOUR_LIVEHUB_NUMBER"
  }'
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BOT_TOKEN` | Yes | Token for Live Hub → Bridge auth |
| `OPENCLAW_URL` | Yes | URL of your OpenClaw instance |
| `OPENCLAW_TOKEN` | Yes | OpenClaw gateway auth token |
| `TRUSTED_CALLERS` | No | Comma-separated trusted phone numbers |
| `PORT` | No | Bridge port (default: 3100) |
| `LIVEHUB_CLIENT_ID` | No | For outbound calling |
| `LIVEHUB_CLIENT_SECRET` | No | For outbound calling |

---

## Troubleshooting

### "Unauthorized" from OpenClaw
- Check `OPENCLAW_TOKEN` is correct
- Verify `/v1/responses` endpoint is enabled in OpenClaw config

### Live Hub validation fails
- Check bridge is publicly accessible
- Verify `BOT_TOKEN` matches in both places
- Check for HTTPS (Live Hub requires it)

### No audio / call drops
- Check Live Hub logs for errors
- Verify STT/TTS services are configured
- Check your Live Hub credit balance

### Bridge not starting
- Check logs: `fly logs -a your-app`
- Verify `node_modules` exist in workspace
- Check `start-all.sh` has execute permissions

---

## Pricing Notes

**Live Hub costs:**
- Phone numbers: ~$1-5/month depending on country
- Minutes: ~$0.01-0.05/minute depending on region
- STT/TTS: Varies by provider

**OpenClaw costs:**
- Your LLM API costs (OpenAI, Anthropic, etc.)

---

## Support

- Live Hub docs: [techdocs.audiocodes.com/livehub](https://techdocs.audiocodes.com/livehub)
- OpenClaw docs: [docs.openclaw.ai](https://docs.openclaw.ai)
- This repo: [github.com/mickmicksh/Audiocodes-Livehub-OpenClaw](https://github.com/mickmicksh/Audiocodes-Livehub-OpenClaw)
