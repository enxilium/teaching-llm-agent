import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Survey from '@/models/Survey';
import TestAttempt from '@/models/TestAttempt';
import Session from '@/models/Session';
import mongoose from 'mongoose';

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
    
    // Initialize results object
    const results: SubmissionResults = {
      surveyId: null,
      testIds: [],
      sessionIds: [],
      success: true
    };
    
    // Process survey data if present
    if (completeData.surveyData) {
      try {
        console.log("📝 Processing survey data");
        const survey = new Survey({
          userId: completeData.userId,
          section: 'final',
          data: completeData.surveyData,
          submittedAt: new Date()
        });
        
        const savedSurvey = await survey.save();
        console.log(`✅ Survey saved with ID: ${savedSurvey._id}`);
        results.surveyId = savedSurvey._id.toString();
      } catch (error: unknown) {
        console.error("❌ Error saving survey data:", error);
        results.success = false;
      }
    }
    
    // Process test data if present
    if (completeData.testData && Array.isArray(completeData.testData)) {
      try {
        console.log(`📝 Processing ${completeData.testData.length} test datasets`);
        
        for (const testData of completeData.testData) {
          // Prepare questions with proper structure
          const questionsData: Question[] = Array.isArray(testData.questions) 
            ? testData.questions.map(q => ({
                questionId: q.questionId,
                question: q.question || '',
                userAnswer: q.userAnswer || '',
                correctAnswer: q.correctAnswer || '',
                isCorrect: !!q.isCorrect,
                scratchboardContent: q.scratchboardContent || '',
                duration: q.duration
              })) 
            : [];
          
          // Create test document
          const testDocument = {
            userId: completeData.userId,
            testType: testData.testType,
            score: testData.score || 0,
            completedAt: testData.completedAt ? new Date(testData.completedAt) : new Date(),
            questions: questionsData,
            duration: testData.duration,
            metadata: {
              submissionId: testData.submissionId || Date.now().toString(),
              submittedAt: new Date()
            }
          };
          
          const newTest = new TestAttempt(testDocument);
          const savedTest = await newTest.save();
          console.log(`✅ Test saved with ID: ${savedTest._id}`);
          results.testIds.push(savedTest._id.toString());
        }
      } catch (error: unknown) {
        console.error("❌ Error saving test data:", error);
        results.success = false;
      }
    }
    
    // Process question responses if present
    if (completeData.questionResponses && Array.isArray(completeData.questionResponses)) {
      try {
        console.log(`📝 Processing ${completeData.questionResponses.length} question responses`);
        
        const testDocument = {
          userId: completeData.userId,
          testType: 'question-responses',
          questions: completeData.questionResponses,
          completedAt: completeData.completedAt ? new Date(completeData.completedAt) : new Date(),
          metadata: {
            submissionId: `qr-${Date.now().toString()}`,
            submittedAt: new Date()
          }
        };
        
        const newResponses = new TestAttempt(testDocument);
        const savedResponses = await newResponses.save();
        console.log(`✅ Question responses saved with ID: ${savedResponses._id}`);
        results.testIds.push(savedResponses._id.toString());
      } catch (error: unknown) {
        console.error("❌ Error saving question responses:", error);
        results.success = false;
      }
    }
    
    // Process session data if present
    if (completeData.sessionData && Array.isArray(completeData.sessionData)) {
      try {
        console.log(`📝 Processing ${completeData.sessionData.length} session datasets`);
        
        for (const sessionData of completeData.sessionData) {
          // Create session document
          const session = new Session({
            userId: completeData.userId,
            questionId: sessionData.questionId,
            questionText: sessionData.questionText || '',
            startTime: sessionData.startTime ? new Date(sessionData.startTime) : new Date(),
            endTime: sessionData.endTime ? new Date(sessionData.endTime) : new Date(),
            duration: sessionData.duration || 0,
            finalAnswer: sessionData.finalAnswer || '',
            scratchboardContent: sessionData.scratchboardContent || '',
            messages: sessionData.messages || [],
            isCorrect: !!sessionData.isCorrect,
            timeoutOccurred: !!sessionData.timeoutOccurred,
            lessonType: completeData.lessonType || null,
            hitId: sessionData.hitId || completeData.hitId || null,
            submittedAt: new Date()
          });
          
          const savedSession = await session.save();
          console.log(`✅ Session saved with ID: ${savedSession._id}`);
          results.sessionIds.push(savedSession._id.toString());
        }
      } catch (error: unknown) {
        console.error("❌ Error saving session data:", error);
        results.success = false;
      }
    }
    
    // Even if some parts failed, return a 200 with detailed results
    return NextResponse.json({
      success: results.success,
      submittedAt: new Date().toISOString(),
      userId: completeData.userId,
      results
    });
    
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