import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Survey from '@/models/Survey';

export async function POST(request: NextRequest) {
  try {
    console.log("🔍 Survey API called");
    await connectToDatabase();
    
    // CRITICAL: Get raw request body first for debugging
    let rawBody;
    try {
      rawBody = await request.text();
      console.log(`Raw survey data received: ${rawBody.length} bytes`);
    } catch (jsonError) {
      console.error("❌ Failed to read raw request:", jsonError);
      return NextResponse.json(
        { success: false, error: 'Failed to read request body' },
        { status: 400 }
      );
    }
    
    // Parse the request body with enhanced error handling
    let surveyData;
    try {
      surveyData = JSON.parse(rawBody);
      console.log("📊 Survey data parsed with keys:", Object.keys(surveyData));
      
      // CRITICAL: Log nested data structure
      if (surveyData.data) {
        console.log("📊 Survey data.data keys:", Object.keys(surveyData.data));
      } else {
        console.warn("⚠️ Survey data missing 'data' field");
      }
    } catch (jsonError) {
      console.error("❌ Failed to parse survey data JSON:", jsonError);
      return NextResponse.json(
        { success: false, error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
    // Validate required fields
    if (!surveyData.userId) {
      console.error("❌ Missing required userId field");
      return NextResponse.json(
        { success: false, error: 'Missing required field: userId' },
        { status: 400 }
      );
    }
    
    if (!surveyData.data) {
      console.error("❌ Missing required data field");
      
      // CRITICAL FIX: Try to recover by using the entire object as data
      console.log("⚠️ Attempting recovery by using entire object as data");
      surveyData.data = { ...surveyData };
      delete surveyData.data.userId; // Avoid duplication
      delete surveyData.data.section; // Avoid duplication
      
      if (Object.keys(surveyData.data).length === 0) {
        return NextResponse.json(
          { success: false, error: 'Missing required field: data' },
          { status: 400 }
        );
      }
    }
    
    // Create survey document with enhanced logging
    console.log("📝 Creating survey document");
    const survey = new Survey({
      userId: surveyData.userId,
      section: surveyData.section || 'post-test',
      data: surveyData.data,
      submittedAt: new Date()
    });
    
    console.log("⏳ Saving survey document to database");
    await survey.save();
    console.log(`✅ Survey saved with ID: ${survey._id}`);
    
    return NextResponse.json({
      success: true,
      surveyId: survey._id
    });
    
  } catch (error) {
    console.error('❌ Error in survey submission:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to save survey',
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}