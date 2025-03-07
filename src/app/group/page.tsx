'use client'

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import TypewriterText from '@/components/TypewriterText';
import { aiService, AI_MODELS } from '@/services/AI';
import { Message } from '@/utils/types';
import TypewriterTextWrapper from "@/components/TypewriterTextWrapper";

export default function PeerOnlyPage() {
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
    const [botThinking, setBotThinking] = useState(false);
    const [userHasScrolled, setUserHasScrolled] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const [currentModel] = useState(AI_MODELS.CLAUDE_HAIKU.id);
    const [lastUserActivityTime, setLastUserActivityTime] = useState(Date.now());

    // Timer state
    const [timeLeft, setTimeLeft] = useState(120);
    const roundEndedRef = useRef(false);

    // Question tracking
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [usedQuestionIndices, setUsedQuestionIndices] = useState<number[]>([]);
    const [currentQuestion, setCurrentQuestion] = useState<any>(null);

    // Define the AI agents - only Logic Bot and Pattern Bot
    const agents = [
        {
            id: 'logic',
            name: 'Logic Bot',
            avatar: 'logic_avatar.png',
            systemPrompt: `You are Logic Bot, a student who excels at logical reasoning and step-by-step problem solving.
As a fellow student in the class, you discuss math problems with other students.
When asked about problems, provide logical analysis, structured thinking, and step-by-step reasoning.
Explain your thinking clearly but don't immediately give away full solutions unless the student is really stuck.
Ask thoughtful questions that help identify key logical structures or relationships in the problem.
Your goal is to guide peers toward understanding through structured logical reasoning.`
        },
        {
            id: 'pattern',
            name: 'Pattern Bot',
            avatar: 'pattern_avatar.png',
            systemPrompt: `You are Pattern Bot, a student who excels at recognizing patterns in math problems.
As a fellow student in the class, you discuss math problems with other students.
When asked about problems, focus on identifying patterns, visualizations, and creative approaches.
Explain your thinking clearly but don't immediately give away full solutions unless the student is really stuck.
Suggest different ways to visualize or reframe problems to reveal underlying patterns.
Your goal is to help peers see the problem from different angles and recognize elegant pattern-based solutions.`
        }
    ];

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

    // Add this helper function to use throughout your code
    const ensureNoTypingInProgress = (callback: () => void, maxDelay = 10000) => {
        const startTime = Date.now();

        const tryCallback = () => {
            // Safety timeout to prevent infinite waiting
            if (Date.now() - startTime > maxDelay) {
                console.warn('Timeout waiting for typing to complete, proceeding anyway');
                callback();
                return;
            }

            if (typingMessageIds.length > 0) {
                console.log(`Messages still typing: ${typingMessageIds.join(', ')}, delaying action`);
                setTimeout(tryCallback, 800);
                return;
            }

            // No typing in progress, safe to proceed
            console.log('No typing in progress, proceeding with action');
            callback();
        };

        tryCallback();
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

    useEffect(() => {
        const handleUserActivity = () => {
            setLastUserActivityTime(Date.now());
        };

        // Listen for user interactions
        document.addEventListener('keydown', handleUserActivity);
        document.addEventListener('mousedown', handleUserActivity);

        return () => {
            document.removeEventListener('keydown', handleUserActivity);
            document.removeEventListener('mousedown', handleUserActivity);
        };
    }, []);

    useEffect(() => {
        if (!isQuestioningEnabled || typingMessageIds.length > 0) return;

        const checkForBotInteraction = setInterval(() => {
            const timeSinceUserActivity = Date.now() - lastUserActivityTime;

            // If user has been inactive for 30+ seconds and bots aren't typing,
            // there's a chance they'll interact with each other
            if (timeSinceUserActivity > 30000 && typingMessageIds.length === 0 && Math.random() < 0.4) {
                triggerBotInteraction();
            }
        }, 15000); // Check every 15 seconds

        return () => clearInterval(checkForBotInteraction);
    }, [isQuestioningEnabled, typingMessageIds, lastUserActivityTime]);

    const triggerBotInteraction = async () => {
        // Randomly decide which bot speaks first
        const firstBot = Math.random() < 0.5 ? 'logic' : 'pattern';
        const secondBot = firstBot === 'logic' ? 'pattern' : 'logic';

        const firstBotName = firstBot === 'logic' ? 'Logic Bot' : 'Pattern Bot';
        const secondBotName = secondBot === 'logic' ? 'Logic Bot' : 'Pattern Bot';

        const firstBotMsgId = getUniqueMessageId();

        // First bot message
        setTypingMessageIds(prev => [...prev, firstBotMsgId]);
        setMessages(prev => [
            ...prev,
            {
                id: firstBotMsgId,
                sender: "ai",
                text: "...",
                agentId: firstBot
            }
        ]);

        try {
            const promptText = `${agents.find(a => a.id === firstBot)?.systemPrompt}
The user seems to be thinking. As ${firstBotName}, initiate a helpful discussion with ${secondBotName} about the problem: "${currentQuestion}"
Either:
1. Ask a thoughtful question to ${secondBotName} about an aspect of the problem where their perspective would be valuable
2. Point out something interesting about the problem that might help the group's understanding
3. Suggest a direction the group might explore to solve the problem

Keep your message brief (2-3 sentences) and make it feel natural, as if you're checking in during a group study session.`;

            const botResponse = await aiService.generateResponse([
                {
                    id: 998,
                    sender: "system",
                    text: `The current problem is: ${currentQuestion}\nRecent message history: ${messages.slice(-3).map(m => m.text).join(' | ')}`
                }
            ], {
                systemPrompt: promptText,
                model: currentModel
            });

            setMessages(prev =>
                prev.map(msg =>
                    msg.id === firstBotMsgId
                        ? {
                            ...msg,
                            text: botResponse,
                            onComplete: () => {
                                setTypingMessageIds(prev => prev.filter(id => id !== firstBotMsgId));
                                setCompletedMessageIds(prev => [...prev, firstBotMsgId]);

                                // After first bot finishes, have the second bot respond
                                setTimeout(() => triggerSecondBotResponse(secondBot, firstBotMsgId, botResponse), 1500);
                            }
                        }
                        : msg
                )
            );
        } catch (error) {
            console.error("Error in bot interaction:", error);
            setTypingMessageIds(prev => prev.filter(id => id !== firstBotMsgId));
        }
    };

    // Second bot responds to first bot
    const triggerSecondBotResponse = async (botId, previousMsgId, previousMsg) => {
        const botName = botId === 'logic' ? 'Logic Bot' : 'Pattern Bot';
        const botMessageId = getUniqueMessageId();

        setTypingMessageIds(prev => [...prev, botMessageId]);
        setMessages(prev => [
            ...prev,
            {
                id: botMessageId,
                sender: "ai",
                text: "...",
                agentId: botId
            }
        ]);

        try {
            const promptText = `${agents.find(a => a.id === botId)?.systemPrompt}
You are ${botName} responding to what the other bot just said: "${previousMsg}"
As ${botName}, give a thoughtful response that builds on their idea and potentially includes:
1. Your perspective on their point based on your ${botId === 'logic' ? 'logical reasoning' : 'pattern recognition'} approach
2. A follow-up question or suggestion that might help the student
3. A connection to a key concept in the problem

Keep your response conversational (2-3 sentences) and end with something that invites the student to share their thoughts.`;

            const botResponse = await aiService.generateResponse([
                {
                    id: 998,
                    sender: "system",
                    text: `The current problem is: ${currentQuestion}`
                },
                {
                    id: previousMsgId,
                    sender: "ai",
                    text: previousMsg
                }
            ], {
                systemPrompt: promptText,
                model: currentModel
            });

            setMessages(prev =>
                prev.map(msg =>
                    msg.id === botMessageId
                        ? {
                            ...msg,
                            text: botResponse,
                            onComplete: () => {
                                setTypingMessageIds(prev => prev.filter(id => id !== botMessageId));
                                setCompletedMessageIds(prev => [...prev, botMessageId]);
                            }
                        }
                        : msg
                )
            );
        } catch (error) {
            console.error("Error in bot response:", error);
            setTypingMessageIds(prev => prev.filter(id => id !== botMessageId));
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

    // Handle user question submission to Logic or Pattern Bot
    const handleUserQuestion = async () => {
        if (!input.trim() || !isQuestioningEnabled) return;

        // If any bot is currently typing, delay the user question submission
        if (typingMessageIds.length > 0) {
            console.log(`Messages still typing, delaying user question response`);
            setTimeout(handleUserQuestion, 1200);
            return;
        }

        // Add user message
        const userMessageId = getUniqueMessageId();
        const userQuestion = input.trim();

        setMessages(prev => [
            ...prev,
            {
                id: userMessageId,
                sender: "user",
                text: userQuestion
            }
        ]);
        setInput("");

        // Determine which bot(s) should respond
        const logicBotCalled = /logic bot|logic|logical/i.test(userQuestion);
        const patternBotCalled = /pattern bot|pattern/i.test(userQuestion);
        let respondingBots = [];

        if (logicBotCalled && !patternBotCalled) {
            // User specifically asked Logic Bot
            respondingBots = ['logic'];
        } else if (patternBotCalled && !logicBotCalled) {
            // User specifically asked Pattern Bot
            respondingBots = ['pattern'];
        } else {
            // If no specific bot was called, decide based on question content
            // or have both respond (with a chance for conversation between them)
            const mathKeywords = input.toLowerCase();

            if (/proof|logical|step|systematic|deduce|equation|formula|derive/i.test(mathKeywords)) {
                // Question seems more logic-oriented
                respondingBots = ['logic'];
            } else if (/pattern|visual|creative|different way|shortcut|trick|intuition/i.test(mathKeywords)) {
                // Question seems more pattern-oriented
                respondingBots = ['pattern'];
            } else {
                // Create a discussion between bots (randomly choose who goes first)
                respondingBots = Math.random() < 0.5 ? ['logic', 'pattern'] : ['pattern', 'logic'];
            }
        }

        // Process bot responses sequentially
        await processResponses(respondingBots, userQuestion, userMessageId);
    };

    const processResponses = async (bots, userQuestion, userMessageId) => {
        for (let i = 0; i < bots.length; i++) {
            const botId = bots[i];
            const botName = botId === 'logic' ? 'Logic Bot' : 'Pattern Bot';
            const botMessageId = getUniqueMessageId();
            const isFirstResponse = i === 0;
            const isFollowup = !isFirstResponse;

            // Add typing indicator
            setTypingMessageIds(prev => [...prev, botMessageId]);
            setMessages(prev => [
                ...prev,
                {
                    id: botMessageId,
                    sender: "ai",
                    text: "...",
                    agentId: botId
                }
            ]);

            try {
                // Set up prompt based on whether this is first response or follow-up
                let botPrompt;
                if (isFollowup) {
                    // This bot is responding after another bot already responded
                    const previousBotName = bots[i - 1] === 'logic' ? 'Logic Bot' : 'Pattern Bot';
                    botPrompt = `${agents.find(a => a.id === botId)?.systemPrompt}
You are participating in a group discussion about this problem: "${currentQuestion}"
The student asked: "${userQuestion}"
${previousBotName} has just responded. As ${botName}, build on what was said and offer your perspective.
If you notice something important that wasn't mentioned, politely add your insights.
Keep your response conversational and collaborative, like you're in a study group together.`;
                } else {
                    // First bot to respond
                    botPrompt = `${agents.find(a => a.id === botId)?.systemPrompt}
You are participating in a group discussion about this problem: "${currentQuestion}"
The student asked: "${userQuestion}"
Give your best help as ${botName}, focusing on your strengths in ${botId === 'logic' ? 'logical reasoning' : 'pattern recognition'}.
Be conversational but insightful, like you're working together in a study group.`;
                }

                // Create context with problem and recent message history
                const botContext = [
                    {
                        id: 999,
                        sender: "system",
                        text: `The current math problem is: ${currentQuestion}`
                    },
                    ...messages.slice(-8),
                    {
                        id: userMessageId,
                        sender: "user",
                        text: userQuestion
                    }
                ];

                const botResponse = await aiService.generateResponse(botContext, {
                    systemPrompt: botPrompt,
                    model: currentModel
                });

                // Delay between bots to create natural conversation flow
                await new Promise(resolve => setTimeout(resolve, 500));

                // Update the bot message
                setMessages(prev =>
                    prev.map(msg =>
                        msg.id === botMessageId
                            ? {
                                ...msg,
                                text: botResponse,
                                onComplete: () => {
                                    console.log(`${botName}'s message ${botMessageId} complete`);
                                    setTypingMessageIds(prev => prev.filter(id => id !== botMessageId));
                                    setCompletedMessageIds(prev => [...prev, botMessageId]);

                                    // If this is the first bot response, wait for it to finish
                                    // before starting the second bot's response
                                    if (isFirstResponse && bots.length > 1) {
                                        setTimeout(() => {
                                            // Continue with next bot in sequence
                                        }, 1500);
                                    }
                                }
                            }
                            : msg
                    )
                );

                // Wait for typing to complete before proceeding to next bot
                if (isFirstResponse && bots.length > 1) {
                    await new Promise(resolve => {
                        const checkTyping = () => {
                            if (!typingMessageIds.includes(botMessageId)) {
                                resolve(null);
                            } else {
                                setTimeout(checkTyping, 500);
                            }
                        };
                        setTimeout(checkTyping, 1000);
                    });
                }

            } catch (error) {
                console.error(`Error getting ${botName}'s response:`, error);

                // Update with error message
                setMessages(prev =>
                    prev.map(msg =>
                        msg.id === botMessageId
                            ? {
                                ...msg,
                                text: "I'm sorry, I encountered an error. Could you try asking differently?",
                                onComplete: () => {
                                    setTypingMessageIds(prev => prev.filter(id => id !== botMessageId));
                                    setCompletedMessageIds(prev => [...prev, botMessageId]);
                                }
                            }
                            : msg
                    )
                );
            }
        }
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
        const logicBotMessageId = getUniqueMessageId();
        const patternBotMessageId = getUniqueMessageId();
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

        // Add typing indicators for all bots and solution
        setTypingMessageIds(prev => [...prev, logicBotMessageId, patternBotMessageId, solutionMessageId]);

        // Add placeholders
        setMessages(prev => [
            ...prev,
            {
                id: logicBotMessageId,
                sender: "ai",
                text: "...",
                agentId: "logic"
            },
            {
                id: patternBotMessageId,
                sender: "ai",
                text: "...",
                agentId: "pattern"
            },
            {
                id: solutionMessageId,
                sender: "system",
                text: "...",
                agentId: "system"
            }
        ]);

        try {
            // Configure system prompts for final solutions
            const logicBotPrompt = `${agents.find(a => a.id === 'logic')?.systemPrompt}
Now that the student has submitted their final answer, please provide YOUR complete solution approach to the problem: "${problem}"
Focus on logical reasoning with clear steps, showing how you would solve it from first principles.
Make sure to include a final numerical answer and explain your reasoning process clearly.`;

            const patternBotPrompt = `${agents.find(a => a.id === 'pattern')?.systemPrompt}
Now that the student has submitted their final answer, please provide YOUR complete solution approach to the problem: "${problem}"
Focus on pattern recognition and creative approaches, showing how you would solve it.
Make sure to include a final numerical answer and explain any patterns or shortcuts you identified.`;

            const solutionExpertPrompt = `You are a mathematics expert providing the official solution to a combinatorics problem.
Problem: "${problem}"
Provide a clear, step-by-step solution with the correct answer clearly stated.
Focus on accuracy, clarity and mathematical rigor.
This will serve as the reference solution for comparing student answers.`;

            // Get solutions in parallel
            const [logicBotResponse, patternBotResponse, expertSolution] = await Promise.all([
                aiService.generateResponse([{ id: 100, sender: "user", text: `Solve this problem: ${problem}` }], {
                    systemPrompt: logicBotPrompt,
                    model: currentModel
                }),
                aiService.generateResponse([{ id: 101, sender: "user", text: `Solve this problem: ${problem}` }], {
                    systemPrompt: patternBotPrompt,
                    model: currentModel
                }),
                aiService.generateResponse([{ id: 102, sender: "user", text: `Provide the solution to: ${problem}` }], {
                    systemPrompt: solutionExpertPrompt,
                    model: AI_MODELS.CLAUDE_HAIKU.id
                })
            ]);

            // Update the messages
            setMessages(prev =>
                prev.map(msg => {
                    if (msg.id === logicBotMessageId) {
                        return {
                            ...msg,
                            text: `My Solution:\n${logicBotResponse}`,
                            onComplete: () => {
                                setTypingMessageIds(prev => prev.filter(id => id !== logicBotMessageId));
                                setCompletedMessageIds(prev => [...prev, logicBotMessageId]);
                            }
                        };
                    }
                    if (msg.id === patternBotMessageId) {
                        return {
                            ...msg,
                            text: `My Solution:\n${patternBotResponse}`,
                            onComplete: () => {
                                setTypingMessageIds(prev => prev.filter(id => id !== patternBotMessageId));
                                setCompletedMessageIds(prev => [...prev, patternBotMessageId]);
                            }
                        };
                    }
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
            console.error("Error in final evaluation:", error);

            // Update with error messages
            setMessages(prev =>
                prev.map(msg => {
                    if ([logicBotMessageId, patternBotMessageId, solutionMessageId].includes(msg.id)) {
                        return {
                            ...msg,
                            text: "I'm sorry, I encountered an error processing this response.",
                            onComplete: () => {
                                setTypingMessageIds(prev => prev.filter(id => id !== msg.id));
                                if (msg.id === solutionMessageId) {
                                    setEvaluationComplete(true);
                                }
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
                sender: "ai",
                text: "Loading a new problem for you...",
                agentId: "logic"
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

            // Set initial messages - customized for peer-only mode
            setMessages([
                {
                    id: 1,
                    sender: "ai",
                    text: "Welcome to peer collaborative learning! You can discuss this problem with Logic Bot and Pattern Bot.",
                    agentId: "logic"
                },
                {
                    id: 2,
                    sender: "ai",
                    text: selectedQuestion,
                    agentId: "pattern"
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
            setBotThinking(false);

        } catch (error) {
            console.error("Error fetching question:", error);

            // Use a fallback
            const fallbackQuestion = "In how many ways can 5 distinct books be distributed to 3 distinct students such that each student gets at least one book?";

            setCurrentQuestion(fallbackQuestion);

            setMessages([
                {
                    id: 1,
                    sender: "ai",
                    text: "There was an issue loading questions from the server, but I have a combinatorics problem for us to work on.",
                    agentId: "logic"
                },
                {
                    id: 2,
                    sender: "ai",
                    text: fallbackQuestion,
                    agentId: "logic"
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
                        <h1 className="text-2xl text-white font-bold">Peer Learning Mode</h1>
                        <p className="text-sm text-gray-300">Collaborate with AI peers to solve problems</p>
                    </div>

                    {/* Agent images */}
                    <div className="hidden md:flex space-x-3 mx-4">
                        {agents.map(agent => (
                            <div key={agent.id} className="flex flex-col items-center">
                                <Image
                                    src={agent.avatar}
                                    alt={agent.name}
                                    width={60}
                                    height={60}
                                    className="rounded-full border-2 border-white"
                                />
                                <span className="text-xs text-white mt-1">{agent.name}</span>
                            </div>
                        ))}
                    </div>

                    {/* Timer */}
                    <div className={`p-2 rounded-lg ${timeLeft > 20 ? 'bg-green-700' : 'bg-red-700 animate-pulse'}`}>
                        <div className="text-xl font-mono text-white">{formatTime(timeLeft)}</div>
                        <div className="text-xs text-center text-gray-300">
                            {isQuestioningEnabled ? "Question Time" : "Time's Up"}
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
                            {msg.sender === 'ai' && (
                                <div className="mr-2 flex-shrink-0">
                                    <Image
                                        src={agents.find(a => a.id === msg.agentId)?.avatar || '/logic_avatar.png'}
                                        alt={agents.find(a => a.id === msg.agentId)?.name || 'AI'}
                                        width={60}
                                        height={60}
                                        className="rounded-full border-2 border-white"
                                    />
                                </div>
                            )}

                            <div
                                className={`max-w-[75%] rounded-lg p-3 ${msg.sender === 'user'
                                        ? 'bg-blue-600 text-white'
                                        : msg.sender === 'system'
                                            ? 'bg-purple-700 text-white'
                                            : 'bg-white bg-opacity-10 text-white'
                                    }`}
                            >
                                {msg.sender === 'ai' && (
                                    <div className="text-sm text-gray-300 mb-1 font-bold">
                                        {agents.find(a => a.id === msg.agentId)?.name || 'AI'}
                                    </div>
                                )}

                                {msg.sender === 'system' && (
                                    <div className="text-sm text-gray-300 mb-1 font-bold">
                                        Official Solution
                                    </div>
                                )}

                                {(msg.sender === 'ai' || msg.sender === 'system') && typingMessageIds.includes(msg.id) && msg.text === "..." ? (
                                    <div className="flex items-center space-x-2">
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                    </div>
                                ) : (msg.sender === 'ai' || msg.sender === 'system') && typingMessageIds.includes(msg.id) ? (
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
                            {/* Question input */}
                            <div className="flex space-x-2">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Ask Logic Bot or Pattern Bot about the problem..."
                                    className="flex-1 bg-white bg-opacity-10 text-white border border-gray-700 rounded-md px-3 py-2"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleUserQuestion();
                                        }
                                    }}
                                />

                                <button
                                    onClick={handleUserQuestion}
                                    disabled={!input.trim() || typingMessageIds.length > 0}
                                    className={`px-4 py-2 rounded-md ${input.trim() && typingMessageIds.length === 0
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                            : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                        }`}
                                >
                                    Ask
                                </button>

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
                                    ? "Move on to the next problem when you're ready!"
                                    : "Waiting for solution evaluation..."}
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