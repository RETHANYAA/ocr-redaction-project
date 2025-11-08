import mongoose from '../mongo.js';

const sessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      unique: true,
      required: true,
    },
    title: {
      type: String,
      default: 'New Conversation',
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

export default mongoose.model('Session', sessionSchema);

