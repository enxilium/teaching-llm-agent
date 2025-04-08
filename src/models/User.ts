import mongoose, { Schema, Document } from 'mongoose';

export interface UserDocument extends Document {
  userId: string;
  flowStage: string;
  lessonType?: string;
  lessonQuestionIndex?: number;
  tempRecord: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema(
  {
    userId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    flowStage: {
      type: String,
      enum: ['terms', 'pre-test', 'lesson', 'tetris-break', 'post-test', 'final-test', 'completed'],
      default: 'terms'
    },
    lessonType: {
      type: String,
      enum: ['group', 'multi', 'single', 'solo', null],
      default: null
    },
    lessonQuestionIndex: {
      type: Number,
      default: 0
    },
    tempRecord: {
      type: Boolean,
      default: false, // Always false - all records are permanent
      index: true
    }
  }
);

// Create model or get existing one
const User = mongoose.models.User || mongoose.model<UserDocument>('User', UserSchema);

export default User;