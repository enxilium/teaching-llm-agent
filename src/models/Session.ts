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
  tempRecord: boolean;
  surveyData?: {
    confusionLevel?: string;
    testDifficulty?: string;
    perceivedCorrectness?: string;
    learningAmount?: string;
    feedback?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Define schemas
const MessageSchema = new Schema({
  id: { type: Number, required: true },
  sender: { type: String, required: true },
  agentId: { type: String, default: null },
  text: { type: String, required: true },
  timestamp: { type: Date, required: true, default: Date.now }
}, { _id: false });  // Prevent MongoDB from adding _id to each message

const SurveyDataSchema = new Schema({
  confusionLevel: { type: String },
  testDifficulty: { type: String },
  perceivedCorrectness: { type: String },
  learningAmount: { type: String },
  feedback: { type: String }
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
      required: true 
    },
    questionText: { 
      type: String, 
      required: true 
    },
    startTime: { 
      type: Date, 
      required: true 
    },
    endTime: { 
      type: Date, 
      required: true 
    },
    duration: { 
      type: Number,
      required: true 
    },
    finalAnswer: { 
      type: String, 
      required: true 
    },
    scratchboardContent: { 
      type: String, 
      required: true 
    },
    messages: {
      type: [MessageSchema],
      default: []
    },
    isCorrect: {
      type: Boolean,
      default: false
    },
    timeoutOccurred: { 
      type: Boolean, 
      default: false 
    },
    tempRecord: {
      type: Boolean,
      default: false, // Always false - all records are permanent
      index: true
    },
    surveyData: {
      type: SurveyDataSchema,
      default: null
    }
  },
  { timestamps: true }
);

// Create compound index for faster queries
SessionSchema.index({ userId: 1, tempRecord: 1 });

// Create model or get existing one
const Session = mongoose.models.Session || mongoose.model<SessionDocument>('Session', SessionSchema);

export default Session;