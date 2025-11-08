import { v4 as uuidv4 } from 'uuid';
import Session from '../models/Session.js';
import Message from '../models/Message.js';
import { runChatCompletion } from '../services/openaiClient.js';
import { processImageForPII } from '../services/ocrService.js';

export async function listSessions(_req, res, next) {
  try {
    const sessions = await Session.find().sort({ updatedAt: -1 }).lean();
    res.json({ sessions });
  } catch (error) {
    next(error);
  }
}

export async function createSession(req, res, next) {
  try {
    const sessionId = uuidv4();
    const session = await Session.create({
      sessionId,
      title: req.body?.title || 'New Conversation',
    });
    res.status(201).json({ session });
  } catch (error) {
    next(error);
  }
}

export async function listMessages(req, res, next) {
  try {
    const { sessionId } = req.params;
    const messages = await Message.find({ sessionId }).sort({ createdAt: 1 }).lean();
    res.json({ messages });
  } catch (error) {
    next(error);
  }
}

export async function postTextMessage(req, res, next) {
  try {
    const { sessionId } = req.params;
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message text is required' });
    }

    const userMessage = await Message.create({
      sessionId,
      role: 'user',
      type: 'text',
      content: message,
    });

    await Session.updateOne(
      { sessionId },
      {
        $set: { updatedAt: new Date() },
        $setOnInsert: { sessionId, title: req.body?.title || 'New Conversation' },
      },
      { upsert: true }
    );

    const aiReply = await runChatCompletion(sessionId, message);

    const assistantMessage = await Message.create({
      sessionId,
      role: 'assistant',
      type: 'text',
      content: aiReply.content,
    });

    res.status(201).json({
      userMessage,
      assistantMessage,
      metadata: aiReply.metadata,
    });
  } catch (error) {
    next(error);
  }
}

export async function uploadImage(req, res, next) {
  try {
    const { sessionId } = req.params;
    if (!req.file) {
      return res.status(400).json({ error: 'Image file is required' });
    }

    const result = await processImageForPII(req.file);

    const metadata = {
      detections: result.detections,
      text: result.extractedText,
    };

    const message = await Message.create({
      sessionId,
      role: 'user',
      type: 'image',
      content: req.file.originalname,
      metadata,
    });

    await Session.updateOne(
      { sessionId },
      {
        $set: { updatedAt: new Date() },
        $setOnInsert: { sessionId, title: 'New Conversation' },
      },
      { upsert: true }
    );

    res.status(201).json({
      message,
      previewImage: result.previewImage,
      redactedImage: result.redactedImage,
      detections: result.detections,
    });
  } catch (error) {
    next(error);
  }
}

export async function confirmRedaction(req, res, next) {
  try {
    const { sessionId } = req.params;
    const { redactedImage, detections } = req.body || {};

    if (!redactedImage) {
      return res.status(400).json({ error: 'Redacted image payload missing' });
    }

    await Message.create({
      sessionId,
      role: 'assistant',
      type: 'system',
      content: 'Redacted image confirmed',
      metadata: { detectionsCount: detections?.length ?? 0 },
    });

    // Placeholder hook for forwarding to OpenAI vision endpoint if required.

    res.json({ status: 'ok' });
  } catch (error) {
    next(error);
  }
}

