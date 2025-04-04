'use client'

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { nanoid } from 'nanoid';
import UserService from '@/services/UserService';

// Define flow stages
type FlowStage = 'terms' | 'pre-test' | 'lesson' | 'tetris-break' | 'post-test' | 'final-test' | 'completed';

// Define lesson types
type LessonType = 'group' | 'multi' | 'single' | 'solo';

// Define context type
interface FlowContextType {
    userId: string; // Add this
    currentStage: FlowStage;
    lessonType: LessonType;
    lessonQuestionIndex: number;
    
    // Stage completion methods
    agreeToTerms: () => void;
    completePreTest: () => void;
    completeLesson: () => void;
    completeTetrisBreak: () => void;
    completePostTest: () => void;
    completeFinalTest: () => void;
    resetFlow: () => void;
}

// Create context with default values
const FlowContext = createContext<FlowContextType>({
    userId: '', // Add this
    currentStage: 'terms',
    lessonType: 'solo',
    lessonQuestionIndex: 0,
    
    agreeToTerms: () => {},
    completePreTest: () => {},
    completeLesson: () => {},
    completeTetrisBreak: () => {},
    completePostTest: () => {},
    completeFinalTest: () => {},
    resetFlow: () => {},
});

// Create provider component
export function FlowProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();
    
    // State definitions with localStorage persistence
    const [userId, setUserId] = useState<string>('');
    const [currentStage, setCurrentStage] = useState<FlowStage>('terms');
    const [lessonType, setLessonType] = useState<LessonType>('solo');
    const [lessonQuestionIndex, setLessonQuestionIndex] = useState<number>(0);
    const [initialized, setInitialized] = useState(false);
    const [debugMode] = useState(true); // Enable debug mode
    
    // Add this debug function
    const logDebug = (message: string) => {
        if (debugMode) {
            console.log(`[FlowContext] ${message}`);
        }
    };
    
    // Update the initialization logic to properly handle defaults
    useEffect(() => {
        if (typeof window !== 'undefined') {
            try {
                logDebug("Initializing flow context...");
                
                // Get or create userId
                let savedUserId = localStorage.getItem('userId');
                if (!savedUserId) {
                    savedUserId = nanoid();
                    localStorage.setItem('userId', savedUserId);
                }
                setUserId(savedUserId);

                const savedStage = localStorage.getItem('currentStage') as FlowStage | null;
                const savedLessonType = localStorage.getItem('lessonType') as LessonType | null;
                const savedQuestionIndex = localStorage.getItem('lessonQuestionIndex');
                
                // Only use saved stage if it exists
                if (savedStage) {
                    logDebug(`Loading saved stage: ${savedStage}`);
                    setCurrentStage(savedStage);
                } else {
                    // Default to terms
                    logDebug('No saved stage found, defaulting to terms');
                    setCurrentStage('terms');
                }
                
                // Only use saved lesson type if it exists
                if (savedLessonType) {
                    logDebug(`Loading saved lesson type: ${savedLessonType}`);
                    setLessonType(savedLessonType);
                } else {
                    // Generate a random lesson type AND save it to localStorage
                    const lessonTypes: LessonType[] = ['group', 'multi', 'single', 'solo'];
                    const randomLessonType = lessonTypes[Math.floor(Math.random() * lessonTypes.length)];
                    logDebug(`Generating random lesson type: ${randomLessonType}`);
                    setLessonType(randomLessonType);
                    localStorage.setItem('lessonType', randomLessonType); // Save immediately
                }
                
                // Only use saved question index if it exists
                if (savedQuestionIndex !== null) {
                    logDebug(`Loading saved question index: ${savedQuestionIndex}`);
                    setLessonQuestionIndex(parseInt(savedQuestionIndex));
                } else {
                    // Generate a random question index
                    const randomQuestionIndex = Math.floor(Math.random() * 2);
                    logDebug(`Generating random question index: ${randomQuestionIndex}`);
                    setLessonQuestionIndex(randomQuestionIndex);
                    localStorage.setItem('lessonQuestionIndex', randomQuestionIndex.toString()); // Save immediately
                }
                
                // Sync with MongoDB
                if (savedUserId) {
                    UserService.createOrUpdateUser({
                        userId: savedUserId,
                        flowStage: savedStage || 'terms',
                        lessonType: savedLessonType || lessonType,
                        lessonQuestionIndex: savedQuestionIndex ? parseInt(savedQuestionIndex) : lessonQuestionIndex
                    }).catch(error => {
                        console.error("Error syncing user data:", error);
                    });
                }

                setInitialized(true);
            } catch (error) {
                console.error("Error loading flow state:", error);
                // Reset to defaults on error
                setCurrentStage('terms');
                // On error, still try to randomize the lesson type
                try {
                    const lessonTypes: LessonType[] = ['group', 'multi', 'single', 'solo'];
                    const randomLessonType = lessonTypes[Math.floor(Math.random() * lessonTypes.length)];
                    console.log(`Error recovery: setting random lesson type: ${randomLessonType}`);
                    setLessonType(randomLessonType);
                    localStorage.setItem('lessonType', randomLessonType);
                } catch (e) {
                    console.error("Failed to set random lesson type during error recovery");
                }
                setInitialized(true);
            }
        }
    }, []);
    
    // Update localStorage whenever state changes
    useEffect(() => {
        if (initialized && typeof window !== 'undefined') {
            localStorage.setItem('currentStage', currentStage);
            localStorage.setItem('lessonType', lessonType);
            localStorage.setItem('lessonQuestionIndex', lessonQuestionIndex.toString());
        }
    }, [currentStage, lessonType, lessonQuestionIndex, initialized]);
    
    // Reset flow state
    const resetFlow = () => {
        setCurrentStage('terms');
        localStorage.removeItem('currentStage');
        localStorage.removeItem('lessonType');
        localStorage.removeItem('lessonQuestionIndex');
        router.push('/');
    };
    
    // Stage transition methods
    const agreeToTerms = () => {
        // Update stage
        setCurrentStage('pre-test');
        
        // Save to localStorage
        if (typeof window !== 'undefined') {
            localStorage.setItem('currentStage', 'pre-test');
        }

        // Sync with MongoDB via API
        if (userId) {
            UserService.createOrUpdateUser({
                userId,
                flowStage: 'pre-test'
            }).catch(error => {
                console.error("Error syncing user data:", error);
            });
        }
        
        // Navigate
        setTimeout(() => {
            router.push('/test?stage=pre');
        }, 100);
    };
    
    const completePreTest = () => {
        // Update stage
        setCurrentStage('lesson');
        
        // Save to localStorage
        if (typeof window !== 'undefined') {
            localStorage.setItem('currentStage', 'lesson');
        }
        
        // Sync with MongoDB
        if (userId) {
            UserService.createOrUpdateUser({
                userId,
                flowStage: 'lesson'
            }).catch(error => {
                console.error("Error syncing user data:", error);
            });
        }
        
        // Navigate to appropriate lesson type
        setTimeout(() => {
            router.push(`/${lessonType}`);
        }, 100);
    };
    
    const completeLesson = () => {
        // Update stage
        setCurrentStage('tetris-break');
        
        // Save to localStorage
        if (typeof window !== 'undefined') {
            localStorage.setItem('currentStage', 'tetris-break');
        }
        
        // Sync with MongoDB
        if (userId) {
            UserService.createOrUpdateUser({
                userId,
                flowStage: 'tetris-break'
            }).catch(error => {
                console.error("Error syncing user data:", error);
            });
        }
        
        // Navigate
        setTimeout(() => {
            router.push('/break');
        }, 100);
    };
    
    const completeTetrisBreak = () => {
        // Update stage
        setCurrentStage('post-test');
        
        // Save to localStorage
        if (typeof window !== 'undefined') {
            localStorage.setItem('currentStage', 'post-test');
            // Force clear any captcha state
            localStorage.removeItem('captchaPassed');
        }
        
        // Sync with MongoDB
        if (userId) {
            UserService.createOrUpdateUser({
                userId,
                flowStage: 'post-test'
            }).catch(error => {
                console.error("Error syncing user data:", error);
            });
        }
        
        // Use router.replace instead of push to avoid history issues
        setTimeout(() => {
            router.replace('/test?stage=post');
        }, 100);
    };
    
    const completePostTest = () => {
        // Update stage
        setCurrentStage('final-test');
        
        // Save to localStorage
        if (typeof window !== 'undefined') {
            localStorage.setItem('currentStage', 'final-test');
        }
        
        // Sync with MongoDB
        if (userId) {
            UserService.createOrUpdateUser({
                userId,
                flowStage: 'final-test'
            }).catch(error => {
                console.error("Error syncing user data:", error);
            });
        }
        
        // Navigate
        setTimeout(() => {
            router.push('/test?stage=final');
        }, 100);
    };
    
    const completeFinalTest = () => {
        // Update stage
        setCurrentStage('completed');
        
        // Save to localStorage
        if (typeof window !== 'undefined') {
            // Clear any problematic state
            localStorage.removeItem('captchaPassed');
            // Set the completed stage
            localStorage.setItem('currentStage', 'completed');
        }
        
        // Sync with MongoDB
        if (userId) {
            UserService.createOrUpdateUser({
                userId,
                flowStage: 'completed'
            }).catch(error => {
                console.error("Error syncing user data:", error);
            });
        }
        
        // Use router.replace to avoid history issues
        setTimeout(() => {
            router.replace('/completed');
        }, 100);
    };
    
    // Context value
    const value = {
        userId, // Add userId to context value
        currentStage,
        lessonType,
        lessonQuestionIndex,
        
        agreeToTerms,
        completePreTest,
        completeLesson,
        completeTetrisBreak,
        completePostTest,
        completeFinalTest,
        resetFlow,
    };
    
    return (
        <FlowContext.Provider value={value}>
            {children}
        </FlowContext.Provider>
    );
}

// Create custom hook for using the context
export function useFlow() {
    const context = useContext(FlowContext);
    
    if (context === undefined) {
        throw new Error('useFlow must be used within a FlowProvider');
    }
    
    return context;
}