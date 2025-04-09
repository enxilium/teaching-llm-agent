import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Session from '@/models/Session';
import User from '@/models/User';
import mongoose from 'mongoose';

interface Message {
  id?: number;
  sender?: string;
  agentId?: string | null;
  text?: string | any;
  timestamp?: string | Date;
}

interface SessionData {
  userId: string;
  questionId?: number;
  questionText?: string;
  startTime?: string | Date;
  endTime?: string | Date;
  duration?: number;
  finalAnswer?: string;
  scratchboardContent?: string;
  messages?: Message[];
  isCorrect?: boolean;
  timeoutOccurred?: boolean;
}

interface FormattedMessage {
  id: number;
  sender: string;
  agentId: string | null;
  text: string;
  timestamp: Date;
}

export async function POST(request: NextRequest) {
  try {
    // Start with detailed logging
    console.log("📝 Starting session submission process");
    
    // 1. Get the raw request body first for debugging
    let rawBody: string;
    try {
      rawBody = await request.text();
      console.log(`Raw data size: ${rawBody.length} bytes`);
    } catch (rawError: unknown) {
      console.error("Failed to read raw request:", rawError);
      return NextResponse.json({ 
        success: false, 
        error: "Failed to read request body" 
      }, { status: 400 });
    }
    
    // 2. Connect to database
    try {
      await connectToDatabase();
    } catch (dbError: unknown) {
      console.error("Database connection failed:", dbError);
      const errorMessage = dbError instanceof Error ? dbError.message : 'Unknown database error';
      return NextResponse.json({ 
        success: false, 
        error: "Database connection failed",
        details: errorMessage
      }, { status: 500 });
    }
    
    // 3. Parse the request body
    let sessionData: SessionData;
    try {
      sessionData = JSON.parse(rawBody);
    } catch (jsonError: unknown) {
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
    let formattedMessages: FormattedMessage[] = [];
    try {
      // Ensure messages is always an array
      if (!Array.isArray(sessionData.messages)) {
        console.warn("Messages is not an array, initializing as empty array");
        sessionData.messages = [];
      }
      
      // Log raw messages before processing
      console.log(`Raw messages array length: ${sessionData.messages.length}`);
      if (sessionData.messages.length > 0) {
        console.log(`Raw first message: ${JSON.stringify(sessionData.messages[0])}`);
      }
      
      // Process each message with careful type checking
      formattedMessages = sessionData.messages
        .filter((msg: Message | null | undefined): msg is Message => msg !== null && msg !== undefined)
        .map((message: Message, index: number): FormattedMessage | null => {
          try {
            // Format timestamp
            let timestamp: Date;
            try {
              if (message.timestamp) {
                // Try parsing as Date object
                timestamp = new Date(message.timestamp);
                // Validate the date
                if (isNaN(timestamp.getTime())) {
                  console.warn(`Invalid timestamp for message ${index}, using current time`);
                  timestamp = new Date();
                }
              } else {
                timestamp = new Date();
              }
            } catch (timeError) {
              console.warn(`Error processing timestamp for message ${index}, using current time:`, timeError);
              timestamp = new Date();
            }
            
            // Process text content
            let textContent: string;
            if (typeof message.text === 'string') {
              textContent = message.text;
            } else if (message.text) {
              try {
                textContent = JSON.stringify(message.text);
              } catch (e) {
                textContent = String(message.text);
              }
            } else {
              textContent = '';
            }
            
            return {
              id: typeof message.id === 'number' ? message.id : index,
              sender: String(message.sender || 'system'),
              agentId: message.agentId || null,
              text: textContent,
              timestamp: timestamp
            };
          } catch (msgError) {
            console.warn(`Error formatting message ${index}, skipping:`, msgError);
            return null;
          }
        })
        .filter((msg: FormattedMessage | null): msg is FormattedMessage => msg !== null);
      
      console.log(`Processed ${formattedMessages.length} valid messages`);
      // Log a sample of formatted messages
      if (formattedMessages.length > 0) {
        console.log(`Sample formatted message: ${JSON.stringify(formattedMessages[0])}`);
      }
    } catch (messagesError) {
      console.error("Error processing messages array:", messagesError);
      // Continue with empty messages rather than failing
      formattedMessages = [];
    }
    
    // 6. Create session document with explicit defaults
    let session;
    try {
      // Log specific fields for debugging
      console.log(`Creating session document with:
        - userId: ${String(sessionData.userId)}
        - questionId: ${sessionData.questionId !== undefined ? sessionData.questionId : 0}
        - scratchboardContent length: ${(sessionData.scratchboardContent || '').length} characters
        - messages count: ${formattedMessages.length}
      `);
      
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
    } catch (docError: unknown) {
      console.error("Failed to create session document:", docError);
      const errorMessage = docError instanceof Error ? docError.message : 'Unknown document creation error';
      return NextResponse.json({ 
        success: false, 
        error: "Failed to create session document",
        details: errorMessage
      }, { status: 400 });
    }
    
    // 7. Save with robust error handling
    try {
      await session.save();
      console.log(`✅ Session saved with ID: ${session._id}`);
    } catch (saveError: unknown) {
      console.error("Error saving to MongoDB:", saveError);
      
      // Check for validation errors
      if (saveError instanceof mongoose.Error.ValidationError) {
        const validationErrors = Object.keys(saveError.errors).map(field => ({
          field,
          message: saveError.errors[field].message
        }));
        
        return NextResponse.json({ 
          success: false, 
          error: "Validation failed",
          validationErrors
        }, { status: 400 });
      }
      
      const errorMessage = saveError instanceof Error ? saveError.message : 'Unknown save error';
      return NextResponse.json({ 
        success: false, 
        error: "Database save operation failed",
        details: errorMessage
      }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      sessionId: session._id
    });
    
  } catch (error: unknown) {
    // Global error handler
    console.error("Unhandled error in session submission:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ 
      success: false, 
      error: "Internal server error", 
      details: errorMessage
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    // Build query - no longer using tempRecord filter
    const query: { userId?: string } = {};
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
  } catch (error: unknown) {
    console.error('Error fetching sessions:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json(
      { success: false, error: 'Failed to fetch sessions', details: errorMessage },
      { status: 500 }
    );
  }
}