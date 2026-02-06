# OpenClaw ↔ AudioCodes Live Hub Bridge

**Give your AI agent a phone number.** 📞🤖

This bridge connects [OpenClaw](https://openclaw.ai) agents to [AudioCodes Live Hub](https://livehub.audiocodes.io), enabling voice calls with your AI.

```
Phone Call → Live Hub (STT) → This Bridge → OpenClaw → Response → Live Hub (TTS) → Caller
```

## Features

- 🎙️ **Voice conversations** with your OpenClaw agent
- 🔐 **Caller verification** — trusted numbers get full access, others are limited
- 📞 **Inbound calls** — people call your AI
- 📤 **Outbound calls** — your AI calls people (coming soon)
- 🌍 **Multi-language** — use any STT/TTS language Live Hub supports

## Quick Start

1. **Deploy the bridge** alongside OpenClaw
2. **Configure Live Hub** with your webhook URL
3. **Get a phone number** from Live Hub
4. **Call your AI!**

📖 **[Full Setup Guide →](docs/SETUP_GUIDE.md)**

## Requirements

- OpenClaw instance with `/v1/responses` API enabled
- AudioCodes Live Hub account (free tier available)
- Public HTTPS endpoint for the webhook

## Environment Variables

```bash
BOT_TOKEN=secret-token-for-livehub      # Live Hub authenticates with this
OPENCLAW_URL=http://localhost:3000       # Your OpenClaw gateway
OPENCLAW_TOKEN=your-gateway-token        # OpenClaw auth
TRUSTED_CALLERS=+31612345678             # Comma-separated trusted numbers
```

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────┐
│   Caller    │────▶│  Live Hub    │────▶│   Bridge    │────▶│ OpenClaw │
│   (Phone)   │◀────│  (STT/TTS)   │◀────│  (Webhook)  │◀────│  (Agent) │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────┘
```

**Live Hub** handles voice (STT/TTS), phone numbers, SIP.
**Bridge** implements AudioCodes Bot API, connects to OpenClaw.
**OpenClaw** is your AI agent with memory, tools, personality.

## Security

Unknown callers are automatically restricted:
- No access to private information
- No actions on your behalf
- General chat only

Add trusted numbers via `TRUSTED_CALLERS` env var.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook` | GET | Health check |
| `/webhook` | POST | Create conversation |
| `/conversation/:id/activities` | POST | Exchange messages |
| `/conversation/:id/refresh` | POST | Keep alive |
| `/conversation/:id/disconnect` | POST | End call |

## License

MIT

## Credits

Built for the OpenClaw + AudioCodes Live Hub integration PoC.

- [OpenClaw](https://openclaw.ai) — AI agent framework
- [AudioCodes Live Hub](https://livehub.audiocodes.io) — Voice AI platform
