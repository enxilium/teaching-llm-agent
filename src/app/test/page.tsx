'use client'

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

// Define test questions structure
interface TestQuestion {
    id: number;
    question: string;
    correctAnswer?: string;
}

export default function TestPage() {
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [userAnswers, setUserAnswers] = useState<Record<number, string>>({});
    const [workingSpace, setWorkingSpace] = useState<Record<number, string>>({});
    const [testComplete, setTestComplete] = useState(false);
    const [testQuestions, setTestQuestions] = useState<TestQuestion[]>([]);
    const router = useRouter();
    const workingSpaceRef = useRef<HTMLTextAreaElement>(null);

    // Load test questions
    useEffect(() => {
        const loadQuestions = async () => {
            try {
                const response = await fetch('/test-questions.json');
                const data = await response.json();
                setTestQuestions(data.questions || []);
            } catch (error) {
                console.error("Error loading test questions:", error);
                setTestQuestions([
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
                ]);
            }
        };

        loadQuestions();
    }, []);

    const handleNextQuestion = () => {
        if (currentQuestionIndex < testQuestions.length - 1) {
            setCurrentQuestionIndex(currentQuestionIndex + 1);
            setTimeout(() => {
                workingSpaceRef.current?.focus();
            }, 100);
        } else {
            setTestComplete(true);
        }
    };

    const handlePrevQuestion = () => {
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(currentQuestionIndex - 1);
        }
    };

    const handleSubmitAnswer = () => {
        const currentQuestion = testQuestions[currentQuestionIndex];
        if (!currentQuestion) return;

        if (!workingSpace[currentQuestion.id]) {
            alert("Please show your reasoning in the working space before submitting.");
            return;
        }

        const userAnswer = userAnswers[currentQuestion.id] || "";
        if (!userAnswer.trim()) {
            alert("Please provide an answer.");
            return;
        }

        // Auto-advance to next question
        handleNextQuestion();
    };

    const handleFinishTest = () => {
        // Calculate score if we have correct answers
        let score = 0;
        let totalQuestions = 0;

        testQuestions.forEach(question => {
            if (question.correctAnswer && userAnswers[question.id]) {
                totalQuestions++;
                if (userAnswers[question.id].trim() === question.correctAnswer.trim()) {
                    score++;
                }
            }
        });

        alert(`Test complete! Your score: ${score}/${totalQuestions}`);
        router.push('/');
    };

    const currentQuestion = testQuestions[currentQuestionIndex];

    return (
        <div className="bg-gradient-to-b from-[#2D0278] to-[#0A001D] min-h-screen p-8">
            <div className="max-w-4xl mx-auto">
                {/* Header */}
                <div className="bg-white bg-opacity-10 rounded-lg p-6 mb-6">
                    <h1 className="text-3xl text-white font-bold">Combinatorics Test</h1>
                    <p className="text-white mt-2">
                        Question {currentQuestionIndex + 1} of {testQuestions.length}
                    </p>
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
                            value={userAnswers[currentQuestion?.id || 0] || ""}
                            onChange={(e) => setUserAnswers({
                                ...userAnswers,
                                [currentQuestion?.id || 0]: e.target.value
                            })}
                            className="flex-1 bg-white bg-opacity-20 text-white border border-gray-600 rounded-lg p-3"
                            placeholder="Your final answer..."
                            disabled={!workingSpace[currentQuestion?.id || 0]}
                        />
                        <button
                            onClick={handleSubmitAnswer}
                            disabled={!workingSpace[currentQuestion?.id || 0] || !userAnswers[currentQuestion?.id || 0]}
                            className={`px-6 py-3 rounded-lg ${workingSpace[currentQuestion?.id || 0] && userAnswers[currentQuestion?.id || 0]
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
                        disabled={currentQuestionIndex === testQuestions.length - 1}
                        className={`px-4 py-2 rounded-lg ${currentQuestionIndex < testQuestions.length - 1
                                ? 'bg-blue-500 hover:bg-blue-600 text-white'
                                : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                            }`}
                    >
                        Next Question
                    </button>
                </div>

                {testComplete && (
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
    );
}