'use client'

import React, { createContext, useContext, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Define flow stages
type FlowStage = 'terms' | 'pre-test' | 'lesson' | 'tetris-break' | 'post-test' | 'final-test' | 'completed';

// Define lesson types
type LessonType = 'group' | 'multi' | 'single' | 'solo';

// Define context type
interface FlowContextType {
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
        // Explicitly update the stage first
        setCurrentStage('pre-test');
        
        // Force save to localStorage to ensure it's persisted immediately
        if (typeof window !== 'undefined') {
            localStorage.setItem('currentStage', 'pre-test');
        }
        
        // Add a slight delay before redirect to ensure state updates
        setTimeout(() => {
            router.push('/test?stage=pre');
        }, 100);
    };
    
    const completePreTest = () => {
        // Always generate a NEW random lesson type here, instead of using the existing one
        const lessonTypes: LessonType[] = ['group', 'multi', 'single', 'solo'];
        const randomLessonType = lessonTypes[Math.floor(Math.random() * lessonTypes.length)];
        console.log(`completePreTest: Generated random lesson type: ${randomLessonType}`);
        
        // Update state and localStorage
        setLessonType(randomLessonType);
        setCurrentStage('lesson');
        
        if (typeof window !== 'undefined') {
            localStorage.setItem('lessonType', randomLessonType);
            localStorage.setItem('currentStage', 'lesson');
        }
        
        // Use a short timeout to ensure state updates before navigation
        setTimeout(() => {
            console.log(`Navigating to lesson type: ${randomLessonType}`);
            router.push(`/${randomLessonType}`);
        }, 100);
    };
    
    const completeLesson = () => {
        setCurrentStage('tetris-break');
        
        if (typeof window !== 'undefined') {
            localStorage.setItem('currentStage', 'tetris-break');
        }
        
        setTimeout(() => {
            router.push('/break');
        }, 100);
    };
    
    const completeTetrisBreak = () => {
        setCurrentStage('post-test');
        
        if (typeof window !== 'undefined') {
            localStorage.setItem('currentStage', 'post-test');
            // Force clear any captcha state
            localStorage.removeItem('captchaPassed');
        }
        
        // Use router.replace instead of push to avoid history issues
        setTimeout(() => {
            router.replace('/test?stage=post');
        }, 100);
    };
    
    const completePostTest = () => {
        setCurrentStage('final-test');
        
        if (typeof window !== 'undefined') {
            localStorage.setItem('currentStage', 'final-test');
        }
        
        setTimeout(() => {
            router.push('/test?stage=final');
        }, 100);
    };
    
    const completeFinalTest = () => {
        setCurrentStage('completed');
        
        if (typeof window !== 'undefined') {
            // Clear any problematic state
            localStorage.removeItem('captchaPassed');
            // Set the completed stage
            localStorage.setItem('currentStage', 'completed');
        }
        
        // Use router.replace to avoid history issues
        setTimeout(() => {
            router.replace('/completed');
        }, 100);
    };
    
    // Context value
    const value = {
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