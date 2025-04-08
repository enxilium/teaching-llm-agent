'use client'

import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import UserService from '@/services/UserService';

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
}

// Test data structure
interface TestData {
  testType: 'pre' | 'post' | 'final';
  questions: TestQuestion[];
  score: number;
  completedAt: Date;
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
  currentStage: FlowStage;
  lessonType: LessonType | null;
  lessonQuestionIndex: number;
  sessionData: SessionData[];
  testData: TestData[];
  surveyData: SurveyData | null;
}

// Define context type
interface FlowContextType {
  userId: string;
  currentStage: FlowStage;
  lessonType: LessonType | null;
  lessonQuestionIndex: number;
  
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
  surveyData: null
};

// Create context with default values
const FlowContext = createContext<FlowContextType>({
  userId: '',
  currentStage: 'terms',
  lessonType: null,
  lessonQuestionIndex: 0,
  
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
  
  // Extract common values from flowData for easier access
  const { userId, currentStage, lessonType, lessonQuestionIndex } = flowData;
  
  // Clear flow and start fresh
  const resetFlow = () => {
    const newUserId = nanoid();
    const newFlowData: FlowData = {
      ...defaultFlowData,
      userId: newUserId,
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
  const saveSessionData = (sessionData: SessionData) => {
    setFlowData(prev => ({
      ...prev,
      sessionData: [...prev.sessionData, sessionData]
    }));
  };
  
  // Save test data method
  const saveTestData = (testData: any) => {
    console.log(`Saving ${testData.testType} test data with ${testData.questions?.length || 0} questions`);
    
    // Ensure proper data structure with non-empty userAnswer
    const normalizedTestData = {
      testType: (testData.testType === 'pre' || testData.testType === 'post' || testData.testType === 'final') 
        ? testData.testType 
        : 'pre', // Default to 'pre' if invalid type
      questions: Array.isArray(testData.questions) 
        ? testData.questions.map((q, index) => {
            // CRITICAL: Ensure userAnswer is NEVER empty
            let userAnswer = q.userAnswer;
            if (!userAnswer || typeof userAnswer !== 'string' || userAnswer.trim() === '') {
              userAnswer = "No answer provided";
            }
            
            return {
              questionId: q.questionId || index,
              question: typeof q.question === 'string' ? q.question : String(q.question || ''),
              userAnswer: userAnswer, // Now guaranteed to be non-empty
              correctAnswer: typeof q.correctAnswer === 'string' ? q.correctAnswer : String(q.correctAnswer || ''),
              isCorrect: Boolean(q.isCorrect)
            };
          }) 
        : [],
      score: typeof testData.score === 'number' ? testData.score : 0,
      completedAt: testData.completedAt || new Date()
    };
    
    // Check for duplicate test submissions
    const isDuplicate = flowData.testData.some(
      existingTest => existingTest.testType === normalizedTestData.testType
    );
    
    if (isDuplicate) {
      console.warn(`Duplicate ${normalizedTestData.testType} test submission detected, replacing previous data`);
      
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
    
    // Update localStorage
    setTimeout(() => {
      if (typeof window !== 'undefined') {
        const updatedFlowData = {
          ...flowData,
          testData: flowData.testData.filter(t => t.testType !== normalizedTestData.testType)
            .concat([normalizedTestData])
        };
        localStorage.setItem('flowData', JSON.stringify(updatedFlowData));
        console.log(`Updated localStorage with ${normalizedTestData.testType} test data`);
      }
    }, 0);
  };
  
  // Save survey data method
  const saveSurveyData = (surveyData: SurveyData) => {
    console.log("Saving survey data to flow context:", surveyData);
    
    // Add timestamp for tracking
    const surveyWithTimestamp = {
      ...surveyData,
      submittedAt: new Date().toISOString()
    };
    
    // Update the flow data with survey results
    setFlowData(prev => {
      const updated = {
        ...prev,
        surveyData: surveyWithTimestamp
      };
      
      // Also update localStorage to ensure data persistence
      if (typeof window !== 'undefined') {
        localStorage.setItem('flowData', JSON.stringify(updated));
      }
      
      return updated;
    });
    
    console.log("Survey data saved successfully");
  };
  
  // Stage transition methods
  const agreeToTerms = () => {
    setFlowData(prev => ({
      ...prev,
      currentStage: 'pre-test'
    }));
    
    router.push('/test?stage=pre');
  };
  
  const completePreTest = () => {
    // Select random lesson type
    const lessonTypes: LessonType[] = ['group', 'multi', 'single', 'solo'];
    const randomLessonType = lessonTypes[Math.floor(Math.random() * lessonTypes.length)];
    
    setFlowData(prev => ({
      ...prev,
      currentStage: 'lesson',
      lessonType: randomLessonType
    }));
    
    router.push(`/${randomLessonType}`);
  };
  
  const completeLesson = () => {
    console.log('Starting lesson completion transition...');
    
    // First update the state and localStorage synchronously
    setFlowData(prev => {
        const newData = {
            ...prev,
            currentStage: 'tetris-break' as FlowStage
        };
        
        // Immediately update localStorage to ensure consistency
        if (typeof window !== 'undefined') {
            localStorage.setItem('flowData', JSON.stringify(newData));
        }
        
        console.log('Flow state updated to tetris-break');
        return newData;
    });
    
    // Add a small delay to ensure state updates are fully committed
    setTimeout(() => {
        console.log('Navigating to break page...');
        router.push('/break');
    }, 100);
  };
  
  const completeTetrisBreak = () => {
    setFlowData(prev => ({
      ...prev,
      currentStage: 'post-test'
    }));
    
    router.push('/test?stage=post');
  };
  
  const completePostTest = () => {
    setFlowData(prev => ({
      ...prev,
      currentStage: 'final-test'
    }));
    
    router.push('/test?stage=final');
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

  // Update submitAllDataToDatabase to prevent duplicate session submissions
  const submitAllDataToDatabase = async () => {
    console.log("submitAllDataToDatabase called - submitting all flow data to database");
    
    try {
      // 1. Create permanent user
      console.log("Step 1: Creating permanent user record");
      await UserService.createOrUpdateUser({
        userId,
        flowStage: 'completed',
        lessonType: lessonType ?? undefined,
        lessonQuestionIndex,
        tempRecord: false
      });
      
      // 2. Submit all sessions - CHECK FOR DUPLICATES first
      if (flowData.sessionData.length > 0) {
        console.log(`Step 2: Checking for ${flowData.sessionData.length} sessions to submit`);
        
        // Track which questionIds we've already processed to avoid duplicates
        const processedQuestionIds = new Set();
        
        for (const session of flowData.sessionData) {
          // Skip if we've already processed this questionId
          if (processedQuestionIds.has(session.questionId)) {
            console.log(`Skipping duplicate session for questionId: ${session.questionId}`);
            continue;
          }
          
          // Mark this questionId as processed
          processedQuestionIds.add(session.questionId);
          
          try {
            console.log(`Submitting session for question ${session.questionId}`);
            const response = await fetch('/api/sessions', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...session,
                userId,
                tempRecord: false // Mark as permanent
              })
            });
            
            if (!response.ok) {
              throw new Error(`HTTP Error ${response.status}: ${response.statusText}`);
            }
            
            const result = await response.json();
            console.log(`Session saved with ID: ${result.sessionId || 'unknown'}`);
          } catch (error) {
            console.error(`Error submitting session for question ${session.questionId}:`, error);
            // Continue with other submissions even if one fails
          }
        }
      }
      
      // 3. Submit all test results with IMPROVED VALIDATION
      if (flowData.testData.length > 0) {
        console.log(`Step 3: Submitting ${flowData.testData.length} test records`);
        
        for (const test of flowData.testData) {
          try {
            console.log(`Submitting ${test.testType} test`);
            const response = await fetch('/api/tests', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...test,
                userId // Add userId here when sending to API
              })
            });
            
            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(`HTTP Error ${response.status}: ${errorText}`);
            }
            
            const result = await response.json();
            console.log(`${test.testType} test saved successfully, ID: ${result.testId || 'unknown'}`);
          } catch (error) {
            console.error(`Error submitting ${test.testType} test:`, error);
            // Continue with other submissions even if one fails
          }
        }
      }
      
      // 4. Submit final survey data
      if (flowData.surveyData) {
        console.log("Step 4: Submitting survey data:", flowData.surveyData);
        
        try {
          const response = await fetch('/api/submit-survey', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId,
              section: 'post-test',
              data: flowData.surveyData
            })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP Error ${response.status}: ${errorText}`);
          }
          
          console.log("Survey data successfully submitted");
        } catch (error) {
          console.error("Error submitting survey data:", error);
          // Log more details about the error
          if (error instanceof Error) {
            console.error("Error details:", error.message);
          }
        }
      } else {
        console.warn("No survey data found in flow context - did you complete the survey?");
      }
      
      console.log("All data successfully submitted to database");
      
    } catch (error) {
      console.error("Error in submitAllDataToDatabase:", error);
    }
  };

  // Context value
  const contextValue = useMemo(
    () => ({
      userId,
      currentStage,
      lessonType,
      lessonQuestionIndex,
      
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
    }),
    [
      currentStage,
      userId,
      lessonType,
      lessonQuestionIndex,
      flowData,
      completeLesson,
      completePreTest,
      completePostTest,
      completeFinalTest
    ]
  );
  
  return (
    <FlowContext.Provider value={contextValue}>
      {children}
    </FlowContext.Provider>
  );
}