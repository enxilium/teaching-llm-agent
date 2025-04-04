import mongoose, { Schema, Document } from 'mongoose';

// Define interfaces
export interface SessionDocument extends Document {
  userId: string;
  questionId: number;
  questionText: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  finalAnswer: string;
  scratchboardContent: string;
  messages: {
    id: number;
    sender: string;
    agentId?: string;
    text: string;
    timestamp: Date;
  }[];
  isCorrect: boolean;
  timeoutOccurred: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// Define schemas
const MessageSchema = new Schema({
  id: { type: Number, required: true },
  sender: { type: String, required: true },
  agentId: { type: String, default: null },
  text: { type: String, required: true },
  timestamp: { type: Date, required: true }
});

const SessionSchema = new Schema(
  {
    userId: { 
      type: String, 
      required: true,
      index: true 
    },
    questionId: { 
      type: Number, 
      required: true,
      index: true 
    },
    questionText: { 
      type: String, 
      required: true 
    },
    startTime: { 
      type: Date, 
      default: Date.now 
    },
    endTime: { 
      type: Date, 
      default: Date.now 
    },
    duration: { 
      type: Number,
      default: 0 
    },
    finalAnswer: { 
      type: String, 
      default: '' 
    },
    scratchboardContent: { 
      type: String, 
      default: '' 
    },
    messages: [MessageSchema],
    isCorrect: {
      type: Boolean,
      default: null
    },
    timeoutOccurred: { 
      type: Boolean, 
      default: false 
    }
  },
  { 
    timestamps: true 
  }
);

// Create indexes for common queries
SessionSchema.index({ userId: 1, questionId: 1 });
SessionSchema.index({ createdAt: -1 });

// Create model or get existing one
const Session = mongoose.models.Session || mongoose.model<SessionDocument>('Session', SessionSchema);

export default Session;