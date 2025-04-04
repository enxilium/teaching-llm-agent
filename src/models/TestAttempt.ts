import mongoose, { Schema, Document } from 'mongoose';

export interface TestAttemptDocument extends Document {
  userId: string;
  testType: 'pre' | 'post' | 'final';
  questions: {
    questionId: number;
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

const QuestionAttemptSchema = new Schema({
  questionId: {
    type: Number,
    required: true
  },
  question: {
    type: String,
    required: true
  },
  userAnswer: {
    type: String,
    required: true
  },
  correctAnswer: {
    type: String,
    required: true
  },
  isCorrect: {
    type: Boolean,
    required: true
  }
});

const TestAttemptSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      index: true
    },
    testType: {
      type: String,
      enum: ['pre', 'post', 'final'],
      required: true
    },
    questions: [QuestionAttemptSchema],
    score: {
      type: Number,
      required: true
    },
    completedAt: {
      type: Date,
      default: Date.now
    }
  },
  {
    timestamps: true
  }
);

// Create compound index for user and test type
TestAttemptSchema.index({ userId: 1, testType: 1 });

// Create model or get existing one
const TestAttempt = mongoose.models.TestAttempt || 
  mongoose.model<TestAttemptDocument>('TestAttempt', TestAttemptSchema);

export default TestAttempt;