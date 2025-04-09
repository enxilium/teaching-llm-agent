import mongoose, { Schema, Document } from 'mongoose';

export interface TestAttemptDocument extends Document {
  userId: string;
  testType: 'pre' | 'post' | 'final';
  questions: {
    questionId: number | string;
    question: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    scratchboardContent?: string;
    duration: number;
  }[];
  score: number;
  completedAt: Date;
  duration: number;
  metadata?: {
    submissionId?: string;
    submittedAt?: Date;
  };
  createdAt: Date;
  updatedAt: Date;
}

const QuestionSchema = new Schema({
  questionId: { 
    type: Schema.Types.Mixed
  },
  question: { 
    type: String,
    default: ''
  },
  userAnswer: { 
    type: String,
    required: true,
    default: 'No answer provided' // Add default value to satisfy requirement
  },
  correctAnswer: { 
    type: String,
    default: ''
  },
  isCorrect: { 
    type: Boolean,
    default: false
  },
  scratchboardContent: { 
    type: String
  },
  duration: {
    type: Number
  }
});

const TestAttemptSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true 
  },
  testType: { 
    type: String, 
    enum: ['pre', 'post', 'final'], 
    required: true 
  },
  questions: [QuestionSchema],
  score: { 
    type: Number, 
    default: 0
  },
  completedAt: { 
    type: Date, 
    default: Date.now 
  },
  duration: {
    type: Number
  },
  metadata: {
    submissionId: { 
      type: String 
    },
    submittedAt: { 
      type: Date, 
      default: Date.now 
    }
  }
});

// Create compound index for user and test type
TestAttemptSchema.index({ userId: 1, testType: 1 });

// Create model or get existing one
const TestAttempt = mongoose.models.TestAttempt || 
  mongoose.model<TestAttemptDocument>('TestAttempt', TestAttemptSchema);

export default TestAttempt;