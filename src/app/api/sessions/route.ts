import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Session from '@/models/Session';
import User from '@/models/User';

export async function POST(request: NextRequest) {
  try {
    // Start with detailed logging
    console.log("📝 Starting session submission process");
    
    // 1. Get the raw request body first for debugging
    let rawBody;
    try {
      rawBody = await request.text();
      console.log(`Raw data size: ${rawBody.length} bytes`);
    } catch (rawError) {
      console.error("Failed to read raw request:", rawError);
      return NextResponse.json({ 
        success: false, 
        error: "Failed to read request body" 
      }, { status: 400 });
    }
    
    // 2. Connect to database
    try {
      await connectToDatabase();
    } catch (dbError) {
      console.error("Database connection failed:", dbError);
      return NextResponse.json({ 
        success: false, 
        error: "Database connection failed",
        details: dbError.message
      }, { status: 500 });
    }
    
    // 3. Parse the request body
    let sessionData;
    try {
      sessionData = JSON.parse(rawBody);
    } catch (jsonError) {
      console.error("Invalid JSON in request:", jsonError);
      return NextResponse.json({ 
        success: false, 
        error: "Invalid JSON format" 
      }, { status: 400 });
    }
    
    // 4. Basic validation
    if (!sessionData.userId) {
      console.error("Missing required userId field");
      return NextResponse.json({ 
        success: false, 
        error: "Missing required field: userId" 
      }, { status: 400 });
    }
    
    // 5. Process messages with robust error handling
    let formattedMessages = [];
    try {
      // Ensure messages is always an array
      if (!Array.isArray(sessionData.messages)) {
        console.warn("Messages is not an array, initializing as empty array");
        sessionData.messages = [];
      }
      
      // Process each message with careful type checking
      formattedMessages = sessionData.messages
        .filter(msg => msg !== null && msg !== undefined)
        .map((message, index) => {
          try {
            return {
              id: typeof message.id === 'number' ? message.id : index,
              sender: String(message.sender || 'system'),
              agentId: message.agentId || null,
              text: typeof message.text === 'string' 
                ? message.text 
                : (message.text ? JSON.stringify(message.text) : ''),
              timestamp: message.timestamp ? new Date(message.timestamp) : new Date()
            };
          } catch (msgError) {
            console.warn(`Error formatting message ${index}, skipping:`, msgError);
            return null;
          }
        })
        .filter(msg => msg !== null);
      
      console.log(`Processed ${formattedMessages.length} valid messages`);
    } catch (messagesError) {
      console.error("Error processing messages array:", messagesError);
      // Continue with empty messages rather than failing
      formattedMessages = [];
    }
    
    // 6. Create session document with explicit defaults
    let session;
    try {
      session = new Session({
        userId: String(sessionData.userId),
        questionId: sessionData.questionId !== undefined ? sessionData.questionId : 0,
        questionText: String(sessionData.questionText || ''),
        startTime: sessionData.startTime ? new Date(sessionData.startTime) : new Date(),
        endTime: sessionData.endTime ? new Date(sessionData.endTime) : new Date(),
        duration: typeof sessionData.duration === 'number' ? sessionData.duration : 0,
        finalAnswer: String(sessionData.finalAnswer || ''),
        scratchboardContent: String(sessionData.scratchboardContent || ''),
        messages: formattedMessages,
        isCorrect: Boolean(sessionData.isCorrect),
        timeoutOccurred: Boolean(sessionData.timeoutOccurred),
        tempRecord: false // Always permanent now
      });
    } catch (docError) {
      console.error("Failed to create session document:", docError);
      return NextResponse.json({ 
        success: false, 
        error: "Failed to create session document",
        details: docError.message
      }, { status: 400 });
    }
    
    // 7. Save with robust error handling
    try {
      await session.save();
      console.log(`✅ Session saved with ID: ${session._id}`);
    } catch (saveError) {
      console.error("Error saving to MongoDB:", saveError);
      
      // Check for validation errors
      if (saveError.name === 'ValidationError') {
        const validationErrors = Object.keys(saveError.errors || {}).map(field => ({
          field,
          message: saveError.errors[field].message
        }));
        
        return NextResponse.json({ 
          success: false, 
          error: "Validation failed",
          validationErrors
        }, { status: 400 });
      }
      
      return NextResponse.json({ 
        success: false, 
        error: "Database save operation failed",
        details: saveError.message
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      sessionId: session._id
    });
    
  } catch (error) {
    // Global error handler
    console.error("Unhandled error in session submission:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Internal server error", 
      details: error.message
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    // Build query - no longer using tempRecord filter
    let query: any = {};
    if (userId) {
      query.userId = userId;
    }
    
    // Get total count for logging
    const matchingCount = await Session.countDocuments(query);
    console.log(`Sessions matching query: ${matchingCount}`);
    
    // Get matching sessions
    const sessions = await Session.find(query)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    
    console.log(`Returning ${sessions.length} sessions`);
    
    return NextResponse.json({ success: true, data: sessions });
  } catch (error: any) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}