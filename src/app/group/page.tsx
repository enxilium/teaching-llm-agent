"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useFlow } from "@/context/FlowContext";
import { Message, QuestionSubmission, isValidNumericAnswer, checkAnswerCorrectness } from "@/utils/types";
import { prepareMessagesForStorage } from "@/utils/messageUtils";
import { Agent, loadAgents } from "@/lib/agents";
import ProblemDisplay from "@/components/ProblemDisplay";
import Scratchpad from "@/components/Scratchpad";
import GroupScenarioChat from "@/components/GroupScenarioChat";

interface CurrentQuestion {
    id: number;
    categoryId: string;
    question: string;
    answer: string;
}

export default function GroupPage() {
    const {
        completeLesson,
        lessonQuestionIndex,
        selectedCategoryIndices,
        categoryVariations,
        saveQuestionSubmission,
        lessonType,
    } = useFlow();
    
    const [sessionStartTime, setSessionStartTime] = useState<Date>(new Date());
    const [questionLoadTime, setQuestionLoadTime] = useState<string>(new Date().toISOString());
    const [skipTime, setSkipTime] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [allMessages, setAllMessages] = useState<Message[]>([]);
    const [scratchboardContent, setScratchboardContent] = useState("");
    const [finalAnswer, setFinalAnswer] = useState("");
    const [answerError, setAnswerError] = useState<string | null>(null);
    const [isQuestioningEnabled, setIsQuestioningEnabled] = useState(false);
    const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [timeLeft, setTimeLeft] = useState(300);
    const roundEndedRef = useRef(false);
    const [canSubmit, setCanSubmit] = useState(false);
    const [canSkip, setCanSkip] = useState(false);
    const [currentQuestion, setCurrentQuestion] = useState<CurrentQuestion | null>(null);
    const [agents, setAgents] = useState<Agent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const saveAndComplete = useCallback(
        async (isTimeout: boolean, wasSkipped: boolean = false, isAutoTimeout: boolean = false) => {
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
                phase: "lesson",
                questionIndex: lessonQuestionIndex,
                questionText: currentQuestion.question,
                correctAnswer: currentQuestion.answer,
                userAnswer: userAnswer,
                scratchboardContent: scratchboardContent,
                messages: prepareMessagesForStorage(allMessages),
                startTime: questionLoadTime,
                endTime: endTime.toISOString(),
                durationSeconds: durationSeconds,
                isCorrect: isCorrect,
                timeoutOccurred: isTimeout,
                skipTime: wasSkipped ? skipTime : null,
                lessonType: lessonType,
            };

            saveQuestionSubmission(submission);
            completeLesson();
        },
        [
            sessionStartTime,
            questionLoadTime,
            skipTime,
            currentQuestion,
            scratchboardContent,
            allMessages,
            lessonType,
            lessonQuestionIndex,
            finalAnswer,
            saveQuestionSubmission,
            completeLesson,
        ]
    );

    // Track the question index to detect changes and reset state
    const previousQuestionIndexRef = useRef(lessonQuestionIndex);
    
    // Reset all component state when lessonQuestionIndex changes (moving to next question)
    useEffect(() => {
        if (previousQuestionIndexRef.current !== lessonQuestionIndex) {
            console.log(`📝 Question index changed from ${previousQuestionIndexRef.current} to ${lessonQuestionIndex}, resetting state`);
            previousQuestionIndexRef.current = lessonQuestionIndex;
            
            // Reset all state for the new question
            setMessages([]);
            setAllMessages([]);
            setScratchboardContent("");
            setFinalAnswer("");
            setAnswerError(null);
            setIsQuestioningEnabled(false);
            setHasSubmittedAnswer(false);
            setTimeElapsed(0);
            setTimeLeft(300);
            roundEndedRef.current = false;
            setCanSubmit(false);
            setCanSkip(false);
            setCurrentQuestion(null);
            setIsLoading(true);
            setError(null);
            setSkipTime(null);
            // Reset time tracking for new question
            setSessionStartTime(new Date());
            setQuestionLoadTime(new Date().toISOString());
        }
    }, [lessonQuestionIndex]);

    // Load agents (Charlie and Alice as peers, no tutor)
    useEffect(() => {
        const init = async () => {
            // Note: Alice is 'arithmetic' (correct concepts, wrong calculations)
            // Charlie is 'concept' (wrong concepts, correct calculations)
            const loadedAgents = await loadAgents(["concept", "arithmetic"]);
            setAgents(loadedAgents);
        };
        init();
    }, []);

    // Load question
    useEffect(() => {
        const fetchAndSelectQuestion = async () => {
            setIsLoading(true);
            setError(null);
            
            try {
                console.log("Loading question...", { lessonQuestionIndex, selectedCategoryIndices, categoryVariations });
                
                const response = await fetch("/questions.json");
                if (!response.ok) throw new Error("Failed to fetch questions");
                const data = await response.json();
                
                if (!data.categories || !selectedCategoryIndices || selectedCategoryIndices.length === 0) {
                    console.log("No categories or indices available yet");
                    setIsLoading(false);
                    return;
                }
                
                const safeIndex = Math.min(Math.max(0, lessonQuestionIndex), 1);
                const categoryIndex = selectedCategoryIndices[safeIndex];
                const category = data.categories[categoryIndex];
                
                if (!category) {
                    throw new Error(`Category not found at index ${categoryIndex}`);
                }
                
                const variationIdx = categoryVariations?.find(cv => cv.categoryIndex === categoryIndex)?.lessonVariation ?? 0;
                const questionData = category.variations?.[variationIdx];
                
                if (!questionData) {
                    throw new Error(`Question variation not found`);
                }
                
                console.log("Question loaded:", questionData.question.substring(0, 50) + "...");
                
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
    }, [lessonQuestionIndex, selectedCategoryIndices, categoryVariations]);

    // Timer for work phase
    useEffect(() => {
        if (hasSubmittedAnswer || roundEndedRef.current) return;

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
    }, [hasSubmittedAnswer, canSubmit]);

    // Timer for chat phase
    useEffect(() => {
        if (!hasSubmittedAnswer || roundEndedRef.current) return;

        const timerId = setInterval(() => {
            setTimeLeft((prev) => {
                const newTime = prev - 1;
                // Dev: 10s cooldown (skip when 290s left), Prod: 2min cooldown (skip when 180s left)
                const skipThreshold = process.env.NODE_ENV === "development" ? 290 : 180;
                if (newTime <= skipThreshold && !canSkip) {
                    setCanSkip(true);
                }
                if (newTime <= 1) {
                    roundEndedRef.current = true;
                    setIsQuestioningEnabled(false);
                    saveAndComplete(true);
                    return 0;
                }
                return newTime;
            });
        }, 1000);

        return () => clearInterval(timerId);
    }, [hasSubmittedAnswer, saveAndComplete, canSkip]);

    // Hidden 12-minute absolute timeout - auto-submits with "0" if no answer
    useEffect(() => {
        if (roundEndedRef.current) return;

        const absoluteTimeoutMs = 12 * 60 * 1000; // 12 minutes
        const timeoutId = setTimeout(() => {
            if (!roundEndedRef.current) {
                console.log("⏰ 12-minute absolute timeout reached, auto-submitting");
                roundEndedRef.current = true;
                setIsQuestioningEnabled(false);
                saveAndComplete(true, false, true); // isAutoTimeout = true
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
        if (!validateAnswer(finalAnswer)) return;
        
        setHasSubmittedAnswer(true);
        setIsQuestioningEnabled(true);
        setTimeLeft(300);
        setCanSkip(false);

        const messageText = `My answer: ${finalAnswer.trim()}`;

        const userFinalAnswer: Message = {
            id: Date.now(),
            sender: "user",
            text: messageText,
            timestamp: new Date().toISOString(),
        };

        setMessages([userFinalAnswer]);
        setAllMessages([userFinalAnswer]);
    };

    const handleNewMessage = (message: Message) => {
        setMessages((prev) => [...prev, message]);
        setAllMessages((prev) => [...prev, message]);
    };

    const handleSkip = useCallback(() => {
        if (!canSkip || roundEndedRef.current) return;
        
        // Record the skip time
        const currentSkipTime = new Date().toISOString();
        setSkipTime(currentSkipTime);
        
        roundEndedRef.current = true;
        setIsQuestioningEnabled(false);
        saveAndComplete(false, true);
    }, [canSkip, saveAndComplete]);

    if (isLoading) {
        return (
            <div className="h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] flex items-center justify-center">
                <div className="text-white text-xl">Loading question...</div>
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
        <div className="h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4 flex flex-row overflow-hidden fixed inset-0">
            <div className={`${hasSubmittedAnswer ? "w-1/2 pr-2" : "w-full max-w-4xl mx-auto"} flex flex-col h-full overflow-hidden`}>
                <ProblemDisplay
                    question={currentQuestion.question}
                    timeLeft={timeLeft}
                    timeElapsed={timeElapsed}
                    hasSubmittedAnswer={hasSubmittedAnswer}
                    isMultiScenario={true}
                    canSkip={canSkip}
                    onSkip={handleSkip}
                />

                {!hasSubmittedAnswer && (
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
                )}

                <Scratchpad
                    content={scratchboardContent}
                    onContentChange={setScratchboardContent}
                    isReadOnly={hasSubmittedAnswer}
                />
            </div>

            {hasSubmittedAnswer && (
                <GroupScenarioChat
                    agents={agents}
                    initialMessages={messages}
                    onNewMessage={handleNewMessage}
                    isQuestioningEnabled={isQuestioningEnabled}
                    setIsQuestioningEnabled={setIsQuestioningEnabled}
                    triggerInitialResponse={true}
                    currentQuestion={{
                        id: currentQuestion.id,
                        question: currentQuestion.question,
                        answer: currentQuestion.answer
                    }}
                    scratchboardContent={scratchboardContent}
                />
            )}
        </div>
    );
}
