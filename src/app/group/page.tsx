"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useFlow } from "@/context/FlowContext";
import { Message } from "@/utils/types";
import { prepareMessagesForStorage } from "@/utils/messageUtils";
import { Agent, loadAgents } from "@/lib/agents";
import ProblemDisplay from "@/components/ProblemDisplay";
import AnswerInput from "@/components/AnswerInput";
import Scratchpad from "@/components/Scratchpad";
import Chat from "@/components/Chat";

interface Question {
    id: number;
    question: string;
    options?: Record<string, string>;
    answer: string;
    correctAnswer?: string;
}

export default function GroupPage() {
    const {
        completeLesson,
        lessonQuestionIndex,
        saveSessionData: saveToFlowContext,
        lessonType,
    } = useFlow();
    const [sessionStartTime] = useState<Date>(new Date());
    const [messages, setMessages] = useState<Message[]>([]);
    const [allMessages, setAllMessages] = useState<Message[]>([]);
    const [scratchboardContent, setScratchboardContent] = useState("");
    const [finalAnswer, setFinalAnswer] = useState("");
    const [isQuestioningEnabled, setIsQuestioningEnabled] = useState(false);
    const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
    const [allQuestions, setAllQuestions] = useState<Question[]>([]);
    const [loadedQuestions, setLoadedQuestions] = useState(false);
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [timeLeft, setTimeLeft] = useState(120);
    const roundEndedRef = useRef(false);
    const [canSubmit, setCanSubmit] = useState(false);
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(
        null
    );
    const [agents, setAgents] = useState<Agent[]>([]);

    const checkAnswerCorrectness = useCallback(
        (userAnswer: string, question: Question): boolean => {
            if (!question || !question.correctAnswer) return false;
            return (
                userAnswer.trim().toLowerCase() ===
                question.correctAnswer.trim().toLowerCase()
            );
        },
        []
    );

    const saveSessionData = useCallback(
        async (finalAnswerText: string, isTimeout: boolean) => {
            const endTime = new Date();
            const sessionDuration =
                (endTime.getTime() - sessionStartTime.getTime()) / 1000;

            if (currentQuestion) {
                const sessionData = {
                    userId: "test_user",
                    questionId: currentQuestion.id,
                    questionText: currentQuestion.question,
                    startTime: sessionStartTime,
                    endTime: endTime,
                    duration: sessionDuration,
                    finalAnswer: finalAnswerText,
                    scratchboardContent: scratchboardContent,
                    messages: prepareMessagesForStorage(allMessages),
                    isCorrect: checkAnswerCorrectness(
                        finalAnswerText,
                        currentQuestion
                    ),
                    timeoutOccurred: isTimeout,
                    lessonType: lessonType ?? undefined,
                };
                await saveToFlowContext(sessionData);
            }
        },
        [
            sessionStartTime,
            currentQuestion,
            scratchboardContent,
            allMessages,
            checkAnswerCorrectness,
            lessonType,
            saveToFlowContext,
        ]
    );

    useEffect(() => {
        const init = async () => {
            const loadedAgents = await loadAgents(["concept", "arithmetic"]);
            setAgents(loadedAgents);
        };
        init();
    }, []);

    useEffect(() => {
        const fetchQuestions = async () => {
            try {
                const response = await fetch("/questions.json");
                if (!response.ok) throw new Error("Failed to fetch questions");
                const data = await response.json();
                setAllQuestions(data.questions || []);
                setLoadedQuestions(true);
            } catch (error) {
                console.error("Error loading questions:", error);
            }
        };

        fetchQuestions();
    }, []);

    useEffect(() => {
        if (
            agents.length > 0 &&
            loadedQuestions &&
            allQuestions.length > 0 &&
            !currentQuestion
        ) {
            if (
                typeof lessonQuestionIndex === "number" &&
                lessonQuestionIndex < allQuestions.length
            ) {
                setCurrentQuestion(allQuestions[lessonQuestionIndex]);
            } else {
                setCurrentQuestion(allQuestions[0]);
            }
        }
    }, [
        agents,
        loadedQuestions,
        allQuestions,
        lessonQuestionIndex,
        currentQuestion,
    ]);

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

    useEffect(() => {
        if (!hasSubmittedAnswer || roundEndedRef.current) return;

        const timerId = setInterval(() => {
            setTimeLeft((prev) => {
                if (prev <= 1) {
                    roundEndedRef.current = true;
                    setIsQuestioningEnabled(false);
                    const finalAnswerText =
                        finalAnswer.trim() || "No answer specified";
                    saveSessionData(finalAnswerText, true).finally(() => {
                        completeLesson();
                    });
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timerId);
    }, [hasSubmittedAnswer, finalAnswer, completeLesson, saveSessionData]);

    const handleSend = () => {
        setHasSubmittedAnswer(true);
        setIsQuestioningEnabled(true);
        setTimeLeft(120); // Reset timer to 2 minutes when scenario starts

        const submissionText = finalAnswer.trim() || "No answer specified";

        const userFinalAnswer: Message = {
            id: Date.now() * 1000, // Use larger number to avoid conflicts with agent messages
            sender: "user",
            text: `My final answer is: ${submissionText}\n\nMy reasoning:\n${
                scratchboardContent.trim() || "[No work shown]"
            }`,
            timestamp: new Date().toISOString(),
        };

        setMessages([userFinalAnswer]);
        setAllMessages([userFinalAnswer]); // Track in allMessages too
    };

    const handleNewMessage = (message: Message) => {
        setMessages((prev) => [...prev, message]);
        setAllMessages((prev) => [...prev, message]);
    };

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
                        isMultiScenario={true}
                    />
                )}
                {currentQuestion && (
                    <AnswerInput
                        options={currentQuestion.options}
                        finalAnswer={finalAnswer}
                        setFinalAnswer={setFinalAnswer}
                        handleSend={handleSend}
                        hasSubmittedAnswer={hasSubmittedAnswer}
                        canSubmit={canSubmit}
                        timeElapsed={timeElapsed}
                        typingMessageIds={[]}
                    />
                )}
                <Scratchpad
                    content={scratchboardContent}
                    onContentChange={setScratchboardContent}
                    isReadOnly={hasSubmittedAnswer}
                />
            </div>

            {hasSubmittedAnswer && (
                <Chat
                    agents={agents}
                    initialMessages={messages}
                    onNewMessage={handleNewMessage}
                    isQuestioningEnabled={true}
                    setIsQuestioningEnabled={() => {}}
                    triggerInitialResponse={true}
                    currentQuestion={currentQuestion || undefined}
                />
            )}
        </div>
    );
}
