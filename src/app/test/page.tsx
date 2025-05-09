'use client'

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFlow } from '@/context/FlowContext';
import ReactMarkdown from 'react-markdown';
// Add KaTeX for math formatting
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';
import TestService from '@/services/TestService';
import { v4 as uuidv4 } from 'uuid';

// Define raw question structure from JSON
interface RawQuestion {
    id: number;
    question: string;
    options?: Record<string, string>;
    correctAnswer?: string;
}

// Define test questions structure
interface TestQuestion {
    questionId: number;
    question: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    scratchboardContent?: string;
    duration: number;
    options?: Record<string, string | number>;
}

interface TestData {
    testType: 'pre' | 'post' | 'final';
    questions: TestQuestion[];
    score: number;
    completedAt: Date;
    submissionId: string;
    timeoutOccurred?: boolean;
    duration: number;
}

// Helper function to process text with math expressions - simplified version
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

// Create a component to safely use search params
function TestContent() {
    const searchParams = useSearchParams();
    const testStage = searchParams?.get('stage') || 'pre'; // Default to pre-test
    
    // Get flow context
    const { 
        completePreTest, 
        completePostTest, 
        completeFinalTest,
        lessonQuestionIndex,
        currentStage,
        userId,
        saveTestData,
        testQuestionIndex
    } = useFlow();

    // Timer state - changed from timeLeft to timeElapsed for counting up
    const [timeElapsed, setTimeElapsed] = useState(0); 
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const roundEndedRef = useRef(false);

    // Question state
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [allQuestions, setAllQuestions] = useState<RawQuestion[]>([]);
    const [selectedQuestions, setSelectedQuestions] = useState<RawQuestion[]>([]);
    const [userAnswers, setUserAnswers] = useState<string[]>([]);
    const [currentAnswer, setCurrentAnswer] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [workingSpace, setWorkingSpace] = useState<Record<number, string>>({});
    const [testComplete, setTestComplete] = useState(false);
    const workingSpaceRef = useRef<HTMLTextAreaElement>(null);
    const [allQuestionsAnswered, setAllQuestionsAnswered] = useState(false);
    const answersRef = useRef<string[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errors, setErrors] = useState<{ work?: boolean }>({});
    const [hasSubmittedTest, setHasSubmittedTest] = useState(false);
    // Add state to track if enough time has elapsed for submission
    const [canSubmit, setCanSubmit] = useState(false);

    // Add start time tracking
    const [startTime, setStartTime] = useState<Date | null>(null);

    // Add canSubmitRef to ensure consistent tracking
    const canSubmitRef = useRef(false);

    // Update this useEffect to reset BOTH flags
    useEffect(() => {
        // Reset ALL submission states whenever test stage changes
        setIsSubmitting(false);
        setHasSubmittedTest(false); // CRITICAL: Also reset the hasSubmittedTest flag
        setCurrentQuestionIndex(0); // Reset the question index
        
        console.log(`Test stage changed to ${testStage}, resetting ALL submission states and question index`);
        
        // Also ensure we're working with the correct stage
        console.log(`Current test stage: ${testStage}, Flow context stage: ${currentStage}`);
        
        // Clear any stuck submission timeout timers
        const safetyCleanup = setTimeout(() => {
            setIsSubmitting(false);
            setHasSubmittedTest(false);
        }, 1000);
        
        return () => clearTimeout(safetyCleanup);
    }, [testStage, currentStage]);

    // Also add this debugging effect to show submission state changes
    useEffect(() => {
        console.log(`Submission state changed - isSubmitting: ${isSubmitting}, hasSubmittedTest: ${hasSubmittedTest}`);
    }, [isSubmitting, hasSubmittedTest]);

    // Update the flow protection section:

    // Remove the restrictive flow check that's causing the loop
    useEffect(() => {
        // Debug output instead of redirect
        console.log("Test page loaded with stage:", testStage, "Current flow stage:", currentStage);
        
        // NO redirect - let's disable this check temporarily to break the loop
        // Later we can add it back with better logic
    }, [testStage, currentStage]);

    // Format time function - same logic works for elapsed time too
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    // Save answer function with proper array handling
    const saveAnswer = (index: number, answer: string) => {
        console.log(`Saving answer for question ${index + 1}: "${answer}"`);
        
        // Create a properly sized array
        let updatedAnswers: string[];

        if (userAnswers.length === 0 && selectedQuestions.length > 0) {
            updatedAnswers = new Array(selectedQuestions.length).fill('');
        } else if (userAnswers.length < selectedQuestions.length) {
            updatedAnswers = new Array(selectedQuestions.length).fill('');
            userAnswers.forEach((ans, i) => {
                updatedAnswers[i] = ans;
            });
        } else {
            updatedAnswers = [...userAnswers];
        }

        updatedAnswers[index] = answer;
        setUserAnswers(updatedAnswers);
        answersRef.current = updatedAnswers;
        return updatedAnswers;
    };

    // Initialize user answers array
    useEffect(() => {
        if (selectedQuestions.length > 0 && (userAnswers.length === 0 || userAnswers.length !== selectedQuestions.length)) {
            const newAnswers = new Array(selectedQuestions.length).fill('');
            
            if (userAnswers.length > 0) {
                userAnswers.forEach((ans, idx) => {
                    if (idx < newAnswers.length) {
                        newAnswers[idx] = ans;
                    }
                });
            }
            
            setUserAnswers(newAnswers);
            answersRef.current = newAnswers;
        }
    }, [selectedQuestions, userAnswers.length]);

    // Reset timer when changing questions - now reset to 0 for counting up
    useEffect(() => {
        // Only reset timer for final tests
        if (testStage === 'final') {
            setTimeElapsed(0);
        }
        
        roundEndedRef.current = false;

        if (answersRef.current && answersRef.current[currentQuestionIndex]) {
            setCurrentAnswer(answersRef.current[currentQuestionIndex]);
        } else {
            setCurrentAnswer('');
        }
    }, [currentQuestionIndex, testStage]);

    // First, let's add the getRandomIndices function if it doesn't exist already
    const getRandomIndices = (max: number, count: number): number[] => {
        // Create array of all possible indices
        const allIndices = Array.from({ length: max }, (_, i) => i);
        
        // Shuffle array and take first 'count' elements
        for (let i = allIndices.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [allIndices[i], allIndices[j]] = [allIndices[j], allIndices[i]];
        }
        
        return allIndices.slice(0, count);
    };

    // Now update the loadQuestions function in the useEffect to use the selectQuestionForStage
    useEffect(() => {
        const loadQuestions = async () => {
            try {
                let questionsToLoad: RawQuestion[] = [];
                
                // Record the start time
                setStartTime(new Date());
                
                // Determine which question source to use based on test stage
                const questionSource = testStage === 'final' ? '/questions.json' : '/test-questions.json';
                console.log(`Loading questions from ${questionSource} for ${testStage} test`);
                
                // Reset UI state for new test stage
                setCurrentQuestionIndex(0);
                console.log(`Reset currentQuestionIndex to 0 for ${testStage} test`);
                
                // Load questions from appropriate source
                const response = await fetch(questionSource);
                if (!response.ok) {
                    throw new Error(`Failed to load questions from ${questionSource}`);
                }
                
                const data = await response.json();
                
                if (data && data.questions) {
                    const allAvailableQuestions = data.questions;
                    setAllQuestions(allAvailableQuestions);
                    
                    // Use selectQuestionForStage to determine which questions to show
                    const selectedQuestions = selectQuestionForStage(allAvailableQuestions);
                    questionsToLoad = selectedQuestions;
                    
                    // Store the selected questions in state
                    setSelectedQuestions(selectedQuestions);
                    
                    // Initialize user answers array
                    const initialAnswers = new Array(questionsToLoad.length).fill('');
                    setUserAnswers(initialAnswers);
                    answersRef.current = initialAnswers;
                    
                    console.log(`Loaded ${questionsToLoad.length} questions for ${testStage} test`);
                    console.log(`Selected questions: ${JSON.stringify(selectedQuestions.map(q => q.id))}`);
                    setIsLoading(false);
                }
            } catch (error) {
                console.error('Error loading questions:', error);
                setIsLoading(false);
            }
        };
        
        loadQuestions();
    }, [testStage, testQuestionIndex]);

    // Implement the selectQuestionForStage function to use testQuestionIndex for final tests
    const selectQuestionForStage = (questionPool: RawQuestion[]): RawQuestion[] => {
        let selectedIndices: number[] = [];
        
        console.log(`Selecting questions for stage: ${testStage}, total available: ${questionPool.length}`);
        
        if (testStage === 'pre' || testStage === 'post') {
            // For pre and post tests, use questions from test-questions.json
            // We can use all questions or select a subset
            const questionCount = Math.min(5, questionPool.length); // Use at most 5 questions
            selectedIndices = getRandomIndices(questionPool.length, questionCount);
            console.log(`Selected ${questionCount} random questions for ${testStage} test: indices ${selectedIndices.join(', ')}`);
        } else if (testStage === 'final') {
            // For final test, use the predetermined testQuestionIndex from flow context
            // and the questions.json file
            const mappedIndex = testQuestionIndex % questionPool.length;
            selectedIndices = [mappedIndex];
            console.log(`Using predetermined test question index: ${testQuestionIndex} (mapped to ${mappedIndex}) for final test`);
            console.log(`Question pool size: ${questionPool.length}, selected question: ${JSON.stringify(questionPool[mappedIndex])}`);
        }
        
        // Map selected indices to actual questions
        const result = selectedIndices.map(index => questionPool[index]);
        console.log(`Returning ${result.length} selected questions`);
        return result;
    };

    // Updated handleTestCompletion to use elapsed time
    const handleTestCompletion = async () => {
        if (isSubmitting || hasSubmittedTest) return;
        setIsSubmitting(true);
        setHasSubmittedTest(true);

        // Stop the timer
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        console.log("Test completed, preparing submission...");

        try {
            // Get the final answers array
            const finalAnswers = [...answersRef.current];
            while (finalAnswers.length < selectedQuestions.length) {
                finalAnswers.push("NO ANSWER");
            }

            const testQuestions: TestQuestion[] = selectedQuestions.map((q, i) => {
                const userAnswer = finalAnswers[i] || "NO ANSWER";
                
                // Check if the correct answer is a single letter (A, B, C, D)
                const isLetterFormat = q.correctAnswer && /^[A-D]$/.test(q.correctAnswer);
                
                let isCorrect = false;
                
                if (isLetterFormat) {
                    // If correctAnswer is a letter, directly compare with user's answer
                    // which should also be a letter for pre/post tests
                    isCorrect = userAnswer.trim().toLowerCase() === (q.correctAnswer || '').trim().toLowerCase();
                    console.log(`Letter comparison: User answered "${userAnswer}" vs correct "${q.correctAnswer}" -> ${isCorrect}`);
                } else {
                    // For value-based comparison (like final test), normalize and compare values
                    const normalizedUserAnswer = userAnswer.trim().toLowerCase();
                    const normalizedCorrectAnswer = (q.correctAnswer || '').trim().toLowerCase();
                    isCorrect = normalizedUserAnswer === normalizedCorrectAnswer;
                    console.log(`Value comparison: User answered "${userAnswer}" vs correct "${q.correctAnswer}" -> ${isCorrect}`);
                }
                
                // For storing in the database, always include the actual content value if possible
                // This ensures consistent data format for both letter-based and value-based answers
                let userAnswerValue = userAnswer;
                if (isLetterFormat && q.options && userAnswer && q.options[userAnswer]) {
                    // If letter format and we have the option value, store the actual text value too
                    userAnswerValue = q.options[userAnswer] as string;
                    console.log(`Storing option value "${userAnswerValue}" for letter answer "${userAnswer}"`);
                }
                
                return {
                    questionId: q.id,
                    question: q.question,
                    userAnswer: userAnswerValue,
                    correctAnswer: q.correctAnswer || '',
                    isCorrect,
                    scratchboardContent: workingSpace[q.id] || '',
                    // Only track duration for final test, set to 0 for pre/post tests
                    duration: testStage === 'final' ? timeElapsed : 0
                };
            });

            // Update the score calculation based on the mapped questions
            const score = testQuestions.filter(q => q.isCorrect).length / testQuestions.length * 100;

            const testData: TestData = {
                testType: testStage as 'pre' | 'post' | 'final',
                questions: testQuestions,
                score: Math.round(score),
                completedAt: new Date(),
                submissionId: uuidv4(),
                // Only track duration for final test, set to 0 for pre/post tests
                duration: testStage === 'final' ? timeElapsed : 0
            };

            // Save the test data via the Flow context
            console.log("Saving test data via Flow context:", testData);
            saveTestData(testData);

            // Call the appropriate completion function
            switch (testStage) {
                case 'pre':
                    completePreTest();
                    break;
                case 'post':
                    completePostTest();
                    break;
                case 'final':
                    completeFinalTest();
                    break;
                default:
                    console.error("Unknown test stage:", testStage);
            }

            setTestComplete(true);
        } catch (error) {
            console.error("Error handling test completion:", error);
            setIsSubmitting(false);
            setHasSubmittedTest(false);
        }
    };

    // Helper to calculate score consistently using the same comparison method
    const calculateScore = (questions: RawQuestion[], answers: string[]) => {
        const correctCount = questions.filter((q: RawQuestion, i: number) => {
            const userAnswer = answers[i] || '';
            
            // Check if the correct answer is a single letter (A, B, C, D)
            const isLetterFormat = q.correctAnswer && /^[A-D]$/.test(q.correctAnswer);
            
            if (isLetterFormat) {
                // If correctAnswer is a letter, directly compare with user's answer
                return userAnswer.trim().toLowerCase() === (q.correctAnswer || '').trim().toLowerCase();
            } else {
                // For value-based comparison, normalize and compare values
                const normalizedUserAnswer = userAnswer.trim().toLowerCase();
                const normalizedCorrectAnswer = (q.correctAnswer || '').trim().toLowerCase();
                return normalizedUserAnswer === normalizedCorrectAnswer;
            }
        }).length;
        
        return Math.round((correctCount / questions.length) * 100);
    };

    // Improved handleSubmitAnswer function that handles different test types appropriately
    const handleSubmitAnswer = () => {
        // Prevent resubmission if already submitting
        if (isSubmitting) {
            console.log("Already submitting, ignoring click");
            return;
        }

        console.log(`Submitting answer for ${testStage} test, question ${currentQuestionIndex + 1}`);
        setIsSubmitting(true);

        // Save the current answer to the userAnswers array
        answersRef.current[currentQuestionIndex] = currentAnswer;
        setUserAnswers([...answersRef.current]);
        console.log(`Answer for question ${currentQuestionIndex + 1} saved:`, currentAnswer);

        // Only validate scratchboard content for final test
        const scratchboardContent = workingSpace[currentQuestion?.id || 0] || "";
        if (testStage === 'final' && !scratchboardContent.trim()) {
            console.log("Final test requires work to be shown - validation failed");
            setErrors(prev => ({ ...prev, work: true }));
            setIsSubmitting(false);
            return;
        }

        // Clear any errors if validation passes
        if (errors.work) {
            setErrors(prev => ({ ...prev, work: false }));
        }

        // Handle next question or completion
        if (currentQuestionIndex < selectedQuestions.length - 1) {
            console.log(`Advancing to question ${currentQuestionIndex + 2}`);
            setCurrentQuestionIndex(currentQuestionIndex + 1);
            setTimeout(() => setIsSubmitting(false), 500);
        } else {
            console.log("All questions answered, completing test");
            // Use handleTestCompletion for consistency across all test types
            handleTestCompletion();
        }
    };

    // Modified timer effect to count up for final test
    useEffect(() => {
        // Only run timer for final test questions
        if (testStage !== 'final' || roundEndedRef.current || hasSubmittedTest) return;

        // Reset can submit state when a new question is loaded
        if (canSubmitRef.current !== false) {
            console.log("Resetting canSubmit state for new question");
        }
        canSubmitRef.current = false;
        setCanSubmit(false);

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        // Record the start time to calculate time elapsed more accurately
        const startTimeMs = Date.now();
        
        timerRef.current = setInterval(() => {
            // Calculate elapsed time based on real time difference to avoid drift
            const elapsedSeconds = Math.floor((Date.now() - startTimeMs) / 1000);
            setTimeElapsed(elapsedSeconds);
            
            // Enable submit button after 10 seconds - only set it once
            if (elapsedSeconds >= 10 && !canSubmitRef.current) {
                console.log("10 seconds passed, enabling submit button permanently");
                canSubmitRef.current = true;
                setCanSubmit(true);
            }
        }, 500); // Use a smaller interval for smoother updates

        // Use a guaranteed timeout to enable the button after 10 seconds
        const enableSubmitTimeout = setTimeout(() => {
            console.log("Force enabling submit button after timeout");
            canSubmitRef.current = true;
            setCanSubmit(true);
        }, 10500);

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            clearTimeout(enableSubmitTimeout);
        };
    }, [currentQuestionIndex, testStage, selectedQuestions, hasSubmittedTest]);

    // Add an effect to keep canSubmit true once it's set (for this question)
    useEffect(() => {
        if (canSubmitRef.current && !canSubmit) {
            console.log("Forcing canSubmit to remain true");
            setCanSubmit(true);
        }
    }, [canSubmit]);

    // Handle option selection for multiple choice
    const handleOptionSelect = (optionKey: string) => {
        console.log(`Option selected for question ${currentQuestionIndex + 1}: ${optionKey}`);
        
        // Get the option value
        const optionValue = currentQuestion?.options?.[optionKey] || optionKey;
        console.log(`Option value: ${optionValue}`);
        
        // For pre-test and post-test, we need to handle both formats:
        // 1) Store the actual text value for comparison with correctAnswer when it's a full value
        // 2) Store the option key (A, B, C, D) when correctAnswer is a letter 
        
        // Check if the correct answer is a single letter (A, B, C, D)
        const isLetterFormat = currentQuestion?.correctAnswer && 
                             /^[A-D]$/.test(currentQuestion.correctAnswer);
        
        // For letter format answers (most pre/post test questions), store the key
        // Otherwise store the actual value (for value-based comparison)
        const valueToStore = isLetterFormat ? optionKey : optionValue;
        
        console.log(`Storing answer as: "${valueToStore}" (${isLetterFormat ? 'letter format' : 'value format'})`);
        
        // Store the appropriate value based on the correct answer format
        setCurrentAnswer(valueToStore);
        
        // Immediately save to answersRef to ensure it's not lost
        answersRef.current[currentQuestionIndex] = valueToStore;
    };

    // Get current question
    const currentQuestion = selectedQuestions[currentQuestionIndex];
    
    // Add debug output for index
    useEffect(() => {
        console.log(`Current question index: ${currentQuestionIndex}, selected questions length: ${selectedQuestions.length}`);
        if (currentQuestion) {
            console.log(`Current question: ${JSON.stringify(currentQuestion)}`);
        } else {
            console.warn('Current question is undefined!');
        }
    }, [currentQuestionIndex, selectedQuestions]);

    // Add an effect to log answers for debugging
    useEffect(() => {
        if (currentAnswer) {
            console.log(`Current answer set to: "${currentAnswer}"`);
            console.log(`Current answers in ref:`, answersRef.current);
        }
    }, [currentAnswer]);

    // Loading state
    if (isLoading) {
        return (
            <div className="flex flex-col h-screen justify-center items-center bg-gray-900 text-white">
                <div className="text-2xl">Loading questions...</div>
            </div>
        );
    }

    // Get the appropriate title based on test stage
    const getTestTitle = () => {
        switch(testStage) {
            case 'pre': return 'Pre-Test Assessment';
            case 'post': return 'Post-Test Assessment';
            case 'final': return 'Final Test';
            default: return 'Assessment';
        }
    };

    // Function to manually reset stuck state
    const resetStuckState = () => {
        console.log("Manual reset of stuck state triggered");
        
        // Force enable the submit button
        canSubmitRef.current = true;
        setCanSubmit(true);
        
        // Reset submission flags
        setIsSubmitting(false);
        setHasSubmittedTest(false);
        
        // Clear and restart timer if needed
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
        
        // Set a minimum elapsed time to ensure the button becomes enabled
        if (timeElapsed < 10) {
            setTimeElapsed(10);
        }
        
        // Add console debugging
        console.log("Reset complete - state after reset:", {
            canSubmit: true,
            isSubmitting: false,
            hasSubmittedTest: false,
            timeElapsed: Math.max(10, timeElapsed)
        });
    };

    const handleSubmitFinalTest = () => {
        console.log("Final test submit button clicked");
        
        // Force enable button in case it's still disabled
        canSubmitRef.current = true;
        setCanSubmit(true);
        
        // Add a flag to prevent double-clicks
        if (isSubmitting) {
            console.log("Already submitting, ignoring click");
            return;
        }
        
        // Indicate submission is in progress
        console.log("Starting final test submission process");
        setIsSubmitting(true);
        
        // Instead of handling submission separately, use the handleTestCompletion function
        // which properly handles saving test data with the correct duration
        handleTestCompletion();
        
        // Add a fallback safety timeout to ensure UI resets if navigation doesn't happen
        setTimeout(() => {
            console.log("Safety timeout: resetting submission state");
            setIsSubmitting(false);
            setHasSubmittedTest(false);
        }, 5000);
    };

    return (
        <div className="flex flex-col h-screen bg-gray-900">
            <div className="bg-gradient-to-b from-[#2D0278] to-[#0A001D] min-h-screen p-8">
                <div className="max-w-4xl mx-auto">
                    {/* Header with embedded timer */}
                    <div className="bg-white bg-opacity-10 rounded-lg p-6 mb-6">
                        <div className="flex justify-between items-center">
                            <div>
                                <h1 className="text-3xl text-white font-bold">Exponents</h1>
                                <p className="text-white mt-2">
                                    Question {currentQuestionIndex + 1} of {selectedQuestions.length || 1}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Debug button in development mode */}
                    {process.env.NODE_ENV === 'development' && (
                        <div className="fixed bottom-2 right-2 z-50 flex flex-col items-end space-y-1">
                            <div className="bg-black bg-opacity-70 text-white text-xs px-2 py-1 rounded">
                                <span>canSubmit: {canSubmit ? 'true' : 'false'} | </span>
                                <span>isSubmitting: {isSubmitting ? 'true' : 'false'} | </span>
                                <span>time: {timeElapsed}s</span>
                            </div>
                            <button 
                                onClick={resetStuckState}
                                className="bg-red-600 text-white text-xs px-2 py-1 rounded opacity-90 hover:opacity-100"
                            >
                                Reset UI
                            </button>
                        </div>
                    )}

                    {/* Question Content */}
                    <div className="bg-white bg-opacity-10 rounded-lg p-6 mb-6">
                        <h2 className="text-xl text-white font-bold mb-4">
                            {formatMathExpression(currentQuestion?.question || "Loading question...")}
                        </h2>

                        {/* Multiple Choice Options */}
                        {currentQuestion?.options && (
                            <div className="mb-6">
                                <h3 className="text-white font-medium mb-3">Select your answer:</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    {Object.entries(currentQuestion.options).map(([key, value]) => (
                                        <button
                                            key={key}
                                            onClick={() => handleOptionSelect(key)}
                                            className={`p-3 rounded-lg text-left flex items-start ${
                                                // Check if the current option value matches the selected answer
                                                currentAnswer === value 
                                                ? 'bg-purple-700 border-2 border-purple-400' 
                                                : 'bg-white bg-opacity-10 border border-gray-600 hover:bg-opacity-20'
                                            } text-white`}
                                        >
                                            <span className="font-bold mr-2">{key}:</span> 
                                            <span>{typeof value === 'string' ? 
                                                (value.includes('$') || value.match(/[⁰¹²³⁴⁵⁶⁷⁸⁹ᵐⁿ⁄√]/) ? 
                                                    formatMathExpression(value) : value) : 
                                                value}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        {/* Free-form Answer if no options */}
                        {!currentQuestion?.options && (
                            <div className="mb-6">
                                <label className="block text-white text-sm mb-2">
                                    Your Answer:
                                </label>
                                <input
                                    type="text"
                                    value={currentAnswer}
                                    onChange={(e) => setCurrentAnswer(e.target.value)}
                                    className="w-full bg-white bg-opacity-10 text-white border border-gray-600 rounded-lg p-3"
                                    placeholder="Enter your answer..."
                                />
                            </div>
                        )}
                        
                        {/* Scratchpad - moved below answer options and renamed */}
                        <div className="mb-6">
                            <textarea
                                ref={workingSpaceRef}
                                value={workingSpace[currentQuestion?.id || 0] || ""}
                                onChange={(e) => setWorkingSpace({
                                    ...workingSpace,
                                    [currentQuestion?.id || 0]: e.target.value
                                })}
                                className="w-full h-48 bg-white bg-opacity-10 text-white border border-gray-600 rounded-lg p-3 resize-none"
                                placeholder="Space for scratch work..."
                            />
                        </div>

                        {/* Update the submit button for final test */}
                        <div className="flex justify-between mt-6">
                            {currentQuestionIndex > 0 && (
                                <button
                                    onClick={() => {
                                        if (!isSubmitting) {
                                            setCurrentQuestionIndex(currentQuestionIndex - 1);
                                        }
                                    }}
                                    disabled={isSubmitting}
                                    className="bg-white bg-opacity-10 px-6 py-3 rounded-lg text-white hover:bg-opacity-20 disabled:opacity-50"
                                >
                                    Previous
                                </button>
                            )}
                            
                            <div className="ml-auto flex space-x-4">
                                {currentQuestionIndex < selectedQuestions.length - 1 ? (
                                    <button
                                        onClick={handleSubmitAnswer}
                                        disabled={
                                          isSubmitting || 
                                          !currentAnswer.trim() || 
                                          (testStage === 'final' && !canSubmit)
                                        }
                                        className={`bg-green-600 px-6 py-3 rounded-lg text-white font-bold hover:bg-green-700 
                                            ${(isSubmitting || 
                                              !currentAnswer.trim() || 
                                              (testStage === 'final' && !canSubmit)) 
                                              ? 'opacity-50 cursor-not-allowed' 
                                              : ''}`}
                                    >
                                        {testStage === 'final' && !canSubmit 
                                            ? `Wait ${Math.max(1, 10 - timeElapsed)}s...` 
                                            : 'Next Question'}
                                    </button>
                                ) : (
                                    <button
                                        onClick={testStage === 'final' ? handleSubmitFinalTest : handleSubmitAnswer}
                                        disabled={
                                          isSubmitting || 
                                          !currentAnswer.trim() || 
                                          (testStage === 'final' && !canSubmit)
                                        }
                                        className={`bg-purple-600 px-6 py-3 rounded-lg text-white font-bold hover:bg-purple-700 
                                            ${(isSubmitting || 
                                              !currentAnswer.trim() || 
                                              (testStage === 'final' && !canSubmit)) 
                                              ? 'opacity-50 cursor-not-allowed' 
                                              : ''}`}
                                    >
                                        {testStage === 'final' && !canSubmit 
                                            ? `Wait ${Math.max(1, 10 - timeElapsed)}s...` 
                                            : 'Complete Test'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Main component with Suspense
export default function TestPage() {
    const { 
      userId, 
      currentStage,
      saveTestData // Use this instead of direct API call
    } = useFlow();
  
    // Function to save test results
    const saveTestResults = async (questions: TestQuestion[], answers: string[]) => {
        // Determine test type based on current stage
        let testType: 'pre' | 'post' | 'final';
        if (currentStage === 'pre-test') testType = 'pre';
        else if (currentStage === 'post-test') testType = 'post';
        else testType = 'final';
        
        // Calculate score and format questions
        let score = 0;
        const formattedQuestions = questions.map((question, index) => {
            // Ensure we're using the actual content of the answer, not just option keys
            const userAnswer = answers[index] || '';
            const correctAnswer = question.correctAnswer || '';
            
            // Check if the correct answer is a single letter (A, B, C, D)
            const isLetterFormat = correctAnswer && /^[A-D]$/.test(correctAnswer);
            
            let isCorrect = false;
            let userAnswerValue = userAnswer;
            
            if (isLetterFormat) {
                // For letter-format answers, compare the letters directly
                isCorrect = userAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
                
                // Try to get the actual option value if available
                if (question.options && userAnswer && question.options[userAnswer]) {
                    userAnswerValue = question.options[userAnswer].toString();
                }
            } else {
                // For value-based comparison, normalize and compare
                const normalizedUserAnswer = userAnswer.trim().toLowerCase();
                const normalizedCorrectAnswer = correctAnswer.trim().toLowerCase();
                isCorrect = normalizedUserAnswer === normalizedCorrectAnswer;
            }
            
            if (isCorrect) score++;
            
            console.log(`Question ${question.questionId} - User answer: "${userAnswerValue}" (original: "${userAnswer}"), Correct answer: "${correctAnswer}", isCorrect: ${isCorrect}`);
            
            return {
                questionId: question.questionId,
                question: question.question,
                userAnswer: userAnswerValue,  // Store the actual value, not just the letter
                correctAnswer,
                isCorrect,
                // Duration should be 0 for pre/post tests, or the actual elapsed time for final tests
                duration: testType === 'final' ? question.duration : 0
            };
        });
        
        // Calculate percentage score
        const percentScore = (score / questions.length) * 100;
        
        // Save to flow context instead of API
        saveTestData({
            testType,
            questions: formattedQuestions,
            score: percentScore,
            completedAt: new Date(),
            // Duration should be 0 for pre/post tests, or the actual elapsed time for final tests
            duration: testType === 'final' ? (formattedQuestions[0]?.duration || 0) : 0,
            submissionId: uuidv4() // Use uuid for consistent ID generation
        });
    };
    
    return (
        <Suspense fallback={
            <div className="flex flex-col h-screen justify-center items-center bg-gray-900 text-white">
                <div className="text-2xl">Loading test...</div>
            </div>
        }>
            <TestContent />
        </Suspense>
    );
}