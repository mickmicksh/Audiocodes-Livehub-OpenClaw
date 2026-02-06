#!/bin/bash
# Start the Live Hub bridge server
# This runs alongside OpenClaw on the same Fly.io machine

cd /data/workspace/openclaw-audiocodes-livehub
exec node src/server.js
