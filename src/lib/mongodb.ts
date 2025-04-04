// Add this directive to ensure this module only runs on server
'use server';

import mongoose from 'mongoose';

// Connection options
const options = {
  bufferCommands: true,
  autoIndex: true
};

// Cache MongoDB connection
let isConnected = false;

export async function connectToDatabase() {
  // Return existing connection if already connected
  if (isConnected) {
    return mongoose.connection;
  }

  // Get MongoDB URI
  const MONGODB_URI = process.env.MONGODB_URI;
  
  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI is not defined in environment variables');
  }

  try {
    // Connect to MongoDB
    await mongoose.connect(MONGODB_URI, options);
    isConnected = true;
    console.log('Connected to MongoDB');
    return mongoose.connection;
  } catch (error) {
    console.error('Error connecting to MongoDB:', error);
    throw error;
  }
}