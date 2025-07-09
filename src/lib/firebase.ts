// Firebase configuration and services
import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, collection, doc, setDoc, serverTimestamp, Firestore } from 'firebase/firestore';
import { ExperimentData } from '@/utils/types';

// Your Firebase configuration
// Replace these values with your actual Firebase project configuration
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, 
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
};

// Initialize Firebase - with better error handling
let app: FirebaseApp | undefined;
let firestore: Firestore | undefined;

try {
  app = initializeApp(firebaseConfig);
  firestore = getFirestore(app);
  console.log('Firebase initialized successfully with project:', process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID);
} catch (error) {
  console.error('Firebase initialization error:', error);
}

// Sanitize data for Firestore
// Firestore doesn't support certain JavaScript types like Date objects or undefined values
function sanitizeForFirestore(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return null; // Replace undefined with null
  }
  
  if (obj instanceof Date) {
    return obj.toISOString(); // Convert Date objects to ISO strings
  }
  
  if (typeof obj !== 'object') {
    return obj; // Return primitive values as-is
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeForFirestore(item)); // Process array items
  }
  
  // Process object properties
  const sanitized: Record<string, unknown> = {};
  for (const key in obj as Record<string, unknown>) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = (obj as Record<string, unknown>)[key];
      if (value !== undefined) { // Skip undefined values
        sanitized[key] = sanitizeForFirestore(value);
      }
    }
  }
  
  return sanitized;
}

/**
 * Client-side Firebase backup
 * NOTE: This is designed as a FALLBACK mechanism only. The primary approach
 * should be using the server-side Firebase Admin SDK via the /api/firebase-submit endpoint.
 * 
 * For optimal security, set Firestore rules to:
 * 
 * rules_version = '2';
 * service cloud.firestore {
 *   match /databases/{database}/documents {
 *     match /experiment_data/{docId} {
 *       // Allow client writes only in emergency scenarios
 *       // Consider adding IP restrictions or other conditions in production
 *       allow write: if request.resource.data._meta.source == "failsafe_backup";
 *       allow read: if false;
 *     }
 *   }
 * }
 */
export async function saveDataToFirebase(data: ExperimentData) {
  try {
    // Check if Firebase was properly initialized
    if (!app || !firestore) {
      throw new Error('Firebase not initialized properly. Check your environment variables.');
    }
    
    // Log key configuration values (without exposing sensitive data)
    console.log('CLIENT Firebase saveDataToFirebase called with:', {
      hasUserId: !!data.userId,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.substring(0, 5) + '...',
      dataKeys: Object.keys(data)
    });

    const userId = data.userId || 'unknown';
    const timestamp = serverTimestamp();
    
    // Create a document reference with userId and timestamp
    const docRef = doc(collection(firestore, 'experiment_data'), `${userId}_${Date.now()}`);
    
    // Add metadata
    const enrichedData = {
      ...data,
      _meta: {
        savedAt: timestamp,
        source: 'failsafe_backup'
      }
    };
    
    // Sanitize data for Firestore
    const sanitizedData = sanitizeForFirestore(enrichedData);
    
    // Log the attempt
    console.log(`CLIENT: Attempting to write to Firebase collection 'experiment_data' with doc ID: ${docRef.id}`);
    
    // Save to Firestore
    await setDoc(docRef, sanitizedData);
    console.log('CLIENT: Data successfully backed up to Firebase!');
    return { success: true, docId: docRef.id };
  } catch (error: unknown) {
    // Provide more detailed error information
    let errorMsg = 'Unknown error';
    
    if (error && typeof error === 'object' && 'code' in error && error.code === 'permission-denied') {
      errorMsg = 'Firebase permissions error: This is expected if you are using server-side approach.';
      console.log('PERMISSION DENIED: This is normal if you are using the server-side Admin SDK approach.');
      console.log('The client-side backup is only for emergency scenarios.');
      console.log('If you want to allow client-side writes as a backup, update your security rules to:');
      console.log(`
      rules_version = '2';
      service cloud.firestore {
        match /databases/{database}/documents {
          match /experiment_data/{docId} {
            allow write: if request.resource.data._meta.source == "failsafe_backup";
            allow read: if false;
          }
        }
      }
      `);
    } else if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === 'unavailable') {
        errorMsg = 'Firebase unavailable: Check your internet connection or if requests are being blocked';
      } else if (error.code === 'not-found') {
        errorMsg = 'Firebase resource not found: Check your project ID and collection path';
      }
    } else if (error instanceof Error) {
      errorMsg = error.message;
    }
    
    console.error('CLIENT Firebase backup failed:', errorMsg);
    
    // Create a record in localStorage as an emergency fallback
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(`firebase_error_${Date.now()}`, JSON.stringify({
          error: errorMsg,
          data: sanitizeForFirestore(data),
          timestamp: new Date().toISOString()
        }));
        console.log('Error details saved to localStorage for recovery');
      } catch {
        console.error('Failed to save error details to localStorage');
      }
    }
    
    const errorCode = error && typeof error === 'object' && 'code' in error ? error.code : 'unknown';
    return { success: false, error: errorMsg, errorCode };
  }
}

export { firestore }; 