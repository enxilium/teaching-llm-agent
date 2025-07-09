"use client";

import { useState, useEffect } from "react";
import { useFlow } from "@/context/FlowContext";
import ProblemDisplay from "@/components/ProblemDisplay";
import AnswerInput from "@/components/AnswerInput";
import Scratchpad from "@/components/Scratchpad";

interface Question {
    id: number;
    question: string;
    options?: Record<string, string>;
    answer: string;
    correctAnswer?: string;
}

export default function SoloPage() {
    const {
        completeLesson,
        lessonQuestionIndex,
        saveSessionData: saveToFlowContext,
        lessonType,
    } = useFlow();
    const [sessionStartTime] = useState<Date>(new Date());
    const [scratchboardContent, setScratchboardContent] = useState("");
    const [finalAnswer, setFinalAnswer] = useState("");
    const [allQuestions, setAllQuestions] = useState<Question[]>([]);
    const [loadedQuestions, setLoadedQuestions] = useState(false);
    const [timeElapsed, setTimeElapsed] = useState(0);
    const [canSubmit, setCanSubmit] = useState(false);
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(
        null
    );
    const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
    const [feedback, setFeedback] = useState<string>("");

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
        if (loadedQuestions && allQuestions.length > 0 && !currentQuestion) {
            if (
                typeof lessonQuestionIndex === "number" &&
                lessonQuestionIndex < allQuestions.length
            ) {
                setCurrentQuestion(allQuestions[lessonQuestionIndex]);
            } else {
                setCurrentQuestion(allQuestions[0]);
            }
        }
    }, [loadedQuestions, allQuestions, lessonQuestionIndex, currentQuestion]);

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

    const checkAnswerCorrectness = (
        userAnswer: string,
        question: Question
    ): boolean => {
        if (!question || !question.correctAnswer) return false;
        return (
            userAnswer.trim().toLowerCase() ===
            question.correctAnswer.trim().toLowerCase()
        );
    };

    const saveSessionData = async (finalAnswerText: string) => {
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
                messages: [], // No messages in solo mode
                isCorrect: checkAnswerCorrectness(
                    finalAnswerText,
                    currentQuestion
                ),
                timeoutOccurred: false, // No timeout in solo mode
                lessonType: lessonType ?? undefined,
            };
            await saveToFlowContext(sessionData);
        }
    };

    const handleSend = () => {
        const submissionText = finalAnswer.trim() || "No answer specified";
        
        // Check if answer is correct
        const isCorrect = checkAnswerCorrectness(submissionText, currentQuestion!);
        
        // Generate feedback
        if (isCorrect) {
            setFeedback("Correct! Well done.");
        } else {
            const correctAnswer = currentQuestion?.correctAnswer || currentQuestion?.answer || "";
            setFeedback(`Incorrect. The correct answer is: ${correctAnswer}`);
        }
        
        setHasSubmittedAnswer(true);
        
        // Save session data and complete after a delay
        saveSessionData(submissionText).finally(() => {
            setTimeout(() => {
                completeLesson();
            }, 3000); // 3 second delay to show feedback
        });
    };

    if (!currentQuestion) {
        return (
            <div className="flex flex-col h-screen justify-center items-center bg-gray-900 text-white">
                <div className="text-2xl">Loading question...</div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4 flex flex-row overflow-hidden fixed inset-0">
            <div className="w-full flex flex-col h-full overflow-hidden">
                {currentQuestion && (
                    <ProblemDisplay
                        question={currentQuestion.question}
                        timeLeft={0}
                        timeElapsed={timeElapsed}
                        hasSubmittedAnswer={hasSubmittedAnswer}
                        isMultiScenario={false}
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
                
                {/* Feedback Display */}
                {hasSubmittedAnswer && feedback && (
                    <div className="bg-white bg-opacity-10 rounded-lg p-4 m-4 border-l-4 border-purple-500">
                        <h3 className="text-lg font-bold text-white mb-2">Feedback</h3>
                        <p className="text-white">{feedback}</p>
                        <div className="mt-4 text-sm text-gray-300">
                            Proceeding to break in a moment...
                        </div>
                    </div>
                )}
                
                <Scratchpad
                    content={scratchboardContent}
                    onContentChange={setScratchboardContent}
                    isReadOnly={hasSubmittedAnswer}
                />
            </div>
        </div>
    );
}
