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
  }[];
  score: number;
  completedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const TestAttemptSchema = new mongoose.Schema({
  userId: { 
    type: String, 
    required: true 
  },
  testType: { 
    type: String, 
    required: true 
  },
  questions: [{
    questionId: { 
      type: mongoose.Schema.Types.Mixed,
      default: 0
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
    }
  }],
  score: { 
    type: Number, 
    default: 0
  },
  completedAt: { 
    type: Date, 
    default: Date.now 
  }
});

// Create compound index for user and test type
TestAttemptSchema.index({ userId: 1, testType: 1 });

// Create model or get existing one
const TestAttempt = mongoose.models.TestAttempt || 
  mongoose.model<TestAttemptDocument>('TestAttempt', TestAttemptSchema);

export default TestAttempt;