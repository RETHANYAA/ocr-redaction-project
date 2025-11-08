import OpenAI from 'openai';
import Message from '../models/Message.js';

let openaiClient = null;

if (process.env.OPENAI_API_KEY) {
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

export async function runChatCompletion(sessionId, userMessage) {
  // For this prototype, always reply with a default message.
  // Keeping history fetch in place for future extension.
  await Message.find({ sessionId }).sort({ createdAt: 1 }).limit(1).lean();

  // Force a static reply as requested
  return {
    content: 'heloo users',
    metadata: { provider: 'static' },
  };
}

