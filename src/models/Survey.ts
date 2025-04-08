import mongoose, { Schema, Document } from 'mongoose';

// Define interfaces
export interface SurveyDocument extends Document {
  userId: string;
  section: string;
  data: {
    confusionLevel?: string;
    testDifficulty?: string;
    perceivedCorrectness?: string;
    learningAmount?: string;
    feedback?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

// Define schema
const SurveySchema = new Schema(
  {
    userId: { 
      type: String, 
      required: true,
      index: true 
    },
    section: { 
      type: String, 
      required: true,
      index: true
    },
    data: {
      confusionLevel: { type: String },
      testDifficulty: { type: String },
      perceivedCorrectness: { type: String },
      learningAmount: { type: String },
      feedback: { type: String }
    }
  },
  { 
    timestamps: true 
  }
);

// Create indexes for common queries
SurveySchema.index({ userId: 1, section: 1 });
SurveySchema.index({ createdAt: -1 });

// Create model or get existing one
const Survey = mongoose.models.Survey || mongoose.model<SurveyDocument>('Survey', SurveySchema);

export default Survey;