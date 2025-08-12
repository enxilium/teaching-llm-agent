/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useFlow } from "@/context/FlowContext";
import { Message } from "@/utils/types";
import { prepareMessagesForStorage } from "@/utils/messageUtils";
import { Agent, loadAgents } from "@/lib/agents";
import ProblemDisplay from "@/components/ProblemDisplay";
import AnswerInput from "@/components/AnswerInput";
import Scratchpad from "@/components/Scratchpad";
import MultiScenarioChat from "@/components/MultiScenarioChat";

interface Question {
    id: number;
    question: string;
    options?: Record<string, string>;
    answer: string;
    correctAnswer?: string;
}

export default function MultiPage() {
    const {
        completeLesson,
        lessonQuestionIndex,
        saveSessionData: saveToFlowContext,
        lessonType,
    } = useFlow();
    const [sessionStartTime] = useState<Date>(new Date());
    const [messages, setMessages] = useState<Message[]>([]);
    const [allMessages, setAllMessages] = useState<Message[]>([]);
    const [agentContextMessage, setAgentContextMessage] = useState<Message | null>(null);
    const [scratchboardContent, setScratchboardContent] = useState("");
    const [finalAnswer, setFinalAnswer] = useState("");
    const [isQuestioningEnabled, setIsQuestioningEnabled] = useState(false);
    const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
    const [allQuestions, setAllQuestions] = useState<Question[]>([]);
    const [loadedQuestions, setLoadedQuestions] = useState(false);
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [timeLeft, setTimeLeft] = useState(300); // 5 minutes
    const roundEndedRef = useRef(false);
    const [canSubmit, setCanSubmit] = useState(false);
    const [canSkip, setCanSkip] = useState(process.env.NODE_ENV === "development"); // Enable immediately in development
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(
        null
    );
    const [agents, setAgents] = useState<Agent[]>([]);

    useEffect(() => {
        const init = async () => {
            const loadedAgents = await loadAgents([
                "arithmetic", // Alice goes first
                "concept",    // Charlie goes second  
                "bob",        // Bob goes last to provide feedback
            ]);
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
                const newTime = prev - 1;
                
                // Enable skip button after 2 minutes (when 3 minutes remain) or immediately in development
                if ((newTime <= 180 && !canSkip) || (process.env.NODE_ENV === "development" && !canSkip)) {
                    setCanSkip(true);
                }
                
                if (newTime <= 1) {
                    roundEndedRef.current = true;
                    setIsQuestioningEnabled(false);
                    const finalAnswerText =
                        finalAnswer.trim() || "No answer specified";
                    saveSessionData(finalAnswerText, true).finally(() => {
                        completeLesson();
                    });
                    return 0;
                }
                return newTime;
            });
        }, 1000);

        return () => clearInterval(timerId);
    }, [hasSubmittedAnswer, finalAnswer, canSkip]);

    const checkAnswerCorrectness = useCallback((
        userAnswer: string,
        question: Question
    ): boolean => {
        if (!question || !question.correctAnswer) return false;
        return (
            userAnswer.trim().toLowerCase() ===
            question.correctAnswer.trim().toLowerCase()
        );
    }, []);

    const saveSessionData = useCallback(async (
        finalAnswerText: string,
        isTimeout: boolean
    ) => {
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
    }, [currentQuestion, sessionStartTime, scratchboardContent, allMessages, lessonType, saveToFlowContext, checkAnswerCorrectness]);

    const handleSend = () => {
        setHasSubmittedAnswer(true);
        setIsQuestioningEnabled(true);
        setTimeLeft(300); // Reset timer to 5 minutes when scenario starts
        setCanSkip(process.env.NODE_ENV === "development"); // Reset skip button, enable immediately in development

        const submissionText = finalAnswer.trim() || "No answer specified";

        // Format message based on whether user provided reasoning
        const hasReasoning = scratchboardContent.trim().length > 0;
        const messageText = hasReasoning 
            ? `Final Answer: ${submissionText}\n\nReasoning: ${scratchboardContent.trim()}`
            : `Final Answer: ${submissionText}`;

        // Create display version (without question context)
        const userDisplayMessage: Message = {
            id: Date.now() * 1000, // Use larger number to avoid conflicts with agent messages
            sender: "user",
            text: messageText,
            timestamp: new Date().toISOString(),
        };

        // Create agent version (with question context)
        const userAgentMessage: Message = {
            ...userDisplayMessage,
            text: `Question: ${currentQuestion?.question || "Unknown question"}

${userDisplayMessage.text}`,
        };

        // Use display version for UI, but pass agent version to Chat component
        setMessages([userDisplayMessage]);
        setAllMessages([userDisplayMessage]); // Track display version in allMessages
        setAgentContextMessage(userAgentMessage); // Store agent version for Chat
    };

    const handleNewMessage = (message: Message) => {
        setMessages((prev) => [...prev, message]);
        setAllMessages((prev) => [...prev, message]);
    };

    const handleSkip = useCallback(() => {
        if (!canSkip || roundEndedRef.current) return;
        
        roundEndedRef.current = true;
        setIsQuestioningEnabled(false);
        const finalAnswerText = finalAnswer.trim() || "No answer specified";
        saveSessionData(finalAnswerText, false).finally(() => {
            completeLesson();
        });
    }, [canSkip, finalAnswer, saveSessionData, completeLesson]);

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
                        canSkip={canSkip}
                        onSkip={handleSkip}
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
                <MultiScenarioChat
                    agents={agents}
                    initialMessages={messages}
                    onNewMessage={handleNewMessage}
                    isQuestioningEnabled={true}
                    setIsQuestioningEnabled={() => {}}
                    triggerInitialResponse={true}
                    currentQuestion={currentQuestion || undefined}
                    agentContextMessage={agentContextMessage || undefined}
                />
            )}
        </div>
    );
}
