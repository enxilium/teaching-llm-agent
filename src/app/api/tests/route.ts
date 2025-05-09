import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import TestAttempt from '@/models/TestAttempt';
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
  userId: string;
  testType: string;
  score?: number;
  completedAt?: string | Date;
  questions?: Question[];
  submissionId?: string;
}

interface TestDocument {
  userId: string;
  testType: string;
  score: number;
  completedAt: Date;
  questions: Question[];
  metadata: {
    submissionId: string;
    submittedAt: Date;
  };
}

export async function POST(request: NextRequest) {
  console.log("⚡ TEST API ENDPOINT CALLED ⚡");
  
  try {
    await connectToDatabase();
    
    // Get raw request for debugging
    const rawBody = await request.text();
    console.log(`Raw test data received (${rawBody.length} bytes)`);
    
    // Parse data with explicit error handling
    let testData: TestData;
    try {
      testData = JSON.parse(rawBody);
      console.log(`Parsed test data: type=${testData.testType}, userId=${testData.userId}`);
      
      if (Array.isArray(testData.questions)) {
        console.log(`Test contains ${testData.questions.length} questions`);
        
        if (testData.questions.length > 0) {
          console.log(`Question fields in request:`, Object.keys(testData.questions[0]));
          
          // Explicitly check scratchboard content
          if (testData.questions[0].scratchboardContent !== undefined) {
            console.log(`Scratchboard content found in request! Length: ${testData.questions[0].scratchboardContent.length}`);
            console.log(`Sample: "${testData.questions[0].scratchboardContent.substring(0, 30)}..."`);
          } else {
            console.error("⚠️ NO scratchboardContent field in incoming request!");
          }
        }
      }
    } catch (jsonError: unknown) {
      console.error("Failed to parse test data JSON:", jsonError);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' }, 
        { status: 400 }
      );
    }
    
    // CRITICAL FIX: Create the test document with a direct object literal
    // instead of using the Mongoose model constructor which might be dropping the field
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
    
    // Create test document by passing a plain JavaScript object
    const testDocument: TestDocument = {
      userId: testData.userId,
      testType: testData.testType,
      score: testData.score || 0,
      completedAt: testData.completedAt ? new Date(testData.completedAt) : new Date(),
      questions: questionsData,
      metadata: {
        submissionId: testData.submissionId || Date.now().toString(),
        submittedAt: new Date()
      }
    };
    
    // Debug the pre-save document's plain structure
    if (questionsData.length > 0) {
      console.log("Pre-save question data (direct object):", Object.keys(questionsData[0]));
      console.log("Has scratchboardContent in direct object:", questionsData[0].hasOwnProperty('scratchboardContent'));
      console.log("Content value:", questionsData[0].scratchboardContent);
    }
    
    // Now create the Mongoose document
    const newTest = new TestAttempt(testDocument);
    
    // Debug the document structure right before saving
    if (newTest.questions.length > 0) {
      // Instead of checking newTest.questions[0] directly, get its _doc property
      const questionDoc = newTest.questions[0].toObject ? 
        newTest.questions[0].toObject() : 
        newTest.questions[0];
      
      console.log("Mongoose document question fields:", Object.keys(questionDoc));
      console.log("Mongoose has scratchboardContent:", questionDoc.hasOwnProperty('scratchboardContent'));
    }
    
    // Save with explicit error handling
    try {
      const savedTest = await newTest.save();
      console.log(`Test saved to database with ID: ${savedTest._id}`);
      
      // Verify the saved document has the scratchboard content
      if (savedTest.questions && savedTest.questions.length > 0) {
        const savedQuestion = savedTest.questions[0];
        console.log("SAVED document question fields:", 
          Object.keys(savedQuestion._doc || savedQuestion));
        console.log("SAVED has scratchboardContent:", 
          (savedQuestion._doc || savedQuestion).hasOwnProperty('scratchboardContent'));
      }
      
      return NextResponse.json({ success: true });
    } catch (dbError: unknown) {
      console.error("MongoDB save error:", dbError);
      if (dbError instanceof mongoose.Error) {
        throw dbError;
      }
      throw new Error('Unknown database error');
    }
  } catch (error: unknown) {
    console.error('Error in test submission:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage }, 
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const testType = searchParams.get('testType');
    
    const query: { userId?: string; testType?: string } = {};
    if (userId && testType) {
      query.userId = userId;
      query.testType = testType;
    } else if (userId) {
      query.userId = userId;
    }
    
    const tests = await TestAttempt.find(query)
      .sort({ completedAt: -1 })
      .lean();
    
    return NextResponse.json({ success: true, data: tests });
  } catch (error: unknown) {
    console.error('Error fetching test data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}