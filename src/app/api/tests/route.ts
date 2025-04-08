import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import TestAttempt from '@/models/TestAttempt';

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const testData = await request.json();
    console.log(`Processing test data for user ${testData.userId}, type: ${testData.testType}`);
    
    // Basic validation
    if (!testData.userId || !testData.testType) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: userId or testType' },
        { status: 400 }
      );
    }
    
    // Ensure questions array exists
    if (!Array.isArray(testData.questions)) {
      console.warn("Questions is not an array, initializing empty array");
      testData.questions = [];
    }
    
    // CRITICAL FIX: Process and validate each question, ensuring userAnswer is NEVER empty
    const processedQuestions = testData.questions.map((q: any, index: number) => {
      // Default to "No answer provided" if userAnswer is empty, null, or undefined
      let userAnswer = q.userAnswer;
      if (!userAnswer || typeof userAnswer !== 'string' || userAnswer.trim() === '') {
        userAnswer = "No answer provided";
      }
      
      return {
        questionId: q.questionId || index,
        question: q.question || '',
        userAnswer: userAnswer, // Now guaranteed to be non-empty
        correctAnswer: q.correctAnswer || '',
        isCorrect: !!q.isCorrect
      };
    });
    
    console.log("Processed questions sample:", JSON.stringify(processedQuestions[0] || {}));
    
    // Create test document with explicit validation
    const testAttempt = new TestAttempt({
      userId: testData.userId,
      testType: testData.testType,
      questions: processedQuestions,
      score: typeof testData.score === 'number' ? testData.score : 0,
      completedAt: testData.completedAt ? new Date(testData.completedAt) : new Date()
    });
    
    // Save with explicit error handling
    try {
      await testAttempt.save();
      console.log(`Test saved with ID ${testAttempt._id}`);
    } catch (saveError) {
      console.error("Error saving test to MongoDB:", saveError);
      return NextResponse.json(
        { 
          success: false, 
          error: `Database error: ${saveError.message}`,
          details: saveError
        },
        { status: 500 }
      );
    }
    
    return NextResponse.json({ 
      success: true, 
      testId: testAttempt._id,
      message: `${testData.testType} test saved successfully` 
    });
    
  } catch (error) {
    console.error('Error saving test data:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to save test data', 
        details: error instanceof Error ? error.message : String(error)
      },
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
    
    let query = {};
    if (userId && testType) {
      query = { userId, testType };
    } else if (userId) {
      query = { userId };
    }
    
    const tests = await TestAttempt.find(query)
      .sort({ completedAt: -1 })
      .lean();
    
    return NextResponse.json({ success: true, data: tests });
  } catch (error) {
    console.error('Error fetching test data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch test data' },
      { status: 500 }
    );
  }
}