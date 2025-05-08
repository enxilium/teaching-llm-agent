import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Survey from '@/models/Survey';
import TestAttempt from '@/models/TestAttempt';
import Session from '@/models/Session';
import mongoose from 'mongoose';
import { saveDataToFirebase } from '@/lib/firebase';
import { saveExperimentData } from '@/lib/storage-service';

interface Question {
  questionId: number;
  question?: string;
  userAnswer?: string;
  correctAnswer?: string;
  isCorrect?: boolean;
  scratchboardContent?: string;
  duration?: number;
}

interface TestData {
  testType: string;
  score?: number;
  completedAt?: string | Date;
  questions?: Question[];
  submissionId?: string;
  duration?: number;
}

interface SessionData {
  questionId: number;
  questionText?: string;
  startTime?: string | Date;
  endTime?: string | Date;
  duration?: number;
  finalAnswer?: string;
  scratchboardContent?: string;
  messages?: any[];
  isCorrect?: boolean;
  timeoutOccurred?: boolean;
  hitId?: string;
}

interface CompleteData {
  userId: string;
  surveyData?: any;
  testData?: TestData[];
  questionResponses?: Question[];
  sessionData?: SessionData[];
  lessonType?: string;
  hitId?: string;
  completedAt?: string | Date;
  messages?: any[];
}

interface SubmissionResults {
  surveyId: string | null;
  testIds: string[];
  sessionIds: string[];
  success: boolean;
}

export async function POST(request: NextRequest) {
  try {
    console.log("🔍 /api/submit endpoint called - handling complete data submission");
    await connectToDatabase();
    
    // Get raw request body first for debugging
    let rawBody: string;
    try {
      rawBody = await request.text();
      console.log(`Raw data received: ${rawBody.length} bytes`);
    } catch (jsonError: unknown) {
      console.error("❌ Failed to read raw request:", jsonError);
      return NextResponse.json(
        { success: false, error: 'Failed to read request body' },
        { status: 400 }
      );
    }
    
    // Parse the request body with enhanced error handling
    let completeData: CompleteData;
    try {
      completeData = JSON.parse(rawBody);
      console.log("📊 Complete data keys:", Object.keys(completeData));
    } catch (jsonError: unknown) {
      console.error("❌ Failed to parse JSON:", jsonError);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
    // Validate required fields
    if (!completeData.userId) {
      console.error("❌ Missing required userId field");
      return NextResponse.json(
        { success: false, error: 'Missing required field: userId' },
        { status: 400 }
      );
    }
    
    console.log(`Starting failsafe submission for user: ${completeData.userId}`);
    
    // Use our storage service to save to both databases
    try {
      const results = await saveExperimentData(completeData);
      
      // Return successful response with detailed results
      return NextResponse.json({
        success: true,
        message: 'Data saved successfully',
        results
      });
    } catch (storageError) {
      console.error('Storage service error:', storageError);
      
      // Last-ditch effort: Try direct Firebase save
      console.log('Attempting emergency direct Firebase save...');
      const firebaseResult = await saveDataToFirebase({
        ...completeData,
        _emergency: true,
        _timestamp: new Date().toISOString()
      });
      
      if (firebaseResult.success) {
        return NextResponse.json({
          success: true,
          message: 'Data saved via emergency Firebase backup',
          results: { firebase: firebaseResult }
        });
      }
      
      // If we get here, all save attempts have failed
      return NextResponse.json({
        error: 'All storage methods failed',
        details: storageError instanceof Error ? storageError.message : String(storageError)
      }, { status: 500 });
    }
  } catch (error: unknown) {
    console.error('❌ Error in complete data submission:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to save data',
        details: errorMessage
      },
      { status: 500 }
    );
  }
} 