/**
 * OpenClaw <-> AudioCodes Live Hub Bridge
 * 
 * Implements the AudioCodes Bot API (HTTP mode) to connect
 * Live Hub voice calls to an OpenClaw agent.
 * 
 * Docs: https://techdocs.audiocodes.com/voice-ai-connect/Content/Bot-API/ac-bot-api-mode-http.htm
 */

import Fastify from 'fastify';

// Configuration from environment
const config = {
  port: parseInt(process.env.PORT || '3100'),
  host: process.env.HOST || '0.0.0.0',
  
  // Token for authenticating Live Hub requests
  botToken: process.env.BOT_TOKEN || 'change-me-in-production',
  
  // OpenClaw gateway URL for sending messages
  openclawUrl: process.env.OPENCLAW_URL || 'http://localhost:3000',
  openclawToken: process.env.OPENCLAW_TOKEN || '',
  
  // Session configuration
  agentId: process.env.AGENT_ID || 'main',
};

// In-memory conversation store
// In production, use Redis or similar for multi-instance support
const conversations = new Map();

const app = Fastify({ logger: true });

// ============================================
// Authentication middleware
// ============================================

function validateToken(request, reply) {
  const authHeader = request.headers.authorization;
  
  if (!authHeader) {
    reply.code(401).send({ error: 'Missing Authorization header' });
    return false;
  }
  
  // Support both "Bearer <token>" and just "<token>"
  const token = authHeader.startsWith('Bearer ') 
    ? authHeader.slice(7) 
    : authHeader;
  
  if (token !== config.botToken) {
    reply.code(401).send({ error: 'Invalid token' });
    return false;
  }
  
  return true;
}

// ============================================
// Health Check - GET /webhook
// ============================================

app.get('/webhook', async (request, reply) => {
  return {
    type: 'ac-bot-api',
    success: true
  };
});

// ============================================
// Create Conversation - POST /webhook
// ============================================

app.post('/webhook', async (request, reply) => {
  if (!validateToken(request, reply)) return;
  
  const { conversation, bot, capabilities } = request.body;
  
  app.log.info({ conversation, bot }, 'Creating new conversation');
  
  // Store conversation state
  conversations.set(conversation, {
    id: conversation,
    bot: bot,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    messageHistory: [],
  });
  
  // Return URLs for this conversation
  return {
    activitiesURL: `/conversation/${conversation}/activities`,
    refreshURL: `/conversation/${conversation}/refresh`,
    disconnectURL: `/conversation/${conversation}/disconnect`,
    expiresSeconds: 120,
  };
});

// ============================================
// Send/Receive Activities - POST /conversation/:id/activities
// ============================================

app.post('/conversation/:id/activities', async (request, reply) => {
  if (!validateToken(request, reply)) return;
  
  const { id } = request.params;
  const { activities } = request.body;
  
  const conv = conversations.get(id);
  if (!conv) {
    return reply.code(404).send({ error: 'Conversation not found' });
  }
  
  conv.lastActivity = Date.now();
  
  const responseActivities = [];
  
  for (const activity of activities || []) {
    app.log.info({ conversationId: id, activity }, 'Received activity');
    
    // Store in history
    conv.messageHistory.push({ role: 'user', activity });
    
    // Handle different activity types
    if (activity.type === 'event' && activity.name === 'start') {
      // Call started - send greeting
      const greeting = await getGreeting(conv, activity);
      responseActivities.push(createActivity('message', greeting));
      
    } else if (activity.type === 'message' && activity.text) {
      // User said something - get response from OpenClaw
      const response = await getOpenClawResponse(conv, activity.text);
      responseActivities.push(createActivity('message', response));
    }
  }
  
  // Store bot responses
  for (const act of responseActivities) {
    conv.messageHistory.push({ role: 'assistant', activity: act });
  }
  
  return { activities: responseActivities };
});

// ============================================
// Refresh Conversation - POST /conversation/:id/refresh
// ============================================

app.post('/conversation/:id/refresh', async (request, reply) => {
  if (!validateToken(request, reply)) return;
  
  const { id } = request.params;
  const conv = conversations.get(id);
  
  if (!conv) {
    return reply.code(404).send({ error: 'Conversation not found' });
  }
  
  conv.lastActivity = Date.now();
  
  return { expiresSeconds: 120 };
});

// ============================================
// End Conversation - POST /conversation/:id/disconnect
// ============================================

app.post('/conversation/:id/disconnect', async (request, reply) => {
  if (!validateToken(request, reply)) return;
  
  const { id } = request.params;
  const { reason, reasonCode } = request.body;
  
  const conv = conversations.get(id);
  if (!conv) {
    return reply.code(404).send({ error: 'Conversation not found' });
  }
  
  app.log.info({ conversationId: id, reason, reasonCode }, 'Conversation ended');
  
  // Clean up
  conversations.delete(id);
  
  return {};
});

// ============================================
// Helper: Create activity response
// ============================================

function createActivity(type, text, extras = {}) {
  return {
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
    type,
    text,
    ...extras,
  };
}

// ============================================
// Helper: Get greeting message
// ============================================

async function getGreeting(conversation, startActivity) {
  const caller = startActivity.parameters?.caller || 'unknown';
  
  // For now, a simple greeting
  // TODO: Could check if caller is known and personalize
  return `Hey! This is Rex. How can I help you?`;
}

// ============================================
// Helper: Get response from OpenClaw
// ============================================

async function getOpenClawResponse(conversation, userText) {
  try {
    // Option 1: Use OpenClaw's HTTP API if available
    // Option 2: Use a dedicated session for voice calls
    // For now, we'll implement a simple HTTP call to OpenClaw gateway
    
    const response = await fetch(`${config.openclawUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.openclawToken && { 'Authorization': `Bearer ${config.openclawToken}` }),
      },
      body: JSON.stringify({
        message: userText,
        sessionId: `voice-${conversation.id}`,
        agentId: config.agentId,
      }),
    });
    
    if (!response.ok) {
      app.log.error({ status: response.status }, 'OpenClaw request failed');
      return "Sorry, I'm having trouble thinking right now. Can you try again?";
    }
    
    const data = await response.json();
    return data.response || data.message || data.text || "I'm not sure what to say.";
    
  } catch (error) {
    app.log.error({ error: error.message }, 'Error calling OpenClaw');
    
    // Fallback: simple echo for testing
    return `I heard you say: "${userText}". OpenClaw integration is not configured yet.`;
  }
}

// ============================================
// Cleanup old conversations periodically
// ============================================

setInterval(() => {
  const now = Date.now();
  const timeout = 5 * 60 * 1000; // 5 minutes
  
  for (const [id, conv] of conversations) {
    if (now - conv.lastActivity > timeout) {
      app.log.info({ conversationId: id }, 'Cleaning up stale conversation');
      conversations.delete(id);
    }
  }
}, 60 * 1000);

// ============================================
// Start server
// ============================================

async function start() {
  try {
    await app.listen({ port: config.port, host: config.host });
    console.log(`
╔═══════════════════════════════════════════════════════════╗
║  OpenClaw <-> AudioCodes Live Hub Bridge                  ║
╠═══════════════════════════════════════════════════════════╣
║  Server running on: http://${config.host}:${config.port}              ║
║  Webhook URL:       /webhook                              ║
║                                                           ║
║  Configure in Live Hub:                                   ║
║  - Bot URL: https://your-domain/webhook                   ║
║  - Token:   (set BOT_TOKEN env var)                       ║
╚═══════════════════════════════════════════════════════════╝
    `);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

start();
