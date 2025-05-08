import { NextResponse } from 'next/server';
import mongoose from 'mongoose';
import Session from '@/models/Session';
import Survey from '@/models/Survey';
import TestAttempt from '@/models/TestAttempt';

// MongoDB legacy API endpoint - maintains the original MongoDB submission logic
export async function POST(request: Request) {
  // Check if we're connected to MongoDB
  if (mongoose.connection.readyState !== 1) {
    try {
      // Connect to MongoDB if not already connected
      await mongoose.connect(process.env.MONGODB_URI || '');
      console.log('🔌 Connected to MongoDB');
    } catch (error) {
      console.error('❌ MongoDB connection error:', error);
      return NextResponse.json({ error: 'Failed to connect to database' }, { status: 500 });
    }
  }

  try {
    // Parse the request body
    const completeData = await request.json();
    
    // Validate required fields
    if (!completeData.userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Log user information for tracking
    console.log(`📊 Processing data for user: ${completeData.userId}`);
    if (completeData.hitId) {
      console.log(`  HIT ID: ${completeData.hitId}`);
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
        results.surveyId = savedSurvey._id.toString();
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
      } catch (error) {
        console.error("❌ Error saving test data:", error);
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
    return NextResponse.json({ 
      error: 'Failed to process data submission',
      details: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 