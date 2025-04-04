import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const userData = await request.json();
    
    // Use findOneAndUpdate with upsert to handle both create and update
    const user = await User.findOneAndUpdate(
      { userId: userData.userId },
      { $set: userData },
      { upsert: true, new: true }
    );
    
    return NextResponse.json({ success: true, userId: user._id });
  } catch (error) {
    console.error('Error saving user data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save user data' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    
    if (userId) {
      const user = await User.findOne({ userId }).lean();
      return NextResponse.json({ success: true, data: user });
    } else {
      const users = await User.find().sort({ createdAt: -1 }).lean();
      return NextResponse.json({ success: true, data: users });
    }
  } catch (error) {
    console.error('Error fetching user data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch user data' },
      { status: 500 }
    );
  }
}