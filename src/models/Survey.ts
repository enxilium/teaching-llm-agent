import mongoose from 'mongoose';

const SurveySchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
  },
  confusionLevel: String,
  testDifficulty: String,
  perceivedCorrectness: String,
  learningAmount: String,
  feedback: String,
  age: String,
  gender: String,
  educationLevel: String,
  submittedAt: {
    type: Date,
    default: Date.now,
  },
  hitId: String,
  assignmentId: String,
  lessonType: String,
}, {
  timestamps: true,
});

const Survey = mongoose.models.Survey || mongoose.model('Survey', SurveySchema);

export default Survey;
