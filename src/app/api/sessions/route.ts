import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Session from '@/models/Session';

export async function POST(request: NextRequest) {
  try {
    // Connect to MongoDB (server-side only)
    await connectToDatabase();
    
    // Parse request body
    const sessionData = await request.json();
    
    // Format message timestamps if needed
    const formattedMessages = sessionData.messages.map((message: any) => ({
      ...message,
      timestamp: message.timestamp ? new Date(message.timestamp) : new Date()
    }));
    
    // Create new session
    const session = new Session({
      ...sessionData,
      messages: formattedMessages,
      startTime: sessionData.startTime ? new Date(sessionData.startTime) : new Date(),
      endTime: sessionData.endTime ? new Date(sessionData.endTime) : new Date()
    });
    
    // Save session
    await session.save();
    
    return NextResponse.json({ success: true, sessionId: session._id });
  } catch (error) {
    console.error('Error saving session:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save session' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    let query = {};
    if (userId) {
      query = { userId };
    }
    
    const sessions = await Session.find(query)
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();
    
    return NextResponse.json({ success: true, data: sessions });
  } catch (error) {
    console.error('Error fetching sessions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch sessions' },
      { status: 500 }
    );
  }
}