'use client'

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';

// Define test questions structure
interface TestQuestion {
    id: number;
    question: string;
    correctAnswer?: string;
}

export default function TestPage() {
    const router = useRouter();

    // Add timer state (similar to group page)
    const [timeLeft, setTimeLeft] = useState(120); // 2 minutes per question
    const timerRef = useRef<NodeJS.Timeout | null>(null);
    const roundEndedRef = useRef(false);

    // Existing state from the test page
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [allQuestions, setAllQuestions] = useState<TestQuestion[]>([]);
    const [userAnswers, setUserAnswers] = useState<string[]>([]);
    const [currentAnswer, setCurrentAnswer] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [workingSpace, setWorkingSpace] = useState<Record<number, string>>({});
    const [testComplete, setTestComplete] = useState(false);
    const workingSpaceRef = useRef<HTMLTextAreaElement>(null);

    // Add a new state to track if all questions have been answered
    const [allQuestionsAnswered, setAllQuestionsAnswered] = useState(false);

    // 1. Add a ref to reliably track answers
    const answersRef = useRef<string[]>([]);

    // Format time function (matching the group page implementation)
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    // Fix the saveAnswer function to handle empty userAnswers array
    const saveAnswer = (index: number, answer: string) => {
        console.log(`Saving answer for question ${index + 1}: "${answer}"`);
        console.log(`Current answers array (${userAnswers.length}):`, userAnswers);

        // Create a proper sized array regardless of current state
        let updatedAnswers: string[];

        // If userAnswers is empty but we have questions, create a new array
        if (userAnswers.length === 0 && allQuestions.length > 0) {
            console.warn(`User answers array is empty! Creating new array of length ${allQuestions.length}`);
            updatedAnswers = new Array(allQuestions.length).fill('');
        } else if (userAnswers.length < allQuestions.length) {
            // If array is too short, extend it
            console.warn(`Answer array too short (${userAnswers.length}), extending to ${allQuestions.length}`);
            updatedAnswers = new Array(allQuestions.length).fill('');
            // Copy existing values
            userAnswers.forEach((ans, i) => {
                updatedAnswers[i] = ans;
            });
        } else {
            // Array is correct size, just copy it
            updatedAnswers = [...userAnswers];
        }

        // Now safely update the index
        updatedAnswers[index] = answer;
        console.log(`Updated answers array (${updatedAnswers.length}):`, updatedAnswers);

        // Set the state with the properly sized array
        setUserAnswers(updatedAnswers);
        return updatedAnswers;
    };

    // Also add state initialization at component level
    useEffect(() => {
        // Ensure userAnswers is always initialized to match question count
        if (allQuestions.length > 0 && (userAnswers.length === 0 || userAnswers.length !== allQuestions.length)) {
            console.log("Initializing userAnswers array to match question count:", allQuestions.length);

            // Create new answers array properly sized
            const newAnswers = new Array(allQuestions.length).fill('');

            // Copy any existing answers if available
            if (userAnswers.length > 0) {
                userAnswers.forEach((ans, idx) => {
                    if (idx < newAnswers.length) {
                        newAnswers[idx] = ans;
                    }
                });
            }

            setUserAnswers(newAnswers);
        }
    }, [allQuestions, userAnswers.length]);

    // 2. Make sure timer is a reasonable value for testing
    useEffect(() => {
        setTimeLeft(120);
        roundEndedRef.current = false;

        // Important: Update current answer when changing questions
        if (answersRef.current && answersRef.current[currentQuestionIndex]) {
            setCurrentAnswer(answersRef.current[currentQuestionIndex]);
        } else {
            setCurrentAnswer('');
        }
    }, [currentQuestionIndex]);

    // 3. Simplified load questions - focus on proper initialization
    useEffect(() => {
        const loadQuestions = async () => {
            try {
                const response = await fetch('/test-questions.json');
                const data = await response.json();

                const questions = data.questions || [];
                console.log("Loaded questions:", questions.length);

                // Set questions
                setAllQuestions(questions);

                // Initialize answers array - critical part
                const emptyAnswers = Array(questions.length).fill('');
                setUserAnswers(emptyAnswers);
                answersRef.current = emptyAnswers;

                setIsLoading(false);
            } catch (error) {
                console.error("Error loading test questions:", error);
                // Fallback with simpler initialization
                const fallbackQuestions = [
                    {
                        id: 1,
                        question: "If you have 8 distinct objects, in how many ways can you arrange 3 of them in a row?",
                        correctAnswer: "336"
                    },
                    {
                        id: 2,
                        question: "How many different committees of 3 people can be formed from a group of 7 people?",
                        correctAnswer: "35"
                    },
                    {
                        id: 3,
                        question: "How many ways can you distribute 5 distinct prizes to 8 students if each student can receive at most one prize?",
                        correctAnswer: "6720"
                    }
                ];

                setAllQuestions(fallbackQuestions);
                const emptyAnswers = Array(fallbackQuestions.length).fill('');
                setUserAnswers(emptyAnswers);
                answersRef.current = emptyAnswers;
                setIsLoading(false);
            }
        };

        loadQuestions();
    }, []);

    // 4. Simplified auto-submit with immediate advance
    const autoSubmitTimeoutAnswer = () => {
        console.log("Time's up! Auto-submitting answer and advancing.");

        if (roundEndedRef.current) return;
        roundEndedRef.current = true;

        // Stop the timer
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        // Directly modify the answers ref without showing to user
        const currentIndex = currentQuestionIndex;
        answersRef.current[currentIndex] = "NO ANSWER - TIME EXPIRED";

        // Update state for storage only, but don't show to user
        setUserAnswers([...answersRef.current]);

        // Immediately advance to next question if available
        if (currentIndex < allQuestions.length - 1) {
            // Move to next question - no delay
            setCurrentQuestionIndex(currentIndex + 1);
        } else {
            // If this was the last question, check if all questions are answered
            const allAnswered = answersRef.current.every(a => a && a.trim() !== '');
            setAllQuestionsAnswered(allAnswered);
        }
    };

    // 5. Simplified handleSubmitAnswer with immediate advance
    const handleSubmitAnswer = () => {
        if (roundEndedRef.current) return;
        roundEndedRef.current = true;

        // Stop the timer
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        // Save answer directly to ref
        answersRef.current[currentQuestionIndex] = currentAnswer;

        // Update state for rendering
        setUserAnswers([...answersRef.current]);

        console.log("Answers after submit:", answersRef.current);

        // Check if all questions are answered
        const allAnswered = answersRef.current.every(a => a && a.trim() !== '');
        setAllQuestionsAnswered(allAnswered);

        // Immediately advance to next question if not the last one
        const currentIdx = currentQuestionIndex;
        if (currentIdx < allQuestions.length - 1) {
            console.log(`Auto-advancing from question ${currentIdx + 1} to ${currentIdx + 2}`);
            // Immediately advance - no delay
            setCurrentQuestionIndex(currentIdx + 1);
        } else {
            console.log("On last question, not advancing");
        }
    };

    // Also set a very short timer for testing to ensure auto-advance works
    useEffect(() => {
        setTimeLeft(120); // 3 seconds for testing
        roundEndedRef.current = false;

        // Important: Update current answer when changing questions
        if (answersRef.current && answersRef.current[currentQuestionIndex]) {
            setCurrentAnswer(answersRef.current[currentQuestionIndex]);
        } else {
            setCurrentAnswer('');
        }
    }, [currentQuestionIndex]);

    // 6. Simplified handleNextQuestion
    const handleNextQuestion = () => {
        // Save current answer to ref
        answersRef.current[currentQuestionIndex] = currentAnswer;

        // Update state for rendering
        setUserAnswers([...answersRef.current]);

        // Check if all answers are provided
        const allAnswered = answersRef.current.every(a => a && a.trim() !== '');
        setAllQuestionsAnswered(allAnswered);

        // Move to next question if not at the end
        if (currentQuestionIndex < allQuestions.length - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
        }
    };

    // 7. Simplified handlePrevQuestion
    const handlePrevQuestion = () => {
        // Save current answer
        answersRef.current[currentQuestionIndex] = currentAnswer;

        // Update state for rendering
        setUserAnswers([...answersRef.current]);

        // Move to previous question if possible
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(currentQuestionIndex - 1);
        }
    };

    // 8. Better timer effect
    useEffect(() => {
        // Skip if round already ended
        if (roundEndedRef.current) return;

        // Clear existing timer
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }

        // Set up new timer
        timerRef.current = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    if (timerRef.current) {
                        clearInterval(timerRef.current);
                        timerRef.current = null;
                    }
                    // Put this in a setTimeout to avoid state update collisions
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

    const handleFinishTest = () => {
        // Calculate score if we have correct answers
        let score = 0;
        let totalQuestions = 0;

        allQuestions.forEach((question, index) => {
            if (question.correctAnswer && userAnswers[index]) {
                totalQuestions++;
                if (userAnswers[index].trim() === question.correctAnswer.trim()) {
                    score++;
                }
            }
        });

        alert(`Test complete! Your score: ${score}/${totalQuestions}`);
        router.push('/');
    };

    const currentQuestion = allQuestions[currentQuestionIndex];

    if (isLoading) {
        return (
            <div className="flex flex-col h-screen justify-center items-center bg-gray-900 text-white">
                <div className="text-2xl">Loading questions...</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gray-900">

            <div className="bg-gradient-to-b from-[#2D0278] to-[#0A001D] min-h-screen p-8">
                <div className="max-w-4xl mx-auto">
                    {/* Header with embedded timer */}
                    <div className="bg-white bg-opacity-10 rounded-lg p-6 mb-6">
                        <div className="flex justify-between items-center">
                            <div>
                                <h1 className="text-3xl text-white font-bold">Combinatorics Test</h1>
                                <p className="text-white mt-2">
                                    Question {currentQuestionIndex + 1} of {allQuestions.length}
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
                            {currentQuestion?.question || "Loading question..."}
                        </h2>

                        {/* Working Space */}
                        <div className="mb-6">
                            <label className="block text-white text-sm mb-2">
                                Show your work (required):
                            </label>
                            <textarea
                                ref={workingSpaceRef}
                                value={workingSpace[currentQuestion?.id || 0] || ""}
                                onChange={(e) => setWorkingSpace({
                                    ...workingSpace,
                                    [currentQuestion?.id || 0]: e.target.value
                                })}
                                className="w-full h-48 bg-white bg-opacity-10 text-white border border-gray-600 rounded-lg p-3 resize-none"
                                placeholder="Show your reasoning here before submitting your final answer..."
                            />
                        </div>

                        {/* Answer Input */}
                        <div className="flex items-center gap-4">
                            <input
                                type="text"
                                value={currentAnswer || ""}
                                onChange={(e) => setCurrentAnswer(e.target.value)}
                                className="flex-1 bg-white bg-opacity-20 text-white border border-gray-600 rounded-lg p-3"
                                placeholder="Your final answer..."
                            />
                            <button
                                onClick={handleSubmitAnswer}
                                disabled={!currentAnswer.trim()}
                                className={`px-6 py-3 rounded-lg ${currentAnswer.trim()
                                    ? 'bg-green-500 hover:bg-green-600 text-white'
                                    : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                                    }`}
                            >
                                Submit Answer
                            </button>
                        </div>
                    </div>

                    {/* Navigation */}
                    <div className="flex justify-between">
                        <button
                            onClick={handlePrevQuestion}
                            disabled={currentQuestionIndex === 0}
                            className={`px-4 py-2 rounded-lg ${currentQuestionIndex > 0
                                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                                : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                                }`}
                        >
                            Previous Question
                        </button>

                        <button
                            onClick={handleNextQuestion}
                            disabled={currentQuestionIndex === allQuestions.length - 1}
                            className={`px-4 py-2 rounded-lg ${currentQuestionIndex < allQuestions.length - 1
                                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                                : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                                }`}
                        >
                            Next Question
                        </button>
                    </div>

                    {/* Change the test complete button to only show when all questions are answered */}
                    {allQuestionsAnswered && (
                        <div className="mt-6 text-center">
                            <button
                                onClick={handleFinishTest}
                                className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg"
                            >
                                Complete Test
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Debug information - you can remove this when everything works */}
            <div className="mt-4 mx-auto max-w-4xl p-3 bg-black bg-opacity-50 text-white rounded-lg text-sm">
                <h3 className="font-bold">Debug Info:</h3>
                <p>Total questions: {allQuestions.length}</p>
                <p>Current question index: {currentQuestionIndex}</p>
                <p>Answers recorded: {userAnswers.filter(a => a && a.trim() !== '').length}/{allQuestions.length}</p>
                <p>All questions answered: {allQuestionsAnswered ? "Yes" : "No"}</p>
                <div className="mt-2">
                    <strong>Answer status:</strong>
                    <ul className="ml-4">
                        {userAnswers.map((answer, idx) => (
                            <li key={idx}>
                                Q{idx + 1}: {answer ? `"${answer}"` : "Not answered"}
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
}