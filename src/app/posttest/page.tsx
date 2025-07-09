"use client";

import { useState, useEffect } from "react";
import { useFlow } from "@/context/FlowContext";
import RenderMathExpression from "@/components/RenderMathExpression";

interface Question {
    id: number;
    question: string;
    options?: Record<string, string>;
    answer: string;
    correctAnswer?: string;
}

export default function PostTestPage() {
    const { completePostTest, saveTestData } = useFlow();
    const [allQuestions, setAllQuestions] = useState<Question[]>([]);
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, string>>({});
    const [sessionStartTime] = useState<Date>(new Date());

    const currentQuestion = allQuestions[currentQuestionIndex];
    const isLastQuestion = currentQuestionIndex === allQuestions.length - 1;
    const hasAnsweredCurrent = answers[currentQuestion?.id] !== undefined;

    useEffect(() => {
        const fetchQuestions = async () => {
            try {
                const response = await fetch("/test-questions.json");
                if (!response.ok) throw new Error("Failed to fetch questions");
                const data = await response.json();
                // Keep questions in original order - no randomization
                setAllQuestions(data.questions || []);
            } catch (error) {
                console.error("Error loading questions:", error);
            }
        };

        fetchQuestions();
    }, []);

    const handleAnswerSelect = (answer: string) => {
        if (currentQuestion) {
            setAnswers(prev => ({
                ...prev,
                [currentQuestion.id]: answer
            }));
        }
    };

    const handleNext = () => {
        if (hasAnsweredCurrent && currentQuestionIndex < allQuestions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        }
    };

    const handleSubmitTest = async () => {
        const endTime = new Date();
        const sessionDuration = (endTime.getTime() - sessionStartTime.getTime()) / 1000;

        const testQuestions = allQuestions.map(question => ({
            questionId: question.id,
            question: question.question,
            userAnswer: answers[question.id] || "No answer provided",
            correctAnswer: question.correctAnswer || question.answer,
            isCorrect: (answers[question.id] || "").trim() === 
                      (question.correctAnswer || question.answer).trim(),
            scratchboardContent: "",
            duration: sessionDuration / allQuestions.length, // Average time per question
            options: question.options,
        }));

        const score = testQuestions.filter(q => q.isCorrect).length;

        const testData = {
            testType: "post" as const,
            submissionId: `post_${Date.now()}`,
            questions: testQuestions,
            score: score,
            completedAt: endTime,
            timeoutOccurred: false,
            duration: sessionDuration,
        };

        await saveTestData(testData);
        completePostTest();
    };

    if (!currentQuestion) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-8 flex items-center justify-center">
                <div className="text-white text-xl">Loading questions...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-8">
            <div className="max-w-4xl mx-auto">
                <div className="bg-white bg-opacity-10 rounded-xl p-8 mb-6">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold text-white">
                            Post-Test: Question {currentQuestionIndex + 1} of {allQuestions.length}
                        </h1>
                        <div className="text-white text-sm">
                            Progress: {currentQuestionIndex + 1} / {allQuestions.length}
                        </div>
                    </div>

                    <div className="mb-8">
                        <div className="text-xl text-white mb-6">
                            <RenderMathExpression text={currentQuestion.question} />
                        </div>
                        
                        {currentQuestion.options && (
                            <div className="space-y-3">
                                {Object.entries(currentQuestion.options).map(([key, value]) => (
                                    <label key={key} className="flex items-center space-x-3 cursor-pointer">
                                        <input
                                            type="radio"
                                            name={`question-${currentQuestion.id}`}
                                            value={value}
                                            checked={answers[currentQuestion.id] === value}
                                            onChange={(e) => handleAnswerSelect(e.target.value)}
                                            className="w-4 h-4"
                                        />
                                        <span className="text-white text-lg">
                                            <strong>{key}:</strong>{" "}
                                            <RenderMathExpression text={value} />
                                        </span>
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end">
                        {!isLastQuestion ? (
                            <button
                                onClick={handleNext}
                                disabled={!hasAnsweredCurrent}
                                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg"
                            >
                                Next Question
                            </button>
                        ) : (
                            <button
                                onClick={handleSubmitTest}
                                disabled={!hasAnsweredCurrent}
                                className="px-6 py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white rounded-lg"
                            >
                                Submit Post-Test
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
