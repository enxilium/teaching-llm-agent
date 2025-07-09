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

export default function FinalTestPage() {
    const { completeFinalTest, saveTestData, testQuestionIndex } = useFlow();
    const [allQuestions, setAllQuestions] = useState<Question[]>([]);
    const [selectedAnswer, setSelectedAnswer] = useState<string>("");
    const [sessionStartTime] = useState<Date>(new Date());
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [canSubmit, setCanSubmit] = useState(false);

    const currentQuestion = allQuestions[testQuestionIndex || 0];

    useEffect(() => {
        const fetchQuestions = async () => {
            try {
                const response = await fetch("/questions.json");
                if (!response.ok) throw new Error("Failed to fetch questions");
                const data = await response.json();
                setAllQuestions(data.questions || []);
            } catch (error) {
                console.error("Error loading questions:", error);
            }
        };

        fetchQuestions();
    }, []);

    // Timer effect for 10-second cooldown
    useEffect(() => {
        const timerId = setInterval(() => {
            setTimeElapsed((prev) => {
                const newTime = prev + 1;
                if (newTime >= 10 && !canSubmit) {
                    setCanSubmit(true);
                }
                return newTime;
            });
        }, 1000);

        return () => clearInterval(timerId);
    }, [canSubmit]);

    const handleSubmitTest = async () => {
        const endTime = new Date();
        const sessionDuration = (endTime.getTime() - sessionStartTime.getTime()) / 1000;

        if (currentQuestion) {
            const testQuestion = {
                questionId: currentQuestion.id,
                question: currentQuestion.question,
                userAnswer: selectedAnswer || "No answer provided",
                correctAnswer: currentQuestion.correctAnswer || currentQuestion.answer,
                isCorrect: selectedAnswer.trim() === 
                          (currentQuestion.correctAnswer || currentQuestion.answer).trim(),
                scratchboardContent: "",
                duration: sessionDuration,
                options: currentQuestion.options,
            };

            const testData = {
                testType: "final" as const,
                submissionId: `final_${Date.now()}`,
                questions: [testQuestion],
                score: testQuestion.isCorrect ? 1 : 0,
                completedAt: endTime,
                timeoutOccurred: false,
                duration: sessionDuration,
            };

            await saveTestData(testData);
            completeFinalTest();
        }
    };

    if (!currentQuestion) {
        return (
            <div className="h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4 flex items-center justify-center">
                <div className="text-white text-xl">Loading question...</div>
            </div>
        );
    }

    // Create letter labels for options
    const getLetterLabels = (options: Record<string, string>) => {
        const keys = Object.keys(options);
        return keys.map((key, index) => ({
            letter: String.fromCharCode(65 + index), // A, B, C, D, etc.
            key,
            value: options[key]
        }));
    };

    const letterLabels = currentQuestion.options ? getLetterLabels(currentQuestion.options) : [];

    return (
        <div className="h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4 flex flex-col overflow-hidden fixed inset-0">
            <div className="w-full flex flex-col h-full overflow-hidden">
                {/* Problem Display - matching lesson style */}
                <div className="bg-white bg-opacity-20 p-4 rounded-md mb-4 border-2 border-purple-400">
                    <div className="flex justify-between items-start mb-2">
                        <h2 className="text-xl text-white font-semibold">Final Test Question:</h2>
                    </div>
                    <p className="text-white text-lg">
                        <RenderMathExpression text={currentQuestion.question} />
                    </p>
                </div>

                {/* Answer Selection - matching lesson style */}
                <div className="bg-white bg-opacity-15 p-4 rounded-md mb-4 border border-blue-500 flex-grow">
                    <h3 className="text-lg text-white font-semibold mb-4">
                        Select Your Answer
                    </h3>
                    
                    {currentQuestion.options && (
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            {letterLabels.map(({ letter, key, value }) => (
                                <div
                                    key={key}
                                    onClick={() => setSelectedAnswer(value)}
                                    className={`cursor-pointer p-4 rounded-md border-2 transition-all ${
                                        selectedAnswer === value
                                            ? "bg-blue-500 bg-opacity-30 border-blue-500"
                                            : "bg-white bg-opacity-10 border-gray-600 hover:bg-white hover:bg-opacity-20"
                                    }`}
                                >
                                    <div className="flex items-center">
                                        <div
                                            className={`w-6 h-6 mr-3 rounded-full border-2 flex items-center justify-center font-bold ${
                                                selectedAnswer === value
                                                    ? "border-blue-500 bg-blue-500 text-white"
                                                    : "border-gray-400 text-gray-400"
                                            }`}
                                        >
                                            {selectedAnswer === value ? "✓" : letter}
                                        </div>
                                        <div className="text-white text-lg">
                                            <RenderMathExpression text={value} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex justify-center">
                        <button
                            onClick={handleSubmitTest}
                            disabled={!selectedAnswer || !canSubmit}
                            className={`px-8 py-3 rounded-lg text-lg font-bold transition-all ${
                                selectedAnswer && canSubmit
                                    ? "bg-green-600 hover:bg-green-700 text-white"
                                    : "bg-gray-700 text-gray-400 cursor-not-allowed"
                            }`}
                        >
                            {canSubmit
                                ? "Submit Final Test"
                                : `Wait ${Math.max(1, 10 - timeElapsed)}s...`}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
