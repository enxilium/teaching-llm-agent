import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongodb';
import Survey from '@/models/Survey';

export async function POST(request: NextRequest) {
  try {
    console.log("📊 Starting survey submission process");
    
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
    let surveyData;
    try {
      surveyData = JSON.parse(rawBody);
      console.log("Survey data parsed:", { 
        userId: surveyData.userId,
        section: surveyData.section,
        hasData: !!surveyData.data
      });
    } catch (jsonError) {
      console.error("Invalid JSON in request:", jsonError);
      return NextResponse.json({ 
        success: false, 
        error: "Invalid JSON format" 
      }, { status: 400 });
    }
    
    // 4. Basic validation
    if (!surveyData.userId) {
      console.error("Missing required userId field");
      return NextResponse.json({ 
        success: false, 
        error: "Missing required field: userId" 
      }, { status: 400 });
    }
    
    if (!surveyData.data) {
      console.error("Missing required data field");
      return NextResponse.json({ 
        success: false, 
        error: "Missing required field: data" 
      }, { status: 400 });
    }
    
    // 5. Create survey document
    let survey;
    try {
      survey = new Survey({
        userId: String(surveyData.userId),
        section: String(surveyData.section || 'post-test'),
        data: surveyData.data,
        submittedAt: new Date()
      });
    } catch (docError) {
      console.error("Failed to create survey document:", docError);
      return NextResponse.json({ 
        success: false, 
        error: "Failed to create survey document",
        details: docError.message
      }, { status: 400 });
    }
    
    // 6. Save with robust error handling
    try {
      await survey.save();
      console.log(`✅ Survey saved with ID: ${survey._id}`);
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
      surveyId: survey._id
    });
    
  } catch (error) {
    // Global error handler
    console.error("Unhandled error in survey submission:", error);
    return NextResponse.json({ 
      success: false, 
      error: "Internal server error", 
      details: error.message
    }, { status: 500 });
  }
}