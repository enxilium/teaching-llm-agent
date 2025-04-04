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
        userId
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

    // Auto-submit when time runs out
    const autoSubmitTimeoutAnswer = () => {
        console.log("Time's up! Auto-submitting answer and advancing.");

        if (roundEndedRef.current) return;
        roundEndedRef.current = true;

        // Stop the timer
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        // Record that there was no answer
        answersRef.current[currentQuestionIndex] = "NO ANSWER - TIME EXPIRED";
        setUserAnswers([...answersRef.current]);

        // Advance to next question if available
        if (currentQuestionIndex < allQuestions.length - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
        } else {
            handleTestCompletion();
        }
    };

    // Handle test completion based on the stage
    const handleTestCompletion = () => {
        if (testStage === 'pre') {
            completePreTest();
        } else if (testStage === 'post') {
            completePostTest();
        } else if (testStage === 'final') {
            completeFinalTest();
        }
    };

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
        const percentageScore = (score / questions.length) * 100;
        
        // Save the test attempt
        try {
            await TestService.saveTestAttempt({
                userId,
                testType,
                questions: formattedQuestions,
                score: percentageScore
            });
            console.log(`${testType} test results saved successfully`);
        } catch (error) {
            console.error(`Error saving ${testType} test results:`, error);
        }
    };

    // Submit answer
    const handleSubmitAnswer = () => {
        if (roundEndedRef.current || !currentAnswer) return;
        roundEndedRef.current = true;

        // Stop the timer
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        // Save answer
        answersRef.current[currentQuestionIndex] = currentAnswer;
        setUserAnswers([...answersRef.current]);

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
        } else {
            handleTestCompletion();
        }
    };

    // Timer effect
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
                    setTimeout(autoSubmitTimeoutAnswer, 0);
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
    }, [currentQuestionIndex]);

    // Handle option selection for multiple choice
    const handleOptionSelect = (option: string) => {
        setCurrentAnswer(option);
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
                                Scratchpad:
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

                        {/* Submit Button - remove workingSpace requirement */}
                        <div className="flex justify-end">
                            <button
                                onClick={handleSubmitAnswer}
                                disabled={!currentAnswer}
                                className={`px-6 py-3 rounded-lg ${
                                    currentAnswer
                                    ? 'bg-green-500 hover:bg-green-600 text-white'
                                    : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                                }`}
                            >
                                {currentQuestionIndex === allQuestions.length - 1 ? "Complete Test" : "Submit Answer"}
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
    const { userId, currentStage } = useFlow();
  
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
        const percentageScore = (score / questions.length) * 100;
        
        // Save the test attempt
        try {
            await TestService.saveTestAttempt({
                userId,
                testType,
                questions: formattedQuestions,
                score: percentageScore
            });
            console.log(`${testType} test results saved successfully`);
        } catch (error) {
            console.error(`Error saving ${testType} test results:`, error);
        }
    };
  
    // Add this to your submit handler
    const handleSubmitTest = () => {
        // Save test results
        saveTestResults([], []);
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