#!/bin/sh
# Start both OpenClaw gateway and Live Hub bridge

# Ensure gog (Google Calendar) works in all sessions (including voice)
export PATH="/data/workspace/bin:$HOME/.local/bin:$PATH"
export GOG_KEYRING_PASSWORD="openclaw"
export XDG_CONFIG_HOME=/data/config

# Run post-restart recovery (pip, garth, gog tokens)
if [ -f /data/workspace/scripts/post-restart.sh ]; then
  /bin/bash /data/workspace/scripts/post-restart.sh 2>&1 || true
fi

# Start the bridge in background
cd /data/workspace/openclaw-audiocodes-livehub
node src/server.js &

# Start OpenClaw gateway in foreground (keeps container alive)
cd /app
exec node dist/index.js gateway --allow-unconfigured --port 3000 --bind lan
