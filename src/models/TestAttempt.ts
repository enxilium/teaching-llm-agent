import mongoose from 'mongoose';

const TestAttemptSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  testType: {
    type: String,
    enum: ['pre', 'post', 'final'],
    required: true,
  },
  score: {
    type: Number,
    required: true,
  },
  completedAt: {
    type: Date,
    default: Date.now,
  },
  questions: [{
    questionId: Number,
    question: String,
    userAnswer: String,
    correctAnswer: String,
    isCorrect: Boolean,
    scratchboardContent: String,
    duration: Number,
  }],
  duration: Number,
  metadata: {
    submissionId: String,
    submittedAt: Date,
  },
  hitId: String,
  assignmentId: String,
  lessonType: String,
}, {
  timestamps: true,
});

const TestAttempt = mongoose.models.TestAttempt || mongoose.model('TestAttempt', TestAttemptSchema);

export default TestAttempt;
