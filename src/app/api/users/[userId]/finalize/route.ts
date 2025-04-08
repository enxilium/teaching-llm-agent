import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';
import Session from '@/models/Session';

// POST handler for finalizing a user's sessions
export async function POST(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const userId = params.userId;
    
    // Connect to MongoDB
    await connectToDatabase();
    
    // Set user record as permanent
    const userResult = await User.findOneAndUpdate(
      { userId },
      { $set: { tempRecord: false, flowStage: 'completed' } },
      { new: true }
    );
    
    if (!userResult) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }
    
    // Set all sessions with this user ID as permanent
    const sessionResult = await Session.updateMany(
      { userId },
      { $set: { tempRecord: false } }
    );
    
    console.log(`Finalized user ${userId} with ${sessionResult.modifiedCount} sessions`);
    
    return NextResponse.json({ 
      success: true, 
      userId: userResult._id,
      updatedSessionCount: sessionResult.modifiedCount
    });
  } catch (error) {
    console.error('Error finalizing user records:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to finalize user records' },
      { status: 500 }
    );
  }
}