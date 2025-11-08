import mongoose from '../mongo.js';

const messageSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      index: true,
      required: true,
    },
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'system'],
      default: 'text',
    },
    content: {
      type: String,
      required: true,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

messageSchema.index({ sessionId: 1, createdAt: 1 });

export default mongoose.model('Message', messageSchema);

