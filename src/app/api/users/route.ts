import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import User from '@/models/User';

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const userData = await request.json();
    
    // If tempRecord isn't explicitly set to false, default to true
    if (userData.tempRecord !== false) {
      userData.tempRecord = true;
    }
    
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
    const tempParam = searchParams.get('tempRecord');
    
    let query: any = {};
    
    if (userId) {
      query.userId = userId;
    }
    
    // Only include tempRecord in query if explicitly requested
    if (tempParam !== null) {
      query.tempRecord = tempParam === 'true';
    } else {
      // Default to only showing permanent records
      query.tempRecord = false;
    }
    
    const users = await User.find(query).sort({ createdAt: -1 }).limit(100);
    
    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}