import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';

// MongoDB connection
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || 'teaching_experiment';
const collectionName = 'experiment_data';

// MongoDB API endpoint - handles only MongoDB operations
export async function POST(request: Request) {
  if (!uri) {
    console.error('MongoDB URI not configured');
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  try {
    // Parse request body
    const data = await request.json();
    
    // Connect to MongoDB
    const client = new MongoClient(uri);
    await client.connect();
    
    // Access collection
    const db = client.db(dbName);
    const collection = db.collection(collectionName);
    
    // Add metadata
    const enrichedData = {
      ...data,
      _meta: {
        savedAt: new Date(),
        source: 'mongodb_api'
      }
    };
    
    // Insert data
    const result = await collection.insertOne(enrichedData);
    
    // Close connection
    await client.close();
    
    console.log(`MongoDB: Successfully saved data with ID: ${result.insertedId}`);
    
    // Return success
    return NextResponse.json({ 
      success: true, 
      message: 'Data saved to MongoDB', 
      id: result.insertedId 
    });
  } catch (error) {
    console.error('MongoDB save error:', error);
    return NextResponse.json({ 
      error: 'Failed to save data', 
      details: error instanceof Error ? error.message : String(error) 
    }, { status: 500 });
  }
} 