"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useFlow } from "@/context/FlowContext";
import { QuestionSubmission, isValidNumericAnswer, checkAnswerCorrectness } from "@/utils/types";
import ProblemDisplay from "@/components/ProblemDisplay";
import Scratchpad from "@/components/Scratchpad";

interface CurrentQuestion {
    id: number;
    categoryId: string;
    question: string;
    answer: string;
}

export default function TestPage() {
    const {
        completeTest,
        testQuestionIndex,
        selectedCategoryIndices,
        categoryVariations,
        saveQuestionSubmission,
        lessonType,
    } = useFlow();
    
    const [sessionStartTime, setSessionStartTime] = useState<Date>(new Date());
    const [questionLoadTime, setQuestionLoadTime] = useState<string>(new Date().toISOString());
    const [scratchboardContent, setScratchboardContent] = useState("");
    const [finalAnswer, setFinalAnswer] = useState("");
    const [answerError, setAnswerError] = useState<string | null>(null);
    const [timeElapsed, setTimeElapsed] = useState(0);
    const roundEndedRef = useRef(false);
    const [canSubmit, setCanSubmit] = useState(false);
    const [currentQuestion, setCurrentQuestion] = useState<CurrentQuestion | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const saveAndComplete = useCallback(
        async (isAutoTimeout: boolean = false) => {
            if (!currentQuestion) return;
            
            const endTime = new Date();
            const durationSeconds = (endTime.getTime() - sessionStartTime.getTime()) / 1000;
            // If auto-timeout (12 min limit), use "0" as default; otherwise use existing logic
            const userAnswer = isAutoTimeout 
                ? (finalAnswer.trim() || "0")
                : (finalAnswer.trim() || "No answer provided");
            
            // Determine if answer is correct by comparing to answer key
            const isCorrect = checkAnswerCorrectness(userAnswer, currentQuestion.answer);

            const submission: QuestionSubmission = {
                questionId: currentQuestion.id,
                categoryId: currentQuestion.categoryId,
                phase: "test",
                questionIndex: testQuestionIndex,
                questionText: currentQuestion.question,
                correctAnswer: currentQuestion.answer,
                userAnswer: userAnswer,
                scratchboardContent: scratchboardContent,
                messages: [],
                startTime: questionLoadTime,
                endTime: endTime.toISOString(),
                durationSeconds: durationSeconds,
                isCorrect: isCorrect,
                timeoutOccurred: false,
                skipTime: null,
                lessonType: lessonType,
            };

            saveQuestionSubmission(submission);
            completeTest();
        },
        [
            sessionStartTime,
            currentQuestion,
            scratchboardContent,
            lessonType,
            testQuestionIndex,
            finalAnswer,
            saveQuestionSubmission,
            completeTest,
        ]
    );

    // Track the question index to detect changes and reset state
    const previousQuestionIndexRef = useRef(testQuestionIndex);
    
    // Reset all component state when testQuestionIndex changes (moving to next question)
    useEffect(() => {
        if (previousQuestionIndexRef.current !== testQuestionIndex) {
            console.log(`📝 Test question index changed from ${previousQuestionIndexRef.current} to ${testQuestionIndex}, resetting state`);
            previousQuestionIndexRef.current = testQuestionIndex;
            
            // Reset all state for the new question
            setScratchboardContent("");
            setFinalAnswer("");
            setAnswerError(null);
            setTimeElapsed(0);
            roundEndedRef.current = false;
            setCanSubmit(false);
            setCurrentQuestion(null);
            setIsLoading(true);
            setError(null);
            // Reset time tracking for new question
            setSessionStartTime(new Date());
            setQuestionLoadTime(new Date().toISOString());
        }
    }, [testQuestionIndex]);

    // Load question (uses test variation - opposite of lesson variation)
    useEffect(() => {
        const fetchAndSelectQuestion = async () => {
            setIsLoading(true);
            setError(null);
            
            try {
                console.log("Loading test question...", { testQuestionIndex, selectedCategoryIndices, categoryVariations });
                
                const response = await fetch("/questions.json");
                if (!response.ok) throw new Error("Failed to fetch questions");
                const data = await response.json();
                
                if (!data.categories || !selectedCategoryIndices || selectedCategoryIndices.length === 0) {
                    console.log("No categories or indices available yet");
                    setIsLoading(false);
                    return;
                }
                
                const safeIndex = Math.min(Math.max(0, testQuestionIndex), 1);
                const categoryIndex = selectedCategoryIndices[safeIndex];
                const category = data.categories[categoryIndex];
                
                if (!category) {
                    throw new Error(`Category not found at index ${categoryIndex}`);
                }
                
                // Use testVariation (opposite of lessonVariation)
                const variationIdx = categoryVariations?.find(cv => cv.categoryIndex === categoryIndex)?.testVariation ?? 1;
                const questionData = category.variations?.[variationIdx];
                
                if (!questionData) {
                    throw new Error(`Question variation not found`);
                }
                
                console.log("Test question loaded:", questionData.question.substring(0, 50) + "...");
                
                setCurrentQuestion({
                    id: categoryIndex,
                    categoryId: category.id,
                    question: questionData.question,
                    answer: questionData.answer
                });
            } catch (err) {
                console.error("Error loading questions:", err);
                setError(err instanceof Error ? err.message : "Failed to load question");
            } finally {
                setIsLoading(false);
            }
        };

        fetchAndSelectQuestion();
    }, [testQuestionIndex, selectedCategoryIndices, categoryVariations]);

    // Timer for work phase
    useEffect(() => {
        if (roundEndedRef.current) return;

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

    // Hidden 12-minute absolute timeout - auto-submits with "0" if no answer
    useEffect(() => {
        if (roundEndedRef.current) return;

        const absoluteTimeoutMs = 12 * 60 * 1000; // 12 minutes
        const timeoutId = setTimeout(() => {
            if (!roundEndedRef.current) {
                console.log("⏰ 12-minute absolute timeout reached, auto-submitting");
                roundEndedRef.current = true;
                saveAndComplete(true); // isAutoTimeout = true
            }
        }, absoluteTimeoutMs);

        return () => clearTimeout(timeoutId);
    }, [saveAndComplete]);

    // Validate that answer is a valid number
    const validateAnswer = (answer: string): boolean => {
        if (!answer.trim()) {
            setAnswerError("Please enter an answer");
            return false;
        }
        if (!isValidNumericAnswer(answer)) {
            setAnswerError("Please enter a valid number");
            return false;
        }
        setAnswerError(null);
        return true;
    };

    const handleSubmitAnswer = () => {
        if (!canSubmit || !validateAnswer(finalAnswer)) return;
        roundEndedRef.current = true;
        saveAndComplete();
    };

    if (isLoading) {
        return (
            <div className="h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] flex items-center justify-center">
                <div className="text-white text-xl">Loading test question...</div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] flex items-center justify-center">
                <div className="text-red-400 text-xl">Error: {error}</div>
            </div>
        );
    }

    if (!currentQuestion) {
        return (
            <div className="h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] flex items-center justify-center">
                <div className="text-white text-xl">Initializing...</div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4 flex flex-col overflow-hidden fixed inset-0">
            <div className="w-full max-w-4xl mx-auto flex flex-col h-full overflow-hidden">
                <div className="mb-4">
                    <h2 className="text-2xl text-white font-bold text-center mb-2">
                        Test Question {testQuestionIndex + 1} of 2
                    </h2>
                </div>

                <ProblemDisplay
                    question={currentQuestion.question}
                    timeLeft={0}
                    timeElapsed={timeElapsed}
                    hasSubmittedAnswer={false}
                    isMultiScenario={false}
                    canSkip={false}
                    onSkip={() => {}}
                />

                <div className="bg-white/10 p-4 rounded-lg mb-4 border border-purple-400">
                    <h3 className="text-lg text-white font-semibold mb-3">Your Answer (enter a number)</h3>
                    <input
                        type="text"
                        inputMode="decimal"
                        value={finalAnswer}
                        onChange={(e) => {
                            setFinalAnswer(e.target.value);
                            if (answerError) setAnswerError(null);
                        }}
                        placeholder="Enter your numeric answer..."
                        className={`w-full bg-white/10 text-white border rounded-md px-4 py-3 text-lg mb-2 placeholder-gray-400 focus:outline-none ${
                            answerError ? "border-red-500 focus:border-red-400" : "border-gray-500 focus:border-purple-400"
                        }`}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && canSubmit && finalAnswer.trim()) {
                                handleSubmitAnswer();
                            }
                        }}
                    />
                    {answerError && (
                        <p className="text-red-400 text-sm mb-2">{answerError}</p>
                    )}
                    <div className="flex justify-center mt-2">
                        <button
                            onClick={handleSubmitAnswer}
                            disabled={!finalAnswer.trim() || !canSubmit}
                            className={`px-8 py-3 rounded-lg text-lg font-bold transition-all ${
                                finalAnswer.trim() && canSubmit
                                    ? "bg-green-600 hover:bg-green-700 text-white"
                                    : "bg-gray-700 text-gray-400 cursor-not-allowed"
                            }`}
                        >
                            {canSubmit ? "Submit Answer" : `Wait ${Math.max(1, 10 - timeElapsed)}s...`}
                        </button>
                    </div>
                </div>

                <Scratchpad
                    content={scratchboardContent}
                    onContentChange={setScratchboardContent}
                    isReadOnly={false}
                />
            </div>
        </div>
    );
}
