'use client'

import React, { createContext, useContext, useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';

// Define flow stages
type FlowStage = 'terms' | 'pre-test' | 'lesson' | 'tetris-break' | 'post-test' | 'final-test' | 'completed';

// Define lesson types
type LessonType = 'group' | 'multi' | 'single' | 'solo';

// Message interface for chat messages
interface Message {
  id: number;
  sender: string;
  agentId?: string | null;
  text: string;
  timestamp: Date;
}

// Session data structure
interface SessionData {
  questionId: number;
  questionText: string;
  startTime: Date;
  endTime: Date;
  duration: number;
  finalAnswer: string;
  scratchboardContent: string;
  messages: Message[];
  isCorrect: boolean;
  timeoutOccurred: boolean;
}

// Test question structure
interface TestQuestion {
  questionId: number;
  question: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  scratchboardContent?: string;
  duration: number;
}

// Test data structure
interface TestData {
  testType: 'pre' | 'post' | 'final';
  submissionId?: string;
  questions: TestQuestion[];
  score: number;
  completedAt: Date;
  timeoutOccurred?: boolean;
  duration: number;
}

// Survey data structure
interface SurveyData {
  confusionLevel?: string;
  testDifficulty?: string;
  perceivedCorrectness?: string;
  learningAmount?: string;
  feedback?: string;
  submittedAt?: string;
}

// Flow data structure - everything we track during the flow
interface FlowData {
  userId: string;
  testId: string;
  surveyData: SurveyData | null;
  sessionData: SessionData[];
  testData: TestData[];
  sessionId: string;
  questions: any[];
  currentStage: FlowStage;
  lessonType: LessonType | null;
  lessonQuestionIndex: number;
  hitId: string;
  assignmentId: string;
  messages?: Message[];
}

// Define context type
interface FlowContextType {
  userId: string;
  currentStage: FlowStage;
  lessonType: LessonType | null;
  lessonQuestionIndex: number;
  hitId: string;
  assignmentId: string;
  
  // Session management methods
  saveSessionData: (sessionData: SessionData) => void;
  saveTestData: (testData: TestData) => void;
  saveSurveyData: (surveyData: SurveyData) => void;
  
  // Flow progression methods
  agreeToTerms: () => void;
  completePreTest: () => void;
  completeLesson: () => void;
  completeTetrisBreak: () => void;
  completePostTest: () => void;
  completeFinalTest: () => Promise<boolean>;
  resetFlow: () => void;

  // Final data submission method
  submitAllDataToDatabase: () => Promise<void>;
}

// Default flow data
const defaultFlowData: FlowData = {
  userId: '',
  currentStage: 'terms',
  lessonType: null,
  lessonQuestionIndex: 0,
  sessionData: [],
  testData: [],
  surveyData: null,
  testId: '',
  sessionId: '',
  questions: [],
  hitId: '',
  assignmentId: ''
};

// Create context with default values
const FlowContext = createContext<FlowContextType>({
  userId: '',
  currentStage: 'terms',
  lessonType: null,
  lessonQuestionIndex: 0,
  hitId: '',
  assignmentId: '',
  
  saveSessionData: () => {},
  saveTestData: () => {},
  saveSurveyData: () => {},
  
  agreeToTerms: () => {},
  completePreTest: () => {},
  completeLesson: () => {},
  completeTetrisBreak: () => {},
  completePostTest: () => {},
  completeFinalTest: async () => true,
  resetFlow: () => {},
  submitAllDataToDatabase: async () => {},
});

// Hook for accessing the flow context
export const useFlow = () => useContext(FlowContext);

// Create provider component
export function FlowProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  
  // State to track flow data
  const [flowData, setFlowData] = useState<FlowData>(defaultFlowData);
  const [initialized, setInitialized] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  
  // Extract common values from flowData for easier access
  const { userId, currentStage, lessonType, lessonQuestionIndex, hitId, assignmentId } = flowData;

  // Add this near the top of your FlowProvider component
  const transitionInProgressRef = useRef(false);
  
  // Clear flow and start fresh
  const resetFlow = () => {
    // Extract workerId, hitId, and assignmentId from URL query parameters if available
    let newUserId = "test" + Math.floor(Math.random() * 10000); // Default fallback for development
    let hitId = '';
    let assignmentId = '';
    
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const workerIdParam = urlParams.get('workerId');
      const hitIdParam = urlParams.get('hitId');
      const assignmentIdParam = urlParams.get('assignmentId');
      
      // Use workerId as userId if available
      if (workerIdParam) {
        newUserId = workerIdParam;
        console.log(`Using Prolific workerId as userId: ${newUserId}`);
      } else {
        console.log(`No workerId found, using development userId: ${newUserId}`);
      }
      
      // Store hitId and assignmentId if available
      if (hitIdParam) {
        hitId = hitIdParam;
      }
      
      if (assignmentIdParam) {
        assignmentId = assignmentIdParam;
      }
      
      console.log(`Query parameters - workerId: ${workerIdParam}, hitId: ${hitIdParam}, assignmentId: ${assignmentIdParam}`);
    }
    
    const newFlowData: FlowData = {
      ...defaultFlowData,
      userId: newUserId,
      hitId: hitId,
      assignmentId: assignmentId,
      lessonQuestionIndex: Math.floor(Math.random() * 2),
    };
    
    setFlowData(newFlowData);
    
    // Clear local storage and set new flow data
    if (typeof window !== 'undefined') {
      localStorage.setItem('flowData', JSON.stringify(newFlowData));
    }
    
    // Navigate to home
    if (router) {
      router.push('/');
    }
  };
  
  // Initialize or reset flow on load
  useEffect(() => {
    if (typeof window !== 'undefined' && !initialized) {
      resetFlow();
      setInitialized(true);
    }
  }, [initialized]); // Explicitly listing dependencies
  
  // Update localStorage whenever flowData changes
  useEffect(() => {
    if (initialized && typeof window !== 'undefined') {
      localStorage.setItem('flowData', JSON.stringify(flowData));
    }
  }, [flowData, initialized]);
  
  // Save session data method
  const saveSessionData = (sessionData: any) => {
    console.log(`💾 Saving session data for question ${sessionData.questionId} with ${sessionData.messages?.length || 0} messages`);
    
    // Log scratchboardContent to debug
    console.log(`💾 Scratchboard content length: ${(sessionData.scratchboardContent || '').length} characters`);
    
    // CRITICAL: Log message count and validate data
    if (!sessionData.messages || sessionData.messages.length === 0) {
      console.warn("⚠️ No messages in session data - this might indicate an issue");
    } else {
      console.log(`💾 First message: ${typeof sessionData.messages[0].text === 'string' ? 
        sessionData.messages[0].text.substring(0, 30) + '...' : 'non-string content'}`);
      
      // Log all message fields for debugging
      console.log(`💾 Message fields: ${Object.keys(sessionData.messages[0]).join(', ')}`);
      
      // Check for any messages with missing required fields
      const invalidMessages = sessionData.messages.filter((msg: any) => 
        !msg.text || !msg.sender || msg.id === undefined
      );
      
      if (invalidMessages.length > 0) {
        console.warn(`⚠️ Found ${invalidMessages.length} messages with missing required fields`);
      }
    }
    
    // Deep clone messages to avoid mutation issues
    let messagesCopy = [];
    try {
      messagesCopy = Array.isArray(sessionData.messages) 
        ? sessionData.messages.map((msg: any) => ({
            ...msg,
            // Ensure text is a string
            text: typeof msg.text === 'string' ? msg.text : String(msg.text || ''),
            // Convert timestamp to ISO string for consistency
            timestamp: msg.timestamp instanceof Date 
              ? msg.timestamp 
              : new Date(msg.timestamp || Date.now())
          }))
        : [];
        
      console.log(`💾 Processed ${messagesCopy.length} messages for storage`);
    } catch (error) {
      console.error("❌ Error processing messages:", error);
      messagesCopy = [];
    }
    
    // Ensure scratchboardContent is a string and not undefined/null
    const sanitizedSessionData = {
      ...sessionData,
      scratchboardContent: sessionData.scratchboardContent || '',
      messages: messagesCopy
    };
    
    // Update state with atomic operation
    setFlowData(prev => {
      const updatedData = {
        ...prev,
        sessionData: [...(prev.sessionData || []), {
          ...sanitizedSessionData,
          userId,
          _savedAt: new Date().toISOString() // Add timestamp for tracking
        }]
      };
      
      // Immediately update localStorage for resilience
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('flowData', JSON.stringify(updatedData));
          
          // Also create a separate backup of this specific session
          const sessionBackup = {
            questionId: sanitizedSessionData.questionId,
            messages: sanitizedSessionData.messages,
            scratchboardContent: sanitizedSessionData.scratchboardContent,
            _savedAt: new Date().toISOString()
          };
          localStorage.setItem(`session_backup_${sanitizedSessionData.questionId}`, JSON.stringify(sessionBackup));
          
          console.log(`💾 Session ${sanitizedSessionData.questionId} backed up to localStorage with ${sanitizedSessionData.messages.length} messages`);
        } catch (e) {
          console.error("Error saving to localStorage:", e);
        }
      }
      
      return updatedData;
    });
  };

  // Add this function after saveSessionData to explicitly create backups
  const createBackups = () => {
    if (typeof window === 'undefined') return;
    
    console.log("Creating emergency backups of all flow data");
    
    try {
      // Save full flow context
      localStorage.setItem('flowData_backup', JSON.stringify({
        ...flowData,
        _backupTime: new Date().toISOString()
      }));
      
      // Save survey data separately
      if (flowData.surveyData) {
        localStorage.setItem('surveyData_backup', JSON.stringify({
          ...flowData.surveyData,
          _backupTime: new Date().toISOString()
        }));
      }
      
      // Save each session individually
      if (flowData.sessionData?.length > 0) {
        flowData.sessionData.forEach(session => {
          localStorage.setItem(`session_backup_${session.questionId}`, JSON.stringify({
            ...session,
            _backupTime: new Date().toISOString()
          }));
        });
      }
      
      console.log("✅ All emergency backups created successfully");
    } catch (e) {
      console.error("Error creating backups:", e);
    }
  };

  // Call this function before any major navigation
  useEffect(() => {
    // Create backups when the stage changes
    createBackups();
  }, [currentStage]);
  
  // Update the saveTestData function to include scratchboardContent
  const saveTestData = (testData: any) => {
    console.log(`Saving ${testData.testType} test data to flow context`);
    
    // Create a normalized version of the test data with safe defaults
    const normalizedTestData = {
      testType: testData.testType,
      submissionId: testData.submissionId || Date.now().toString(),
      questions: Array.isArray(testData.questions) 
        ? testData.questions.map((q: TestQuestion) => ({
            questionId: q.questionId || 0,
            question: typeof q.question === 'string' ? q.question : '',
            userAnswer: typeof q.userAnswer === 'string' ? q.userAnswer : 'No answer provided',
            correctAnswer: typeof q.correctAnswer === 'string' ? q.correctAnswer : String(q.correctAnswer || ''),
            isCorrect: Boolean(q.isCorrect),
            scratchboardContent: q.scratchboardContent || '',
            duration: q.duration
        })) 
        : [],
      score: typeof testData.score === 'number' ? testData.score : 0,
      completedAt: testData.completedAt || new Date(),
      timeoutOccurred: testData.timeoutOccurred,
      duration: testData.duration
    };
    
    // Enhanced duplicate detection - check both test type AND submission ID
    const existingTest = flowData.testData.find(
      test => test.testType === normalizedTestData.testType
    );
    
    if (existingTest) {
      // If we have the same submission ID, it's truly a duplicate - ignore it
      if (existingTest.submissionId === normalizedTestData.submissionId) {
        console.warn(`Ignoring duplicate test submission with ID ${normalizedTestData.submissionId}`);
        return; // Don't process the duplicate at all
      }
      
      // If the IDs differ, it's a replacement - log and proceed
      console.warn(`Replacing ${normalizedTestData.testType} test submission`);
      
      // Replace existing test of same type
      setFlowData(prev => ({
        ...prev,
        testData: prev.testData.map(test => 
          test.testType === normalizedTestData.testType ? 
          normalizedTestData : 
          test
        )
      }));
    } else {
      // Add new test data
      setFlowData(prev => ({
        ...prev,
        testData: [...prev.testData, normalizedTestData]
      }));
    }
    
    // Update localStorage for resilience
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        try {
          const updatedFlowData = {
            ...flowData,
            testData: [...flowData.testData.filter(t => t.testType !== normalizedTestData.testType), 
                      normalizedTestData]
          };
          localStorage.setItem('flowData', JSON.stringify(updatedFlowData));
          localStorage.setItem(`test_backup_${normalizedTestData.testType}`, 
                             JSON.stringify({...normalizedTestData, _savedAt: new Date().toISOString()}));
          console.log(`Updated localStorage with ${normalizedTestData.testType} test data`);
        } catch (e) {
          console.error("Failed to save test data to localStorage:", e);
        }
      }
    }, 0);
  };
  
  // Improve saveSurveyData with better debugging
  const saveSurveyData = useCallback((data: SurveyData) => {
    console.log("💾 Saving survey data:", data);
    
    // Create timestamp for when survey was completed
    const timestamp = new Date().toISOString();
    const surveyWithTimestamp = { ...data, completedAt: timestamp };
    
    // CRITICAL FIX: Update localStorage FIRST (synchronously) before React state update
    if (typeof window !== 'undefined') {
      try {
        // Create dedicated backup of survey data
        localStorage.setItem('surveyData_backup', JSON.stringify(surveyWithTimestamp));
        console.log("✅ Created survey data backup in localStorage");
        
        // Also update the full flowData in localStorage with the new survey data
        const currentFlowData = localStorage.getItem('flowData');
        if (currentFlowData) {
          const parsedFlowData = JSON.parse(currentFlowData);
          const updatedFlowData = { 
            ...parsedFlowData, 
            surveyData: surveyWithTimestamp,
            _lastUpdated: timestamp
          };
          localStorage.setItem('flowData', JSON.stringify(updatedFlowData));
          console.log("✅ Updated flowData in localStorage with survey data");
        }
      } catch (e) {
        console.error("Failed to create survey backup in localStorage:", e);
      }
    }
    
    // Update flow context with survey data
    setFlowData(prev => {
      const updated = { ...prev, surveyData: surveyWithTimestamp };
      
      // Already updated localStorage above, but double-check here
      if (typeof window !== 'undefined') {
        try {
          // Verify localStorage was updated correctly
          const storedSurveyData = localStorage.getItem('surveyData_backup');
          if (!storedSurveyData) {
            console.warn("Survey data not found in localStorage, saving again");
            localStorage.setItem('surveyData_backup', JSON.stringify(surveyWithTimestamp));
          }
        } catch (e) {
          console.error("Failed to verify localStorage survey data:", e);
        }
      }
      
      return updated;
    });
  }, []);
  
  // Stage transition methods
  const agreeToTerms = () => {
    setFlowData(prev => ({
      ...prev,
      currentStage: 'pre-test'
    }));
    
    router.push('/test?stage=pre');
  };
  
  // Simplified completePreTest function
  const completePreTest = () => {
    console.log("Starting pre-test completion transition");
    
    // Select random lesson type
    const lessonTypes: LessonType[] = ['group', 'multi', 'single', 'solo'];
    const randomLessonType = lessonTypes[Math.floor(Math.random() * lessonTypes.length)];
    console.log(`Selected random lesson: ${randomLessonType}`);
    
    // Update state
    setFlowData(prev => ({
        ...prev,
        currentStage: 'lesson',
        lessonType: randomLessonType
    }));
    
    // Update localStorage
    if (typeof window !== 'undefined') {
        localStorage.setItem('currentStage', 'lesson');
        localStorage.setItem('lessonType', randomLessonType);
    }
    
    // Navigate with delay to allow state to update
    setTimeout(() => {
        try {
            router.push(`/${randomLessonType}`);
        } catch (error) {
            console.error("Navigation error:", error);
            // Fallback direct navigation
            window.location.href = `/${randomLessonType}`;
        }
    }, 300);
  };

  const completeLesson = () => {
    console.log('Starting lesson completion transition...');
    
    try {
      // CRITICAL: Create backup of flow data before navigation
      if (typeof window !== 'undefined') {
        console.log('Creating persistent backup before navigation');
        localStorage.setItem('flowData_preserved', JSON.stringify(flowData));
        localStorage.setItem('currentStage', 'tetris-break');
      }
      
      // Update the state in a safer way
      setFlowData(prev => {
        const updated = {
          ...prev,
          currentStage: 'tetris-break' as FlowStage
        };
        
        // Also update localStorage immediately to ensure data persistence
        if (typeof window !== 'undefined') {
          try {
            localStorage.setItem('flowData', JSON.stringify(updated));
          } catch (e) {
            console.error("Error saving to localStorage during transition:", e);
          }
        }
        
        return updated;
      });
      
      // Add a significant delay before navigation to ensure state updates complete
      setTimeout(() => {
        try {
          // Verify our stage was properly updated
          const currentSavedStage = localStorage.getItem('currentStage');
          console.log(`Stage before navigation: ${currentSavedStage}`);
          
          if (currentSavedStage !== 'tetris-break') {
            console.warn('Stage mismatch, forcing correction in localStorage');
            localStorage.setItem('currentStage', 'tetris-break');
          }
          
          console.log('Navigating to break page...');
          router.push('/break');
        } catch (error) {
          console.error('Navigation error:', error);
          // Emergency fallback
          window.location.href = '/break';
        }
      }, 600);
    } catch (error) {
      console.error('Error in completeLesson:', error);
      // Last resort emergency redirect
      window.location.href = '/break';
    }
  };
  
  // Simplified completePostTest function
  const completePostTest = () => {
    console.log("Starting post-test completion transition");
    
    // Update state
    setFlowData(prev => ({
        ...prev,
        currentStage: 'final-test'
    }));
    
    // Update localStorage
    if (typeof window !== 'undefined') {
        localStorage.setItem('currentStage', 'final-test');
    }
    
    // Navigate with delay
    setTimeout(() => {
        try {
            router.push('/test?stage=final');
        } catch (error) {
            console.error("Navigation error:", error);
            // Fallback direct navigation
            window.location.href = '/test?stage=final';
        }
    }, 300);
  };

  const completeTetrisBreak = () => {
    setFlowData(prev => ({
      ...prev,
      currentStage: 'post-test'
    }));
    
    router.push('/test?stage=post');
  };
  
  // The most important method - store everything to database
  const completeFinalTest = async () => {
    console.log("completeFinalTest called - starting final test completion process");
    
    try {
      // Mark flow as completed with proper type assertion
      setFlowData(prev => ({
        ...prev,
        currentStage: 'completed' as FlowStage  // Add explicit type cast here
      }));
      
      // IMPORTANT: Just navigate to completed page WITHOUT writing to database
      // All data will be saved after survey submission
      setTimeout(() => {
        router.push('/completed');
      }, 300);
      
      return true; // Return success boolean as defined in interface
    } catch (error) {
      console.error("Error completing final test:", error);
      return false; // Return failure boolean in case of error
    }
  };

  // Update the submitAllDataToDatabase function with better logging
  const submitAllDataToDatabase = async () => {
    if (!flowData) {
      console.error("No flow data available for submission");
      return;
    }
    
    console.log("💾 Attempting to submit all data to database...");
    setIsSubmitting(true);
    
    try {
      // Check if we have survey data in the flow context
      let surveyDataToSubmit = flowData.surveyData;
      
      // If no survey data in flow context, try to recover from dedicated backup
      if (!surveyDataToSubmit) {
        console.log("⚠️ No survey data found in flow context, attempting recovery from backup...");
        
        // Try to get from dedicated backup in localStorage
        if (typeof window !== 'undefined') {
          try {
            const backupData = localStorage.getItem('surveyData_backup');
            if (backupData) {
              surveyDataToSubmit = JSON.parse(backupData);
              console.log("✅ Recovered survey data from dedicated backup");
            }
          } catch (e) {
            console.error("Failed to parse backup survey data:", e);
          }
        }
        
        // If still no survey data, try to get from flowData in localStorage
        if (!surveyDataToSubmit && typeof window !== 'undefined') {
          try {
            const storedFlowData = localStorage.getItem('flowData');
            if (storedFlowData) {
              const parsedFlowData = JSON.parse(storedFlowData);
              if (parsedFlowData.surveyData) {
                surveyDataToSubmit = parsedFlowData.surveyData;
                console.log("✅ Recovered survey data from localStorage flowData");
              }
            }
          } catch (e) {
            console.error("Failed to parse localStorage flowData:", e);
          }
        }
      }
      
      // Now check if we have survey data to submit
      if (surveyDataToSubmit) {
        console.log("📤 Submitting with survey data:", surveyDataToSubmit);
        
        // Final submission with all required data
        const response = await fetch('/api/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: flowData.userId,
            testId: flowData.testId,
            completedAt: new Date().toISOString(),
            questionResponses: flowData.questions || [],
            surveyData: surveyDataToSubmit,
            sessionId: flowData.sessionId,
            testData: flowData.testData || [],
            sessionData: flowData.sessionData || [],
            messages: flowData.messages || []
          }),
        });
        
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${await response.text()}`);
        }
        
        const result = await response.json();
        console.log("✅ Successfully submitted all data:", result);
        
        // Clear localStorage after successful submission
        if (typeof window !== 'undefined') {
          localStorage.removeItem('flowData');
          localStorage.removeItem('surveyData_backup');
        }
        
        // Mark as submitted but don't redirect to thank-you page
        setHasSubmitted(true);
      } else {
        // Create a fallback submission without survey data as last resort
        console.error("❌ No survey data found for submission - sending partial data");
        
        const response = await fetch('/api/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: flowData.userId,
            testId: flowData.testId,
            completedAt: new Date().toISOString(),
            questionResponses: flowData.questions || [],
            // Send empty survey data with error flag
            surveyData: { 
              error: "Survey data not found",
              recoveryAttempted: true,
              timestamp: new Date().toISOString()
            },
            sessionId: flowData.sessionId,
            // Add testData and sessionData arrays to the submission
            testData: flowData.testData || [],
            sessionData: flowData.sessionData || [],
            messages: flowData.messages || []
          }),
        });
        
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}: ${await response.text()}`);
        }
        
        const result = await response.json();
        console.log("⚠️ Submitted partial data (without survey):", result);
        
        // Mark as submitted but don't redirect to thank-you page
        setHasSubmitted(true);
      }
    } catch (error) {
      console.error("❌ Failed to submit data:", error);
      setSubmissionError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Memoize the context value to prevent unnecessary re-renders
  const value = useMemo(() => ({
    userId,
    currentStage,
    lessonType,
    lessonQuestionIndex,
    hitId,
    assignmentId,
    
    saveSessionData,
    saveTestData,
    saveSurveyData,
    
    agreeToTerms,
    completePreTest,
    completeLesson,
    completeTetrisBreak,
    completePostTest,
    completeFinalTest,
    resetFlow,
    submitAllDataToDatabase
  }), [
    currentStage,
    userId,
    lessonType,
    lessonQuestionIndex,
    hitId,
    assignmentId,
    flowData,
    completeLesson,
    completePreTest,
    completePostTest,
    completeFinalTest
  ]);
  
  return (
    <FlowContext.Provider value={value}>
      {children}
    </FlowContext.Provider>
  );
}