import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Survey from '@/models/Survey';
import TestAttempt from '@/models/TestAttempt';
import Session from '@/models/Session';

export async function POST(request: NextRequest) {
  try {
    console.log("🔍 /api/submit endpoint called - handling complete data submission");
    await connectToDatabase();
    
    // Get raw request body first for debugging
    let rawBody;
    try {
      rawBody = await request.text();
      console.log(`Raw data received: ${rawBody.length} bytes`);
    } catch (jsonError) {
      console.error("❌ Failed to read raw request:", jsonError);
      return NextResponse.json(
        { success: false, error: 'Failed to read request body' },
        { status: 400 }
      );
    }
    
    // Parse the request body with enhanced error handling
    let completeData;
    try {
      completeData = JSON.parse(rawBody);
      console.log("📊 Complete data keys:", Object.keys(completeData));
    } catch (jsonError) {
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
    const results = {
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
        results.surveyId = savedSurvey._id;
      } catch (error) {
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
          const questionsData = Array.isArray(testData.questions) 
            ? testData.questions.map(q => ({
                questionId: q.questionId,
                question: q.question || '',
                userAnswer: q.userAnswer || '',
                correctAnswer: q.correctAnswer || '',
                isCorrect: !!q.isCorrect,
                scratchboardContent: q.scratchboardContent || ''
              })) 
            : [];
          
          // Create test document
          const testDocument = {
            userId: completeData.userId,
            testType: testData.testType,
            score: testData.score || 0,
            completedAt: testData.completedAt || new Date(),
            questions: questionsData,
            metadata: {
              submissionId: testData.submissionId || Date.now().toString(),
              submittedAt: new Date()
            }
          };
          
          const newTest = new TestAttempt(testDocument);
          const savedTest = await newTest.save();
          console.log(`✅ Test saved with ID: ${savedTest._id}`);
          results.testIds.push(savedTest._id);
        }
      } catch (error) {
        console.error("❌ Error saving test data:", error);
        results.success = false;
      }
    }
    
    // Process question responses if present
    if (completeData.questionResponses && Array.isArray(completeData.questionResponses)) {
      try {
        console.log(`📝 Processing ${completeData.questionResponses.length} question responses`);
        // Store these in a similar way to test data if needed
        // In this implementation, we're assuming questionResponses are a simplified
        // version of test data, but you can modify this based on your schema
        
        const testDocument = {
          userId: completeData.userId,
          testType: 'question-responses',
          questions: completeData.questionResponses,
          completedAt: completeData.completedAt || new Date(),
          metadata: {
            submissionId: `qr-${Date.now().toString()}`,
            submittedAt: new Date()
          }
        };
        
        const newResponses = new TestAttempt(testDocument);
        const savedResponses = await newResponses.save();
        console.log(`✅ Question responses saved with ID: ${savedResponses._id}`);
        results.testIds.push(savedResponses._id);
      } catch (error) {
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
            startTime: sessionData.startTime || new Date(),
            endTime: sessionData.endTime || new Date(),
            duration: sessionData.duration || 0,
            finalAnswer: sessionData.finalAnswer || '',
            scratchboardContent: sessionData.scratchboardContent || '',
            messages: sessionData.messages || [],
            isCorrect: !!sessionData.isCorrect,
            timeoutOccurred: !!sessionData.timeoutOccurred,
            lessonType: completeData.lessonType || null,
            submittedAt: new Date()
          });
          
          const savedSession = await session.save();
          console.log(`✅ Session saved with ID: ${savedSession._id}`);
          results.sessionIds.push(savedSession._id);
        }
      } catch (error) {
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
    
  } catch (error) {
    console.error('❌ Error in complete data submission:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to save data',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
} 