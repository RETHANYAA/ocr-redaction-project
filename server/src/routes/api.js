import { Router } from 'express';
import multer from 'multer';
import {
  listSessions,
  createSession,
  listMessages,
  postTextMessage,
  uploadImage,
  confirmRedaction,
} from '../controllers/chatController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Unsupported file type. Use JPG, PNG, GIF, or WebP.'));
  },
});

const router = Router();

router.get('/sessions', listSessions);
router.post('/sessions', createSession);

router.get('/sessions/:sessionId/messages', listMessages);
router.post('/sessions/:sessionId/messages/text', postTextMessage);
router.post('/sessions/:sessionId/messages/image', upload.single('image'), uploadImage);
router.post('/sessions/:sessionId/messages/image/confirm', confirmRedaction);

export default router;

