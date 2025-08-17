/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useFlow } from "@/context/FlowContext";
import { Message } from "@/utils/types";
import { prepareMessagesForStorage } from "@/utils/messageUtils";
import ProblemDisplay from "@/components/ProblemDisplay";
import AnswerInput from "@/components/AnswerInput";
import Scratchpad from "@/components/Scratchpad";
import SingleScenarioChat from "@/components/SingleScenarioChat";
import { Agent, loadAgents } from "@/lib/agents";

// Define the question type to include multiple choice options
interface Question {
    id: number;
    question: string;
    options?: string[] | Record<string, string>; // Support both array and object formats
    answer: string;
    correctAnswer?: string;
}

export default function SinglePage() {
    const {
        completeLesson,
        lessonQuestionIndex,
        userId,
        saveSessionData: saveToFlowContext,
    } = useFlow();

    // --- STATE MANAGEMENT ---
    const [scratchboardContent, setScratchboardContent] = useState("");
    const [finalAnswer, setFinalAnswer] = useState("");
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(
        null
    );
    const [timeElapsed, setTimeElapsed] = useState(0); // Time counting up before submission (hidden)
    const [timeLeft, setTimeLeft] = useState(300); // Time counting down after discussion starts (5 minutes)
    const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
    const [sessionStartTime] = useState<Date>(new Date());
    const [canSubmit, setCanSubmit] = useState(false);
    const [canSkip, setCanSkip] = useState(true); // Enable immediately for development branch
    const [agents, setAgents] = useState<Agent[]>([]);
    const [initialMessages, setInitialMessages] = useState<Message[]>([]);
    const [allMessages, setAllMessages] = useState<Message[]>([]);
    const roundEndedRef = useRef(false);

    useEffect(() => {
        const init = async () => {
            const loadedAgents = await loadAgents(["bob"]);
            setAgents(loadedAgents);
        };
        init();
    }, []);

    const saveSessionData = useCallback(async (userAnswer: string, wasTimeout: boolean) => {
        const endTime = new Date();
        const sessionDuration =
            (endTime.getTime() - sessionStartTime.getTime()) / 1000;

        if (currentQuestion) {
            const sessionData = {
                userId: userId || "",
                questionId: currentQuestion.id,
                questionText: currentQuestion.question,
                startTime: sessionStartTime,
                endTime: endTime,
                duration: sessionDuration,
                finalAnswer: userAnswer,
                scratchboardContent: scratchboardContent,
                messages: prepareMessagesForStorage(allMessages),
                isCorrect:
                    userAnswer.toLowerCase() ===
                    currentQuestion.answer.toLowerCase(),
                timeoutOccurred: wasTimeout,
            };
            await saveToFlowContext(sessionData);
        }
    }, [currentQuestion, userId, sessionStartTime, scratchboardContent, allMessages, saveToFlowContext]);

    useEffect(() => {
        const fetchQuestion = async () => {
            try {
                const response = await fetch("/questions.json");
                if (!response.ok) {
                    throw new Error("Failed to fetch questions");
                }

                const data = await response.json();
                const allQuestionsData = data.questions || [];

                if (
                    typeof lessonQuestionIndex === "number" &&
                    lessonQuestionIndex >= 0 &&
                    lessonQuestionIndex < allQuestionsData.length
                ) {
                    setCurrentQuestion(allQuestionsData[lessonQuestionIndex]);
                } else {
                    setCurrentQuestion(allQuestionsData[0]);
                }
            } catch (error) {
                console.error("Error loading question:", error);
                setCurrentQuestion(null);
            }
        };

        fetchQuestion();
    }, [lessonQuestionIndex]);

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
    }, [hasSubmittedAnswer]);

    useEffect(() => {
        if (!hasSubmittedAnswer || roundEndedRef.current) return;

        const timerId = setInterval(() => {
            setTimeLeft((prev) => {
                const newTime = prev - 1;
                
                // Enable skip button after 2 minutes (when 3 minutes remain) or immediately in development
                if (newTime <= 180 && !canSkip) {
                    setCanSkip(true);
                }
                
                if (newTime <= 1) {
                    roundEndedRef.current = true;
                    const userAnswerText =
                        finalAnswer.trim() || "No answer provided";
                    saveSessionData(userAnswerText, false).then(() => {
                        completeLesson();
                    });
                    return 0;
                }
                return newTime;
            });
        }, 1000);

        return () => clearInterval(timerId);
    }, [hasSubmittedAnswer, completeLesson, finalAnswer, saveSessionData, canSkip]);

    const handleSend = () => {
        const submissionText = finalAnswer.trim() || "No answer specified";
        const reasoning = scratchboardContent.trim();
        
        // Use a more robust unique ID to avoid conflicts with agent messages
        const uniqueId = Date.now() * 1000; // Large number to avoid conflicts
        
        // Format message based on whether reasoning was provided
        let messageText = `Final Answer: ${submissionText}`;
        if (reasoning) {
            messageText += `\n\nReasoning: ${reasoning}`;
        }
        
        const userFinalAnswer: Message = {
            id: uniqueId,
            sender: "user",
            text: messageText,
            timestamp: new Date().toISOString(),
        };

        setInitialMessages([userFinalAnswer]);
        setAllMessages([userFinalAnswer]); // Track in allMessages too
        setHasSubmittedAnswer(true);
        setTimeLeft(300); // Reset timer to 5 minutes when scenario starts
        setCanSkip(true); // Reset skip button, enable immediately for development branch
    };

    const handleNewMessage = useCallback((message: Message) => {
        setAllMessages((prev) => [...prev, message]);
    }, []);

    const handleSkip = useCallback(() => {
        if (!canSkip || roundEndedRef.current) return;
        
        roundEndedRef.current = true;
        const userAnswerText = finalAnswer.trim() || "No answer provided";
        saveSessionData(userAnswerText, false).then(() => {
            completeLesson();
        });
    }, [canSkip, finalAnswer, saveSessionData, completeLesson]);

    if (!currentQuestion) {
        return (
            <div className="flex flex-col h-screen justify-center items-center bg-gray-900 text-white">
                <div className="text-2xl">Loading question...</div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4 flex flex-row overflow-hidden fixed inset-0">
            <div
                className={`${
                    hasSubmittedAnswer ? "w-1/2 pr-2" : "w-full"
                } flex flex-col h-full overflow-hidden`}
            >
                {currentQuestion && (
                    <ProblemDisplay
                        question={currentQuestion.question}
                        timeLeft={timeLeft}
                        timeElapsed={timeElapsed}
                        hasSubmittedAnswer={hasSubmittedAnswer}
                        isMultiScenario={false}
                        canSkip={canSkip}
                        onSkip={handleSkip}
                    />
                )}
                <AnswerInput
                    options={
                        currentQuestion?.options as
                            | Record<string, string>
                            | undefined
                    }
                    finalAnswer={finalAnswer}
                    setFinalAnswer={setFinalAnswer}
                    handleSend={handleSend}
                    hasSubmittedAnswer={hasSubmittedAnswer}
                    canSubmit={canSubmit}
                    timeElapsed={timeElapsed}
                    typingMessageIds={[]}
                />
                <Scratchpad
                    content={scratchboardContent}
                    onContentChange={setScratchboardContent}
                    isReadOnly={hasSubmittedAnswer}
                />
            </div>
            {hasSubmittedAnswer && (
                <SingleScenarioChat
                    key="single-chat" // Add a stable key
                    agents={agents}
                    initialMessages={initialMessages}
                    onNewMessage={handleNewMessage}
                    isQuestioningEnabled={true}
                    setIsQuestioningEnabled={() => {}} // SingleScenarioChat manages this internally now
                    triggerInitialResponse={true}
                    currentQuestion={currentQuestion || undefined}
                />
            )}
        </div>
    );
}
