import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import TestAttempt from '@/models/TestAttempt';

export async function POST(request: NextRequest) {
  try {
    await connectToDatabase();
    
    const testData = await request.json();
    
    const testAttempt = new TestAttempt({
      userId: testData.userId,
      testType: testData.testType,
      questions: testData.questions,
      score: testData.score,
      completedAt: new Date()
    });
    
    await testAttempt.save();
    
    return NextResponse.json({ success: true, testId: testAttempt._id });
  } catch (error) {
    console.error('Error saving test data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save test data' },
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