#!/bin/sh
# Start both OpenClaw gateway and Live Hub bridge

# Start the bridge in background
cd /data/workspace/openclaw-audiocodes-livehub
node src/server.js &

# Start OpenClaw gateway in foreground (keeps container alive)
cd /app
exec node dist/index.js gateway --allow-unconfigured --port 3000 --bind lan
