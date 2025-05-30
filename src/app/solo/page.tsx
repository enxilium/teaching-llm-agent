'use client'

import { useState, useEffect, useRef } from 'react';
import { useFlow } from '@/context/FlowContext';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';

// Helper function to process text with math expressions
const formatMathExpression = (text: string) => {
    if (!text) return text;
    
    // Handle explicit math delimiters
    if (text.includes('$')) {
        return text.split(/(\$.*?\$)/).map((part, index) => {
            if (part.startsWith('$') && part.endsWith('$')) {
                const mathExpression = part.slice(1, -1);
                return <InlineMath key={index} math={mathExpression} />;
            }
            return part;
        });
    }
    
    return text;
};

// Helper function to format time as MM:SS
const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
};

// Define the question type to include multiple choice options
interface Question {
    id: number;
    question: string;
    answer: string;
    options?: string[]; // Add options for multiple choice
    correctAnswer?: string; // Add correctAnswer property for consistency
}

export default function SoloPage() {
    const { completeLesson, lessonQuestionIndex, currentStage, userId, saveSessionData, lessonType } = useFlow();
    const [sessionStartTime] = useState<Date>(new Date());
    
    // Timer state
    const [timeElapsed, setTimeElapsed] = useState(0);
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const roundEndedRef = useRef(false);
    const startTimeRef = useRef<number | null>(null); // Add ref for stable time tracking
    
    // Add state for tracking if submit button can be enabled (after 10 seconds)
    const [canSubmit, setCanSubmit] = useState(false);
    const canSubmitRef = useRef(false);
    
    // Ensure user is in the proper flow stage
    useEffect(() => {
        if (currentStage !== 'lesson') {
            console.warn(`Warning: User accessed solo page in incorrect stage: ${currentStage}`);
            // Comment out to prevent loops
            // window.location.href = '/';
        }
    }, [currentStage]);
    
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
    const [scratchboardContent, setScratchboardContent] = useState('');
    const [finalAnswer, setFinalAnswer] = useState('');
    const [feedback, setFeedback] = useState<{visible: boolean, correct: boolean}>({
        visible: false, 
        correct: false
    });
    const [showingSolution, setShowingSolution] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [errors, setErrors] = useState<{work: boolean, answer: boolean}>({
        work: false,
        answer: false
    });
    
    // Timer functionality - count up until answer is submitted
    useEffect(() => {
        // Only start timer when question is loaded and feedback is not visible
        if (!currentQuestion || feedback.visible || roundEndedRef.current) return;

        console.log("Starting timer for question", currentQuestion.id);
        
        // Reset state at the start of a new timer
        setCanSubmit(false);
        canSubmitRef.current = false;
        
        // Reset time elapsed to 0
        setTimeElapsed(0);

        // Clear any existing timer
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        // Record the start time to calculate elapsed time more accurately
        startTimeRef.current = Date.now();
        
        // Set up new timer that increments every second
        timerRef.current = setInterval(() => {
            if (!startTimeRef.current) return;
            
            // Calculate elapsed time based on real time difference to avoid drift
            const elapsedSeconds = Math.floor((Date.now() - startTimeRef.current) / 1000);
            setTimeElapsed(elapsedSeconds);
            
            // Enable submit button after 10 seconds - only set it once
            if (elapsedSeconds >= 10 && !canSubmitRef.current) {
                console.log("10 seconds passed, enabling submit button", elapsedSeconds);
                canSubmitRef.current = true;
                setCanSubmit(true);
            }
        }, 1000); // Use a consistent 1000ms interval 

        // Use a single guaranteed timeout to enable the button after 10 seconds
        const enableSubmitTimeout = setTimeout(() => {
            console.log("Force enabling submit button after 10.5s timeout");
            canSubmitRef.current = true;
            setCanSubmit(true);
        }, 10500);

        // Clean up timer on unmount or when dependencies change
        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            clearTimeout(enableSubmitTimeout);
            startTimeRef.current = null; // Reset start time ref
        };
    }, [currentQuestion, feedback.visible]); // Remove timeElapsed from dependencies
    
    // Load the specific question based on lessonQuestionIndex
    useEffect(() => {
        const fetchQuestion = async () => {
            try {
                const response = await fetch('/questions.json');
                if (!response.ok) {
                    throw new Error('Failed to fetch questions');
                }

                const data = await response.json();
                
                // Get questions array
                const allQuestionsData = data.questions || [];
                
                // Use the predetermined lessonQuestionIndex from the flow context
                if (typeof lessonQuestionIndex === 'number' && 
                    lessonQuestionIndex >= 0 && 
                    lessonQuestionIndex < allQuestionsData.length) {
                    console.log(`Using predetermined lessonQuestionIndex: ${lessonQuestionIndex}`);
                    setCurrentQuestion(allQuestionsData[lessonQuestionIndex]);
                    setIsLoading(false);
                } else {
                    console.warn(`Invalid lessonQuestionIndex: ${lessonQuestionIndex}, using default question`);
                    if (allQuestionsData.length > 0) {
                        setCurrentQuestion(allQuestionsData[0]);
                        setIsLoading(false);
                    } else {
                        throw new Error('No questions available');
                    }
                }
            } catch (error) {
                console.error("Error loading question:", error);
                setIsLoading(false);
            }
        };
        
        fetchQuestion();
    }, [lessonQuestionIndex]);
    
    // Add a function to check answer correctness
    const checkAnswerCorrectness = (userAnswer: string, question: any): boolean => {
        if (!question) return false;
        
        // Check for correctAnswer first, then fall back to answer
        const correctAnswer = question.correctAnswer || question.answer;
        if (!correctAnswer) return false;
        
        // Simple string comparison for multiple choice options
        const normalizedUserAnswer = userAnswer.trim().toLowerCase();
        const normalizedCorrectAnswer = correctAnswer.trim().toLowerCase();
        
        return normalizedUserAnswer === normalizedCorrectAnswer;
    };

    // Modified saveSessionData function
    const saveSessionDataToFlow = async (finalAnswerText: string, isTimeout: boolean = false) => {
        console.log('Saving session data...');
        
        try {
            // Calculate session duration in seconds
            const endTime = new Date();
            const durationMs = endTime.getTime() - sessionStartTime.getTime();
            const durationSeconds = Math.floor(durationMs / 1000);
            
            // Get the question text
            const questionText = currentQuestion?.question || '';
            
            // Check if the answer is correct
            const isCorrect = checkAnswerCorrectness(finalAnswerText, currentQuestion);
            
            // Log details for debugging
            console.log(`💾 SOLO [Session Save] Saving session for question ${lessonQuestionIndex}`);
            console.log(`💾 SOLO [Session Save] finalAnswer: ${finalAnswerText}`);
            console.log(`💾 SOLO [Session Save] isCorrect: ${isCorrect}`);
            console.log(`💾 SOLO [Session Save] lessonType: ${lessonType}`);
            
            // Create the session data object
            const sessionDataObj = {
                questionId: lessonQuestionIndex, // Use the predetermined lessonQuestionIndex
                questionText,
                startTime: sessionStartTime,
                endTime,
                duration: durationSeconds,
                finalAnswer: finalAnswerText,
                scratchboardContent: scratchboardContent, // Store original content, empty or not
                messages: [], // Solo mode has no messages
                isCorrect,
                timeoutOccurred: isTimeout,
                lessonType: lessonType // Include the lessonType (scenario type)
            };
            
            // Save to flow context using the saveSessionData function
            saveSessionData(sessionDataObj);
            
            console.log(`✅ SOLO [Session Save] Data saved to flow context successfully for question ${lessonQuestionIndex}`);
            return true;
        } catch (error) {
            console.error(`❌ SOLO [Session Save] Error saving session data:`, error);
            return false;
        }
    };

    // Check answer and provide feedback
    const checkAnswer = () => {
        // Reset error state
        setErrors({work: false, answer: false});
        
        // Validate that an answer is provided
        if (!finalAnswer.trim()) {
            setErrors(prev => ({...prev, answer: true}));
            return;
        }
        
        if (!currentQuestion) return;
        
        // Stop the timer
        roundEndedRef.current = true;
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        
        // Normalize answers for comparison (trim whitespace, convert to lowercase)
        const normalizedUserAnswer = finalAnswer.trim().toLowerCase();
        const normalizedCorrectAnswer = currentQuestion.answer.trim().toLowerCase();
        
        // Check if the answer matches
        const isCorrect = normalizedUserAnswer === normalizedCorrectAnswer;
        
        // Show feedback
        setFeedback({
            visible: true,
            correct: isCorrect
        });
        
        // Save session data with more detailed logs
        console.log(`💾 SOLO [Check Answer] Saving data for question ID: ${currentQuestion.id}`);
        console.log(`💾 SOLO [Check Answer] Scratchboard content length: ${scratchboardContent.length}`);
        console.log(`💾 SOLO [Check Answer] Time taken: ${timeElapsed} seconds`);
        
        // Save session data immediately
        saveSessionDataToFlow(finalAnswer, false);

        // After a delay, allow continuing to the next stage
        setTimeout(() => {
            setShowingSolution(true);
        }, 1500);
    };
    
    // Handle final submission
    const handleFinishLesson = () => {
        // Log the session data before continuing to ensure it's properly saved
        console.log('💾 SOLO [Finish] Current flow stage:', currentStage);
        console.log('💾 SOLO [Finish] UserID:', userId);
        
        try {
            // Force create a backup of data to localStorage
            if (typeof window !== 'undefined') {
                const flowData = JSON.parse(localStorage.getItem('flowData') || '{}');
                console.log('💾 SOLO [Finish] Session data in flow context before continuing:', 
                    flowData.sessionData?.length || 0, 'sessions');
            }
        } catch (error) {
            console.error('Error checking flow data:', error);
        }
        
        // Continue to the next stage (tetris break) by directly calling completeLesson
        completeLesson();
    };

    // Auto-submit timeout answer
    const autoSubmitTimeoutAnswer = () => {
        // Add logging
        console.log('⏱️ SOLO [Auto Submit] Time limit reached, auto-submitting answer');
        
        // Stop the timer
        roundEndedRef.current = true;
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        
        const submissionText = finalAnswer || '';
        console.log(`⏱️ SOLO [Auto Submit] Final answer: "${submissionText}"`);
        console.log(`⏱️ SOLO [Auto Submit] Scratchboard content length: ${scratchboardContent.length}`);
        console.log(`⏱️ SOLO [Auto Submit] Time taken: ${timeElapsed} seconds`);
        
        // Make sure we have a valid question ID
        if (!currentQuestion) {
            console.error('❌ SOLO [Auto Submit] No current question found');
            return;
        }
        
        // Save session data with timeout flag
        saveSessionDataToFlow(submissionText, true);
        
        // Update UI to show timeout
        setFeedback({
            visible: true,
            correct: false
        });
        
        setTimeout(() => {
            setShowingSolution(true);
        }, 1500);
    };
    
    // If questions haven't loaded yet
    if (isLoading) {
        return (
            <div className="flex flex-col h-screen justify-center items-center bg-gradient-to-b from-[#2D0278] to-[#0A001D] text-white">
                <div className="text-2xl">Loading question...</div>
            </div>
        );
    }
    
    // Force enable submit after 10 seconds (safety check)
    const shouldEnableSubmit = timeElapsed >= 10 || canSubmit;
    if (timeElapsed >= 10 && !canSubmit) {
        console.log("Render check: Time is", timeElapsed, "but canSubmit is false. Should be enabled.");
    }
    
    return (
        <div className="h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4 flex flex-col overflow-hidden">
            <div className="w-full flex flex-col h-full overflow-hidden">
                {/* Problem Display with Timer */}
                {currentQuestion && (
                    <div className="bg-white bg-opacity-20 p-4 rounded-md mb-4 border-2 border-purple-400">
                        <div className="flex justify-between items-start mb-2">
                            <h2 className="text-xl text-white font-semibold">Problem:</h2>
                        </div>
                        <p className="text-white text-lg">{formatMathExpression(currentQuestion.question)}</p>
                    </div>
                )}

                {/* Feedback Message - displayed after submission */}
                {feedback.visible && (
                    <div className={`p-4 mb-4 rounded-lg border-2 ${
                        feedback.correct 
                        ? 'bg-green-900 bg-opacity-30 border-green-500' 
                        : 'bg-red-900 bg-opacity-30 border-red-500'
                    }`}>
                        <p className="text-white text-lg font-medium">
                            {feedback.correct 
                            ? 'Correct! Great job!' 
                            : 'Incorrect.'}
                        </p>
                        
                        {!feedback.correct && currentQuestion && (
                            <p className="text-white mt-2">
                                <span className="font-bold">Correct answer: </span> 
                                {formatMathExpression(currentQuestion.correctAnswer || currentQuestion.answer)}
                            </p>
                        )}
                    </div>
                )}

                {/* Final Answer Section */}
                <div className="bg-white bg-opacity-15 p-4 rounded-md mb-4 border border-blue-500 flex-shrink-0">
                    <h3 className="text-lg text-white font-semibold mb-2">Your Final Answer</h3>
                    
                    {/* Multiple Choice Selection */}
                    {currentQuestion && currentQuestion.options && (
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            {!feedback.visible ? (
                                currentQuestion.options.map((option, index) => (
                                    <div 
                                        key={index}
                                        onClick={() => !feedback.visible && setFinalAnswer(option)}
                                        className={`cursor-pointer p-3 rounded-md border-2 ${
                                            finalAnswer === option 
                                                ? 'bg-blue-500 bg-opacity-30 border-blue-500' 
                                                : 'bg-white bg-opacity-10 border-gray-600'
                                        }`}
                                    >
                                        <div className="flex items-center">
                                            <div className={`w-6 h-6 mr-2 rounded-full border-2 flex items-center justify-center ${
                                                finalAnswer === option 
                                                    ? 'border-blue-500 bg-blue-500 text-white' 
                                                    : 'border-gray-400'
                                            }`}>
                                                {finalAnswer === option && <span>✓</span>}
                                            </div>
                                            <div className="text-white">{formatMathExpression(option)}</div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                // After submission, show only the selected answer
                                <div className="p-3 rounded-md border-2 bg-blue-500 bg-opacity-30 border-blue-500">
                                    <div className="flex items-center">
                                        <div className="w-6 h-6 mr-2 rounded-full border-2 flex items-center justify-center border-blue-500 bg-blue-500 text-white">
                                            <span>✓</span>
                                        </div>
                                        <div className="text-white">{formatMathExpression(finalAnswer)}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Text Input for non-multiple choice questions */}
                    {(!currentQuestion || !currentQuestion.options) && (
                        <input
                            type="text"
                            value={finalAnswer}
                            onChange={(e) => {
                                setFinalAnswer(e.target.value);
                                if (e.target.value.trim()) {
                                    setErrors(prev => ({...prev, answer: false}));
                                }
                            }}
                            className={`w-full bg-white bg-opacity-10 text-white border rounded-md px-3 py-2 ${
                                errors.answer ? 'border-red-500' : 'border-gray-600'
                            }`}
                            placeholder="Enter your answer here..."
                            disabled={feedback.visible}
                        />
                    )}
                    
                    {/* Error message for answer */}
                    {errors.answer && 
                        <p className="text-red-400 text-xs mt-1">* You must provide an answer</p>
                    }
                    
                    {!feedback.visible ? (
                        <button
                            onClick={checkAnswer}
                            disabled={!finalAnswer.trim() || !shouldEnableSubmit}
                            className={`w-full mt-2 px-4 py-2 rounded-md font-medium ${
                                finalAnswer.trim() && shouldEnableSubmit
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                            {shouldEnableSubmit 
                                ? 'Submit Final Answer' 
                                : `Wait ${Math.max(1, 10 - timeElapsed)}s...`
                            }
                        </button>
                    ) : (
                        <button
                            onClick={handleFinishLesson}
                            className="w-full mt-2 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-md font-medium"
                        >
                            Continue
                        </button>
                    )}
                </div>

                {/* Scratchboard */}
                <div className="flex-1 border border-gray-600 rounded-md p-3 bg-black bg-opacity-30 overflow-auto">
                    <textarea
                        value={scratchboardContent}
                        onChange={(e) => setScratchboardContent(e.target.value)}
                        className="w-full h-[calc(100%-40px)] min-h-[200px] bg-black bg-opacity-40 text-white border-none rounded p-2"
                        placeholder="Space for scratch work..."
                        disabled={feedback.visible}
                    />
                </div>
            </div>
        </div>
    );
}