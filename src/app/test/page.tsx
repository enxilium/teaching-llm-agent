'use client'

import { useState, useEffect, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useFlow } from '@/context/FlowContext';
import ReactMarkdown from 'react-markdown';
// Add KaTeX for math formatting
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';
import TestService from '@/services/TestService';

// Define test questions structure
interface TestQuestion {
    id: number;
    question: string;
    options?: Record<string, string>;
    correctAnswer?: string;
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
    const testStage = searchParams.get('stage') || 'pre'; // Default to pre-test
    
    // Get flow context
    const { 
        completePreTest, 
        completePostTest, 
        completeFinalTest,
        lessonQuestionIndex,
        currentStage,
        userId,
        saveTestData
    } = useFlow();

    // Timer state
    const [timeLeft, setTimeLeft] = useState(120); // 2 minutes per question
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const roundEndedRef = useRef(false);

    // Question state
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [allQuestions, setAllQuestions] = useState<TestQuestion[]>([]);
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

    // Add this effect to reset the isSubmitting state when the test stage changes
    useEffect(() => {
        // Reset submission state whenever test stage changes
        setIsSubmitting(false);
        console.log(`Test stage changed to ${testStage}, resetting submission state`);
    }, [testStage]);

    // Update the flow protection section:

    // Remove the restrictive flow check that's causing the loop
    useEffect(() => {
        // Debug output instead of redirect
        console.log("Test page loaded with stage:", testStage, "Current flow stage:", currentStage);
        
        // NO redirect - let's disable this check temporarily to break the loop
        // Later we can add it back with better logic
    }, [testStage, currentStage]);

    // Format time function
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

        if (userAnswers.length === 0 && allQuestions.length > 0) {
            updatedAnswers = new Array(allQuestions.length).fill('');
        } else if (userAnswers.length < allQuestions.length) {
            updatedAnswers = new Array(allQuestions.length).fill('');
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
        if (allQuestions.length > 0 && (userAnswers.length === 0 || userAnswers.length !== allQuestions.length)) {
            const newAnswers = new Array(allQuestions.length).fill('');
            
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
    }, [allQuestions, userAnswers.length]);

    // Reset timer when changing questions
    useEffect(() => {
        setTimeLeft(120);
        roundEndedRef.current = false;

        if (answersRef.current && answersRef.current[currentQuestionIndex]) {
            setCurrentAnswer(answersRef.current[currentQuestionIndex]);
        } else {
            setCurrentAnswer('');
        }
    }, [currentQuestionIndex]);

    // Load the appropriate questions based on the test stage
    useEffect(() => {
        const loadQuestions = async () => {
            try {
                if (testStage === 'final') {
                    // For final test, load from questions.json and show only one question
                    const response = await fetch('/questions.json');
                    const data = await response.json();
                    
                    // Get the question that wasn't shown in the lesson
                    const finalQuestionIndex = lessonQuestionIndex === 0 ? 1 : 0;
                    const finalQuestion = data.questions[finalQuestionIndex];
                    
                    // Format for our interface
                    const formattedQuestion = {
                        id: 1,
                        question: finalQuestion.question,
                        correctAnswer: finalQuestion.answer
                    };
                    
                    setAllQuestions([formattedQuestion]);
                    // Reset the current index specifically for final test
                    setCurrentQuestionIndex(0);
                } else {
                    // For pre-test and post-test, load the conceptual questions
                    const response = await fetch('/test-questions.json');
                    const data = await response.json();
                    
                    const questions = data.questions || [];
                    setAllQuestions(questions);
                }
                
                setIsLoading(false);
            } catch (error) {
                console.error("Error loading questions:", error);
            }
            
            // Reset current index and ensure proper initialization
            setCurrentQuestionIndex(0);
            
            // Initialize empty answers
            const emptyAnswers = new Array(allQuestions.length).fill('');
            setUserAnswers(emptyAnswers);
            answersRef.current = emptyAnswers;
        };

        loadQuestions();
    }, [testStage, lessonQuestionIndex]);

    // Updated autoSubmitTimeoutAnswer function
    const autoSubmitTimeoutAnswer = () => {
        if (isSubmitting) return;
        setIsSubmitting(true);

        console.log("Time's up! Auto-submitting answer and advancing.");

        if (roundEndedRef.current) return;
        roundEndedRef.current = true;

        // Stop the timer
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        // Record that there was no answer
        const timeoutAnswer = "NO ANSWER - TIME EXPIRED";
        answersRef.current[currentQuestionIndex] = timeoutAnswer;
        setUserAnswers([...answersRef.current]);

        // If this is the final question in any test, save results
        if (currentQuestionIndex >= allQuestions.length - 1) {
            saveTestResults(allQuestions, answersRef.current);
        }

        // Advance to next question if available
        if (currentQuestionIndex < allQuestions.length - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
        } else {
            // This is the last question, complete the test
            handleTestCompletion();
        }
    };

    // Handle test completion based on the stage
    const handleTestCompletion = async () => {
        // Prevent resubmission if already submitting
        if (isSubmitting) {
            console.log("Already submitting, ignoring click");
            return;
        }
        
        // Set submitting state immediately
        setIsSubmitting(true);
        console.log(`${testStage} test completion initiated`);
        
        // Add a safety timeout to prevent UI from being stuck indefinitely
        const safetyTimeout = setTimeout(() => {
            console.log("Safety timeout triggered - forcing navigation");
            if (testStage === 'final') {
                window.location.href = '/completed';
            } else if (testStage === 'post') {
                window.location.href = '/test?stage=final';
            } else {
                window.location.href = '/';
            }
        }, 7000); // 7 seconds max wait time
        
        try {
            // Save test data to flow context
            saveTestData({
                testType: testStage as 'pre' | 'post' | 'final',
                questions: allQuestions.map((q, i) => ({
                    questionId: q.id,
                    question: q.question,
                    userAnswer: userAnswers[i] || '',
                    correctAnswer: q.correctAnswer || '',
                    isCorrect: (userAnswers[i] || '').toLowerCase() === (q.correctAnswer || '').toLowerCase()
                })),
                score: Math.round((allQuestions.filter((q, i) => (userAnswers[i] || '').toLowerCase() === (q.correctAnswer || '').toLowerCase()).length / allQuestions.length) * 100),
                completedAt: new Date()
            });
            
            // Handle the appropriate completion function with proper promise handling
            if (testStage === 'final') {
                console.log("Final test - calling completeFinalTest with await");
                try {
                    const result = await completeFinalTest();
                    console.log("completeFinalTest resolved with:", result);
                } catch (error) {
                    console.error("completeFinalTest rejected with:", error);
                    window.location.href = '/completed';
                }
            } else if (testStage === 'post') {
                console.log("Post test - calling completePostTest");
                completePostTest();
            } else {
                console.log("Pre test - calling completePreTest");
                completePreTest();
            }
            
            // Clear the safety timeout since we completed normally
            clearTimeout(safetyTimeout);
            
        } catch (error) {
            console.error("Error in handleTestCompletion:", error);
            
            // Clear the safety timeout
            clearTimeout(safetyTimeout);
            
            // Reset submission state after 3 seconds so user can try again
            setTimeout(() => {
                setIsSubmitting(false);
            }, 3000);
            
            // Show error message to user
            alert("There was an error submitting your test. Please try again.");
        }
    };

    // Function to save test results
    const saveTestResults = (allQuestions: any[], userAnswers: string[]) => {
        if (!allQuestions.length) return;
        
        const testType = testStage as 'pre' | 'post' | 'final';
        const questions = allQuestions.map((q, i) => {
            // Never allow empty userAnswer - use placeholder text instead
            // Make sure we have the right answer from userAnswers
            let userAnswer = userAnswers[i];
            
            // If userAnswer is empty, null, or undefined, replace with placeholder
            if (!userAnswer || userAnswer.trim() === '') {
                console.warn(`Empty answer detected for question ${i+1}, using placeholder`);
                userAnswer = "No answer provided";
            }
            
            return {
                questionId: q.id,
                question: q.question,
                userAnswer: userAnswer, // Now guaranteed to be non-empty
                correctAnswer: q.correctAnswer || q.answer || '',
                isCorrect: (userAnswer.toLowerCase() === (q.correctAnswer || q.answer || '').toLowerCase())
            };
        });
        
        // Calculate score based on non-empty answers
        const correctCount = questions.filter(q => q.isCorrect).length;
        const score = Math.round((correctCount / questions.length) * 100);
        
        console.log(`Saving test data to flow: ${testType}, ${questions.length} questions`);
        console.log('Sample question data:', JSON.stringify(questions[0]));
        
        // Save to Flow context with guaranteed userAnswer values
        saveTestData({
            testType,
            questions,
            score,
            completedAt: new Date()
        });
    };

    // Submit answer
    const handleSubmitAnswer = () => {
        // Prevent resubmission if already submitting
        if (roundEndedRef.current || !currentAnswer || isSubmitting) return;

        setIsSubmitting(true);
        roundEndedRef.current = true;

        // Critical: Save the current answer to the userAnswers array
        answersRef.current[currentQuestionIndex] = currentAnswer;
        setUserAnswers([...answersRef.current]);
        console.log(`Answer for question ${currentQuestionIndex + 1} saved:`, currentAnswer);

        // Only validate scratchboard content for final test
        const scratchboardContent = workingSpace[currentQuestion?.id || 0] || "";
        if (testStage === 'final' && !scratchboardContent.trim()) {
            setErrors(prev => ({ ...prev, work: true }));
            setIsSubmitting(false); // Reset submission state
            roundEndedRef.current = false;
            return;
        }

        // Check if all questions are answered
        const allAnswered = answersRef.current.every(a => a && a.trim() !== '');
        setAllQuestionsAnswered(allAnswered);

        // Save test results
        if (currentQuestionIndex === allQuestions.length - 1) {
            saveTestResults(allQuestions, answersRef.current);
        }

        // Handle next question or completion
        if (currentQuestionIndex < allQuestions.length - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
            // Reset submission flag after navigation to next question
            setTimeout(() => setIsSubmitting(false), 500);
        } else {
            handleTestCompletion();
            // Don't reset flag on completion since we're navigating away
        }
    };

    // Updated timer effect for final test auto-redirection
    useEffect(() => {
        if (roundEndedRef.current) return;

        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    if (timerRef.current) {
                        clearInterval(timerRef.current);
                        timerRef.current = null;
                    }
                    
                    // For final test, always auto-submit and redirect when time expires
                    if (testStage === 'final') {
                        console.log('Final test time expired - redirecting to completed page');
                        
                        // Save the current answer (even if empty)
                        const finalAnswer = currentAnswer.trim() || "NO ANSWER - TIME EXPIRED";
                        answersRef.current[currentQuestionIndex] = finalAnswer;
                        setUserAnswers([...answersRef.current]);
                        
                        // Save test results before navigating
                        saveTestResults(allQuestions, answersRef.current);
                        
                        // Short timeout to ensure state updates before navigation
                        setTimeout(() => {
                            completeFinalTest();
                        }, 500);
                    } else {
                        // For other test stages, use standard timeout logic
                        setTimeout(autoSubmitTimeoutAnswer, 0);
                    }
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => {
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [currentQuestionIndex, testStage, allQuestions]);

    // Handle option selection for multiple choice
    const handleOptionSelect = (option: string) => {
        console.log(`Option selected for question ${currentQuestionIndex + 1}:`, option);
        setCurrentAnswer(option);
        
        // Immediately save to answersRef to ensure it's not lost
        answersRef.current[currentQuestionIndex] = option;
    };

    // Get current question
    const currentQuestion = allQuestions[currentQuestionIndex];

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

    const handleSubmitFinalTest = () => {
        console.log("Final test submit button clicked");
        
        // Add a flag to prevent double-clicks
        if (isSubmitting) {
            console.log("Already submitting, ignoring click");
            return;
        }
        
        // Set submitting state
        setIsSubmitting(true);
        
        try {
            console.log("Saving final test data to flow context");
            // Your existing code to save test data...
            
            console.log("Calling completeFinalTest");
            completeFinalTest();
        } catch (error) {
            console.error("Error in handleSubmitFinalTest:", error);
        }
    };

    return (
        <div className="flex flex-col h-screen bg-gray-900">
            <div className="bg-gradient-to-b from-[#2D0278] to-[#0A001D] min-h-screen p-8">
                <div className="max-w-4xl mx-auto">
                    {/* Header with embedded timer */}
                    <div className="bg-white bg-opacity-10 rounded-lg p-6 mb-6">
                        <div className="flex justify-between items-center">
                            <div>
                                <h1 className="text-3xl text-white font-bold">{getTestTitle()}</h1>
                                <p className="text-white mt-2">
                                    Question {currentQuestionIndex + 1} of {allQuestions.length || 1}
                                </p>
                            </div>
                            <div className="bg-green-900 px-4 py-2 rounded-lg">
                                <span className="text-white font-mono font-bold text-xl">
                                    {formatTime(timeLeft)}
                                </span>
                            </div>
                        </div>
                    </div>

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
                                                currentAnswer === key 
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
                            <label className="block text-white text-sm mb-2">
                                Show your work {testStage === 'final' ? '(required)' : '(optional)'}:
                                {errors.work && testStage === 'final' && (
                                    <span className="text-red-400 text-xs ml-2">* You must show your work before submitting</span>
                                )}
                            </label>
                            <textarea
                                ref={workingSpaceRef}
                                value={workingSpace[currentQuestion?.id || 0] || ""}
                                onChange={(e) => setWorkingSpace({
                                    ...workingSpace,
                                    [currentQuestion?.id || 0]: e.target.value
                                })}
                                className="w-full h-48 bg-white bg-opacity-10 text-white border border-gray-600 rounded-lg p-3 resize-none"
                                placeholder="Use this space to work through your solution (optional)..."
                            />
                        </div>

                        {/* Submit Button */}
                        <div className="flex justify-end">
                            <button 
                                onClick={handleSubmitAnswer}
                                disabled={
                                    !currentAnswer.trim() || 
                                    (testStage === 'final' && !(workingSpace[currentQuestion?.id || 0] || "").trim()) ||
                                    isSubmitting
                                }
                                className={`px-6 py-2 ${
                                    isSubmitting 
                                        ? 'bg-gray-500 cursor-not-allowed'
                                        : !currentAnswer.trim() || (testStage === 'final' && !(workingSpace[currentQuestion?.id || 0] || "").trim())
                                            ? 'bg-gray-400 cursor-not-allowed'
                                            : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'
                                } text-white rounded-lg flex items-center justify-center`}
                            >
                                {isSubmitting ? (
                                    <>
                                        <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                        Submitting...
                                    </>
                                ) : (
                                    currentQuestionIndex === allQuestions.length - 1 ? "Complete Test" : "Submit Answer"
                                )}
                            </button>
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
            const userAnswer = answers[index] || '';
            const correctAnswer = question.correctAnswer || '';
            const isCorrect = userAnswer.toLowerCase() === correctAnswer.toLowerCase();
            
            if (isCorrect) score++;
            
            return {
                questionId: question.id,
                question: question.question,
                userAnswer,
                correctAnswer,
                isCorrect
            };
        });
        
        // Calculate percentage score
        const percentScore = (score / questions.length) * 100;
        
        // Save to flow context instead of API
        saveTestData({
            testType,
            questions: formattedQuestions,
            score: percentScore,
            completedAt: new Date()
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