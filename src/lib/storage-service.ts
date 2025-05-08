/**
 * Storage service with failsafe data persistence
 * Attempts to save data to both MongoDB and Firebase
 */

import { saveDataToFirebase } from './firebase';
import { retryWithBackoff } from './retry';

/**
 * Save experimental data with failsafe mechanism
 * Tries MongoDB first, then Firebase as backup, with retries for both
 */
export async function saveExperimentData(data: any) {
  // Validate that sessionData exists and is not empty
  if (!data.sessionData || !Array.isArray(data.sessionData) || data.sessionData.length === 0) {
    console.error('❌ Critical: sessionData is missing or empty!');
    throw new Error('Missing sessionData: Cannot save experiment data without valid sessionData array');
  }

  // Verify that required fields are in data
  const requiredFields = ['userId', 'sessionData', 'lessonType'];
  const missingFields = requiredFields.filter(field => !data[field]);
  if (missingFields.length > 0) {
    console.error(`❌ Critical: Missing required fields: ${missingFields.join(', ')}`);
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }

  // Log data structure for debugging
  console.log('📊 Data structure check:', {
    userId: data.userId,
    sessionDataCount: data.sessionData?.length || 0,
    hasMessages: data.sessionData?.some(s => s.messages && s.messages.length > 0) || false,
    lessonType: data.lessonType
  });

  const results = {
    mongodb: { success: false, error: null },
    firebase: { success: false, error: null },
    overallSuccess: false
  };

  // Helper to log detailed success/failure information
  const logStatus = () => {
    console.log('Data storage results:', {
      mongodb: results.mongodb.success ? 'SUCCESS' : 'FAILED',
      firebase: results.firebase.success ? 'SUCCESS' : 'FAILED',
      overallSuccess: results.overallSuccess
    });
  };

  try {
    // Step 1: Try primary storage (MongoDB) with retries
    try {
      await retryWithBackoff(async () => {
        // Use the ORIGINAL MongoDB API endpoint
        const response = await fetch('/api/mongodb-legacy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...data,
            _meta: {
              source: 'failsafe_service',
              timestamp: new Date().toISOString()
            }
          })
        });
        
        if (!response.ok) {
          throw new Error(`MongoDB API returned ${response.status}: ${await response.text()}`);
        }
        
        const result = await response.json();
        results.mongodb = { success: true, data: result };
        console.log('✅ Successfully saved to MongoDB');
      }, 3); // 3 retries
    } catch (error) {
      results.mongodb = { success: false, error };
      console.error('❌ Failed to save to MongoDB after retries:', error);
    }

    // Step 2: Always try Firebase backup with retries, regardless of MongoDB result
    try {
      await retryWithBackoff(async () => {
        // Create a clean payload - no need for separate messages field since it's in sessionData
        const payload = {
          userId: data.userId,
          hitId: data.hitId,
          assignmentId: data.assignmentId,
          sessionData: data.sessionData,
          testData: data.testData || [],
          surveyData: data.surveyData || null,
          lessonType: data.lessonType,
          completedAt: new Date().toISOString(),
          _meta: {
            source: 'failsafe_service',
            timestamp: new Date().toISOString()
          }
        };
        
        // Use server-side Firebase Admin API instead of client-side Firebase
        const response = await fetch('/api/firebase-submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Firebase API returned ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        
        if (!result.success) {
          throw new Error(result.message || 'Firebase server save failed');
        }
        
        results.firebase = { success: true, data: result };
        console.log('✅ Successfully saved to Firebase via secure Admin SDK');
      }, 3); // 3 retries
    } catch (error) {
      results.firebase = { success: false, error };
      console.error('❌ Failed to save to Firebase after retries:', error);
      
      // Fallback to client-side Firebase as last resort
      // This is a double-safety net in case the Admin API is down
      try {
        console.log('⚠️ Attempting fallback to client-side Firebase...');
        
        // Create a clean payload for client-side fallback - same structure as above
        const payload = {
          userId: data.userId,
          hitId: data.hitId,
          assignmentId: data.assignmentId,
          sessionData: data.sessionData,
          testData: data.testData || [],
          surveyData: data.surveyData || null,
          lessonType: data.lessonType,
          completedAt: new Date().toISOString()
        };
        
        const firebaseResult = await saveDataToFirebase(payload);
        
        if (firebaseResult.success) {
          results.firebase = { success: true, data: firebaseResult };
          console.log('✅ Successfully saved to Firebase via client fallback');
        }
      } catch (fallbackError) {
        console.error('❌ Firebase client fallback also failed:', fallbackError);
      }
    }

    // Consider operation successful if at least one storage method succeeded
    results.overallSuccess = results.mongodb.success || results.firebase.success;
    
    // Log the final status
    logStatus();
    
    if (!results.overallSuccess) {
      // If both failed, throw an error
      throw new Error('Failed to save data to both MongoDB and Firebase');
    }
    
    return results;
  } catch (error) {
    console.error('Critical data storage failure:', error);
    
    // Last resort: Save to localStorage as emergency backup
    if (typeof window !== 'undefined') {
      try {
        const emergencyBackupKey = `emergency_backup_${Date.now()}`;
        localStorage.setItem(emergencyBackupKey, JSON.stringify({
          data,
          storageResults: results,
          timestamp: new Date().toISOString()
        }));
        console.log(`📦 Created emergency backup in localStorage: ${emergencyBackupKey}`);
      } catch (localStorageError) {
        console.error('Even localStorage backup failed:', localStorageError);
      }
    }
    
    // Re-throw the error
    throw error;
  }
} 