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
      testIds: [] as string[],
      sessionIds: [] as string[],
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
            ? testData.questions.map((q: { questionId: any; question: any; userAnswer: any; correctAnswer: any; isCorrect: any; scratchboardContent: any; duration: any; }) => ({
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
          // Validate required fields for session data
          if (!sessionData.questionId) {
            console.error("❌ Missing questionId in session data");
            continue; // Skip this session
          }

          // Debug logging to track session data
          console.log(`📊 Processing session for questionId: ${sessionData.questionId}`);
          console.log(`   Msg count: ${Array.isArray(sessionData.messages) ? sessionData.messages.length : 'N/A'}`);
          console.log(`   Scratchboard content length: ${(sessionData.scratchboardContent || '').length} chars`);

          // Process messages if they exist - handle possible format issues
          let processedMessages = [];
          if (sessionData.messages) {
            try {
              // Sanitize messages to ensure they match expected structure
              processedMessages = Array.isArray(sessionData.messages) 
                ? sessionData.messages.map((msg: any) => ({
                    id: typeof msg.id === 'number' ? msg.id : parseInt(msg.id) || 0,
                    sender: String(msg.sender || 'system'),
                    agentId: msg.agentId || null,
                    text: typeof msg.text === 'string' ? msg.text : String(msg.text || ''),
                    timestamp: msg.timestamp instanceof Date 
                      ? msg.timestamp 
                      : new Date(msg.timestamp || Date.now())
                  }))
                : [];
              
              console.log(`✅ Processed ${processedMessages.length} messages for session ${sessionData.questionId}`);
            } catch (msgError) {
              console.error(`❌ Error processing messages for session ${sessionData.questionId}:`, msgError);
              processedMessages = []; // Use empty array as fallback
            }
          }

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
            messages: processedMessages,
            isCorrect: !!sessionData.isCorrect,
            timeoutOccurred: !!sessionData.timeoutOccurred,
            tempRecord: false, // Set required field from schema
            lessonType: sessionData.lessonType || completeData.lessonType || null,
            hitId: sessionData.hitId || completeData.hitId || null,
            submittedAt: new Date()
          });
          
          try {
            const savedSession = await session.save();
            console.log(`✅ Session saved with ID: ${savedSession._id}`);
            results.sessionIds.push(savedSession._id.toString());
          } catch (saveError: any) {  // Add explicit any type to allow property access
            // Log detailed error for this specific session
            console.error(`❌ Error saving session for questionId ${sessionData.questionId}:`, saveError);
            
            // If it's a validation error, get more detailed information
            if (saveError.name === 'ValidationError') {
              const validationErrors = Object.keys(saveError.errors || {}).map(field => ({
                field,
                message: saveError.errors[field].message
              }));
              console.error("Validation errors:", JSON.stringify(validationErrors, null, 2));
            }
            
            console.error("Session data:", JSON.stringify({
              userId: completeData.userId,
              questionId: sessionData.questionId,
              // Log only a few key fields to avoid excessive logging
              hasQuestionText: !!sessionData.questionText,
              hasMessages: Array.isArray(sessionData.messages) && sessionData.messages.length > 0,
              messageSample: Array.isArray(sessionData.messages) && sessionData.messages.length > 0 
                ? JSON.stringify(sessionData.messages[0]) : 'No messages'
            }));
            
            // Try to save with minimum required fields as last resort
            try {
              console.log("⚠️ Attempting emergency save with minimum fields...");
              
              const emergencySession = new Session({
                userId: completeData.userId,
                questionId: sessionData.questionId,
                questionText: sessionData.questionText || 'Emergency recovery',
                startTime: new Date(),
                endTime: new Date(),
                duration: 0,
                finalAnswer: sessionData.finalAnswer || 'Emergency recovery',
                scratchboardContent: '',
                messages: [], // Empty array for safety
                isCorrect: false,
                timeoutOccurred: false,
                tempRecord: false,
                lessonType: completeData.lessonType || null,
                hitId: completeData.hitId || null,
                submittedAt: new Date()
              });
              
              const savedEmergency = await emergencySession.save();
              console.log(`✅ Emergency session saved with ID: ${savedEmergency._id}`);
              results.sessionIds.push(savedEmergency._id.toString());
            } catch (emergencyError) {
              console.error("❌ Even emergency save failed:", emergencyError);
              results.success = false;
            }
          }
        }
      } catch (error) {
        console.error("❌ Error processing session data:", error);
        results.success = false;
      }
    } else {
      console.warn("⚠️ No sessionData array found in submission or it's not an array");
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