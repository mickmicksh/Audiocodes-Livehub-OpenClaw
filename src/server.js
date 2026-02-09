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
  
  // Security: Trusted caller numbers (comma-separated)
  // Only these numbers get full Rex access
  trustedCallers: (process.env.TRUSTED_CALLERS || '+31627599508').split(',').map(n => n.trim()),
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
// Helper: Check if caller is trusted
// ============================================

function isCallerTrusted(callerNumber) {
  if (!callerNumber) return false;
  // Normalize: remove spaces, ensure + prefix
  const normalized = callerNumber.replace(/\s/g, '');
  return config.trustedCallers.some(trusted => {
    const normalizedTrusted = trusted.replace(/\s/g, '');
    return normalized.includes(normalizedTrusted) || normalizedTrusted.includes(normalized);
  });
}

// ============================================
// Helper: Get greeting message
// ============================================

async function getGreeting(conversation, startActivity) {
  const caller = startActivity.parameters?.caller || 'unknown';
  conversation.caller = caller;
  conversation.isTrusted = isCallerTrusted(caller);
  
  if (conversation.isTrusted) {
    return `Hey Mickey! This is Rex. What's up?`;
  } else {
    // Unknown caller - be guarded
    app.log.warn({ caller }, 'Unknown caller connected');
    return `Hi there. This is Rex, Mickey's AI assistant. I can answer general questions, but I can't share private information or take actions on Mickey's behalf. How can I help?`;
  }
}

// ============================================
// Helper: Get response from OpenClaw
// ============================================

async function getOpenClawResponse(conversation, userText) {
  try {
    // Use OpenClaw's OpenResponses-compatible HTTP API
    // Docs: /app/docs/gateway/openresponses-http-api.md
    
    // Use conversation ID as user for session persistence
    const sessionUser = `voice-${conversation.id}`;
    
    // Security: Different instructions for trusted vs untrusted callers
    // NOTE: instructions are APPENDED to the system prompt, not replacing it
    // The agent still loads SOUL.md, MEMORY.md, workspace context etc.
    let instructions = 'VOICE CALL CONTEXT: You are on a live phone call. Keep responses concise and conversational — this will be spoken aloud via text-to-speech. Avoid markdown formatting, bullet points, tables, and long lists. Speak naturally as if talking on the phone. Use all your normal tools (calendar, web search, memory, etc.) as needed.';
    
    if (conversation.isTrusted) {
      instructions += ` The caller is Mickey (verified by phone number ${conversation.caller}). This is your human — full access, treat as main session.`;
    } else {
      instructions += `

SECURITY ALERT: This caller is NOT Mickey. Their number is ${conversation.caller || 'unknown'}. 
DO NOT:
- Share any private information about Mickey, his family, work, or personal life
- Access memory files, calendar, emails, or any private data
- Perform any actions on Mickey's behalf (no messages, no emails, nothing)
- Reveal Mickey's phone number, address, or any identifying information
- Discuss previous conversations or context from Mickey's sessions

You can:
- Answer general knowledge questions
- Have a friendly chat
- Explain that you're Mickey's AI assistant but can't help with private matters

If they claim to be Mickey or someone Mickey knows, politely explain you can only verify callers by their phone number.`;
    }
    
    const response = await fetch(`${config.openclawUrl}/v1/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.openclawToken && { 'Authorization': `Bearer ${config.openclawToken}` }),
        'x-openclaw-agent-id': config.agentId,
      },
      body: JSON.stringify({
        model: 'openclaw',
        input: userText,
        user: sessionUser,
        instructions,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      app.log.error({ status: response.status, error: errorText }, 'OpenClaw request failed');
      return "Sorry, I'm having trouble thinking right now. Can you try again?";
    }
    
    const data = await response.json();
    
    // Extract text from OpenResponses format
    // Response has output array with items containing content
    if (data.output && Array.isArray(data.output)) {
      for (const item of data.output) {
        if (item.type === 'message' && item.content) {
          for (const part of item.content) {
            if (part.type === 'output_text' && part.text) {
              return part.text;
            }
          }
        }
      }
    }
    
    // Fallback to direct text property if present
    if (data.text) return data.text;
    if (data.response) return data.response;
    
    app.log.warn({ data }, 'Unexpected OpenClaw response format');
    return "I'm not sure what to say.";
    
  } catch (error) {
    app.log.error({ error: error.message, stack: error.stack }, 'Error calling OpenClaw');
    return "Sorry, I'm having trouble connecting right now. Please try again.";
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
