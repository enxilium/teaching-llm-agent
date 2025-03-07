'use client'

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { aiService, AI_MODELS } from '@/services/AI';
import { Message } from '@/utils/types';
import TypewriterTextWrapper from "@/components/TypewriterTextWrapper";

export default function SelfLearningPage() {
    const router = useRouter();

    // State management
    const [messages, setMessages] = useState<Message[]>([]);
    const [completedMessageIds, setCompletedMessageIds] = useState<number[]>([]);
    const [scratchboardContent, setScratchboardContent] = useState("");
    const [input, setInput] = useState("");
    const [nextMessageId, setNextMessageId] = useState(3);
    const [typingMessageIds, setTypingMessageIds] = useState<number[]>([]);
    const [isQuestioningEnabled, setIsQuestioningEnabled] = useState(true);
    const [evaluationComplete, setEvaluationComplete] = useState(false);
    const [userHasScrolled, setUserHasScrolled] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const [currentModel] = useState(AI_MODELS.CLAUDE_HAIKU.id);

    // Timer state
    const [timeLeft, setTimeLeft] = useState(120);
    const roundEndedRef = useRef(false);

    // Question tracking
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [usedQuestionIndices, setUsedQuestionIndices] = useState<number[]>([]);
    const [currentQuestion, setCurrentQuestion] = useState<any>(null);

    // Add this at the top of your component with other state declarations
    const nextMessageIdRef = useRef(3); // Start at 3 to match your initial state

    // Replace your existing getUniqueMessageId function with this:
    const getUniqueMessageId = () => {
        const id = nextMessageIdRef.current;
        nextMessageIdRef.current += 1;

        // Keep the state in sync for display purposes only (not for generating IDs)
        setNextMessageId(nextMessageIdRef.current);

        return id;
    };

    const handleScroll = () => {
        const chatContainer = chatContainerRef.current;
        if (!chatContainer) return;

        // Get the scroll position and dimensions
        const { scrollTop, scrollHeight, clientHeight } = chatContainer;
        const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

        if (distanceFromBottom > 10) {
            if (!userHasScrolled) {
                console.log("User manually scrolled - disabling auto-scroll");
                setUserHasScrolled(true);
            }
        } else {
            if (userHasScrolled) {
                console.log("User scrolled to bottom - re-enabling auto-scroll");
                setUserHasScrolled(false);
            }
        }
    };

    // Timer effect
    useEffect(() => {
        // Don't start the timer until we have a valid question
        if (!isQuestioningEnabled || roundEndedRef.current || !currentQuestion) return;

        console.log("Starting timer with question:", currentQuestion);

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setIsQuestioningEnabled(false);
                    roundEndedRef.current = true;
                    // Auto-submit with current question
                    autoSubmitTimeoutAnswer();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isQuestioningEnabled, currentQuestion]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const autoSubmitTimeoutAnswer = () => {
        // Get the current question directly from the DOM if state isn't available
        const fallbackQuestion = document.querySelector('.bg-white.bg-opacity-20 p')?.textContent ||
            "the current mathematical problem";
        const problemToUse = currentQuestion || fallbackQuestion;

        console.log("Timer ran out - auto-submitting with current problem:", problemToUse);

        setInput("[TIMEOUT] No answer submitted");
        setScratchboardContent("[TIMEOUT] The student ran out of time before submitting an answer.");

        setTimeout(() => {
            handleSend(true, problemToUse);
        }, 100);
    };

    // Handle submitting final answer
    const handleSend = async (isAutoSubmit = false, problemText = null) => {
        // Ensure we have the problem text - critical when timer runs out
        const problem = problemText || currentQuestion;

        console.log(`Handling ${isAutoSubmit ? 'auto' : 'user'} submission for problem:`, problem);

        // If this is a normal user submission, check inputs
        if (!isAutoSubmit) {
            if (!input.trim() || !isQuestioningEnabled) return;
            if (!scratchboardContent.trim()) {
                alert("Please use the scratchboard to show your reasoning before submitting your final answer.");
                return;
            }
        }

        const userMessageId = getUniqueMessageId();
        const solutionMessageId = getUniqueMessageId();

        const userFinalAnswer = `Final Answer: ${input.trim()}\n\nReasoning: ${scratchboardContent}`;

        // Add user message
        setMessages(prev => [
            ...prev,
            {
                id: userMessageId,
                sender: "user",
                text: userFinalAnswer
            }
        ]);
        setInput("");

        // Add typing indicator for solution
        setTypingMessageIds(prev => [...prev, solutionMessageId]);

        // Add placeholder
        setMessages(prev => [
            ...prev,
            {
                id: solutionMessageId,
                sender: "system",
                text: "...",
                agentId: "system"
            }
        ]);

        try {
            const solutionExpertPrompt = `You are a mathematics expert providing the official solution to a combinatorics problem.
Problem: "${problem}"
Provide a clear, step-by-step solution with the correct answer clearly stated.
Focus on accuracy, clarity and mathematical rigor.
This will serve as the reference solution for comparing student answers.`;

            // Get expert solution
            const expertSolution = await aiService.generateResponse(
                [{ id: 102, sender: "user", text: `Provide the solution to: ${problem}` }],
                {
                    systemPrompt: solutionExpertPrompt,
                    model: AI_MODELS.CLAUDE_HAIKU.id
                }
            );

            // Update the message
            setMessages(prev =>
                prev.map(msg => {
                    if (msg.id === solutionMessageId) {
                        return {
                            ...msg,
                            text: `**Official Solution:**\n${expertSolution}`,
                            onComplete: () => {
                                setTypingMessageIds(prev => prev.filter(id => id !== solutionMessageId));
                                setCompletedMessageIds(prev => [...prev, solutionMessageId]);
                                setEvaluationComplete(true);
                            }
                        };
                    }
                    return msg;
                })
            );

            // End questioning period
            setIsQuestioningEnabled(false);

        } catch (error) {
            console.error("Error getting solution:", error);

            // Update with error message
            setMessages(prev =>
                prev.map(msg => {
                    if (msg.id === solutionMessageId) {
                        return {
                            ...msg,
                            text: "I'm sorry, I encountered an error retrieving the solution.",
                            onComplete: () => {
                                setTypingMessageIds(prev => prev.filter(id => id !== solutionMessageId));
                                setEvaluationComplete(true);
                            }
                        };
                    }
                    return msg;
                })
            );

            // End questioning regardless of error
            setIsQuestioningEnabled(false);
        }
    };

    // Start a new round with a new question
    const startNewRound = async () => {
        try {
            // Add a loading state
            setMessages([{
                id: 1,
                sender: "system",
                text: "Loading a new problem for you...",
                agentId: "system"
            }]);

            const response = await fetch('/questions.json');

            if (!response.ok) {
                throw new Error(`Failed to fetch questions: ${response.status}`);
            }

            const data = await response.json();
            console.log("Loaded questions data:", data);

            if (!data.combinatorics || !Array.isArray(data.combinatorics) || data.combinatorics.length === 0) {
                throw new Error("No combinatorics questions found in data");
            }

            const combinatoricsQuestions = data.combinatorics;

            // Find available questions
            let availableIndices = Array.from(
                { length: combinatoricsQuestions.length },
                (_, i) => i
            ).filter(index => !usedQuestionIndices.includes(index));

            // Check if we've used all questions
            if (availableIndices.length === 0) {
                // Navigate to test screen
                if (typeof window !== 'undefined') {
                    router.push('/test');
                }
                return;
            }

            // Select a random question
            const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
            setCurrentQuestionIndex(randomIndex);
            setUsedQuestionIndices(prev => [...prev, randomIndex]);

            // Get the selected question
            const selectedQuestion = combinatoricsQuestions[randomIndex];
            console.log("Selected question:", selectedQuestion);

            // Set current question state
            setCurrentQuestion(selectedQuestion);

            // Set initial messages - simple intro for self-learning mode
            setMessages([
                {
                    id: 1,
                    sender: "system",
                    text: "Welcome to self-learning mode. Try solving this problem on your own.",
                    agentId: "system"
                },
                {
                    id: 2,
                    sender: "system",
                    text: selectedQuestion,
                    agentId: "system"
                }
            ]);

            // Reset for new round
            setNextMessageId(3);
            nextMessageIdRef.current = 3;
            setTimeLeft(120);
            setIsQuestioningEnabled(true);
            roundEndedRef.current = false;
            setScratchboardContent("");
            setInput("");
            setEvaluationComplete(false);
            setTypingMessageIds([]);
            setCompletedMessageIds([]);

        } catch (error) {
            console.error("Error fetching question:", error);

            // Use a fallback
            const fallbackQuestion = "In how many ways can 5 distinct books be distributed to 3 distinct students such that each student gets at least one book?";

            setCurrentQuestion(fallbackQuestion);

            setMessages([
                {
                    id: 1,
                    sender: "system",
                    text: "There was an issue loading questions from the server, but here's a problem for you to solve:",
                    agentId: "system"
                },
                {
                    id: 2,
                    sender: "system",
                    text: fallbackQuestion,
                    agentId: "system"
                }
            ]);

            // Continue with the fallback question
            setTimeLeft(120);
            setIsQuestioningEnabled(true);
            roundEndedRef.current = false;
        }
    };

    // Initialize with first question
    useEffect(() => {
        startNewRound();
    }, []);

    // Auto-scroll when messages change
    useEffect(() => {
        // Reset the userHasScrolled flag when a new message is added
        setUserHasScrolled(false);
    }, [messages]);

    // Handle next question button
    const handleNextQuestion = () => {
        setEvaluationComplete(false);
        startNewRound();
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4 flex flex-col">
            {/* Header with timer, title, and current question */}
            <div className="bg-white bg-opacity-10 rounded-md p-4 mb-4">
                <div className="flex justify-between items-center mb-3">
                    <div className="flex-1">
                        <h1 className="text-2xl text-white font-bold">Self-Learning Mode</h1>
                        <p className="text-sm text-gray-300">Solve problems independently</p>
                    </div>

                    {/* Timer */}
                    <div className={`p-2 rounded-lg ${timeLeft > 20 ? 'bg-green-700' : 'bg-red-700 animate-pulse'}`}>
                        <div className="text-xl font-mono text-white">{formatTime(timeLeft)}</div>
                        <div className="text-xs text-center text-gray-300">
                            {isQuestioningEnabled ? "Problem Time" : "Time's Up"}
                        </div>
                    </div>
                </div>

                {/* Display current question prominently */}
                {currentQuestion && (
                    <div className="bg-white bg-opacity-20 p-3 rounded-md mt-2">
                        <h2 className="text-xl text-white font-semibold mb-2">Problem:</h2>
                        <p className="text-white">{currentQuestion}</p>
                    </div>
                )}
            </div>

            {/* Main chat area */}
            <div className="flex flex-1 flex-col overflow-hidden bg-white bg-opacity-10 rounded-md">
                {/* Chat messages */}
                <div className="flex-1 p-4 overflow-y-auto max-h-[40vh]"
                    ref={chatContainerRef}
                    onScroll={handleScroll}>
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={`mb-4 flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            {msg.sender === 'system' && (
                                <div className="mr-2 flex-shrink-0">
                                    <Image
                                        src="/system_avatar.png"
                                        alt="System"
                                        width={60}
                                        height={60}
                                        className="rounded-full border-2 border-white"
                                    />
                                </div>
                            )}

                            <div
                                className={`max-w-[75%] rounded-lg p-3 ${msg.sender === 'user'
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-purple-700 text-white'
                                    }`}
                            >
                                {msg.sender === 'system' && (
                                    <div className="text-sm text-gray-300 mb-1 font-bold">
                                        {msg.id === 1 || msg.id === 2 ? "System" : "Official Solution"}
                                    </div>
                                )}

                                {msg.sender === 'system' && typingMessageIds.includes(msg.id) && msg.text === "..." ? (
                                    <div className="flex items-center space-x-2">
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                    </div>
                                ) : msg.sender === 'system' && typingMessageIds.includes(msg.id) ? (
                                    <TypewriterTextWrapper
                                        text={msg.text}
                                        speed={30}
                                        messageId={msg.id}
                                        onTypingProgress={() => {
                                            if (userHasScrolled) return;
                                            const chatContainer = chatContainerRef.current;
                                            if (chatContainer) {
                                                chatContainer.scrollTop = chatContainer.scrollHeight;
                                            }
                                        }}
                                        onTypingComplete={() => {
                                            console.log(`Message ${msg.id} completed typing`);
                                            setTimeout(() => {
                                                setTypingMessageIds(prev => prev.filter(id => id !== msg.id));
                                                setCompletedMessageIds(prev => [...prev, msg.id]);
                                                if (msg.onComplete) {
                                                    msg.onComplete();
                                                }
                                                if (!userHasScrolled && chatContainerRef.current) {
                                                    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
                                                }
                                            }, 100);
                                        }}
                                    />
                                ) : (
                                    <div className="whitespace-pre-wrap">{msg.text}</div>
                                )}
                            </div>
                        </div>
                    ))}
                    <div key="messages-end" />
                </div>

                {/* Input area */}
                <div className="p-4 bg-black bg-opacity-30">
                    {isQuestioningEnabled ? (
                        <div className="flex flex-col space-y-4">
                            {/* Input and submit button */}
                            <div className="flex space-x-2">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Type your final answer..."
                                    className="flex-1 bg-white bg-opacity-10 text-white border border-gray-700 rounded-md px-3 py-2"
                                />

                                <button
                                    onClick={() => handleSend()}
                                    disabled={!input.trim() || !scratchboardContent.trim() || typingMessageIds.length > 0}
                                    className={`px-4 py-2 rounded-md ${input.trim() && scratchboardContent.trim() && typingMessageIds.length === 0
                                        ? 'bg-green-600 hover:bg-green-700 text-white'
                                        : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                        }`}
                                >
                                    Submit Final Answer
                                </button>
                            </div>

                            {/* Scratchboard */}
                            <div className="border border-gray-700 rounded-md p-3 bg-black bg-opacity-50">
                                <div className="flex justify-between mb-2">
                                    <h3 className="text-white font-semibold">Your Scratchboard</h3>
                                    <div className="text-sm text-gray-400">
                                        Use this to work through the problem
                                    </div>
                                </div>
                                <textarea
                                    value={scratchboardContent}
                                    onChange={(e) => setScratchboardContent(e.target.value)}
                                    className="w-full h-32 bg-black bg-opacity-50 text-white border-none rounded p-2"
                                    placeholder="Work out your solution here..."
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="flex justify-between items-center">
                            <p className="text-white">
                                {evaluationComplete
                                    ? "Compare your solution with the official one and move on when ready!"
                                    : "Waiting for the official solution..."}
                            </p>
                            {evaluationComplete && (
                                <button
                                    onClick={handleNextQuestion}
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md"
                                >
                                    Next Question
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}