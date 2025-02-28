'use client'

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import TypewriterText from '@/components/TypewriterText';
import { aiService, AI_MODELS } from '@/services/AI';
import { Message } from '@/utils/types';
import TypewriterTextWrapper from "@/components/TypewriterTextWrapper";

export default function MultiAgentPage() {
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
    // At the top of your functional component where other states are declared

    const [isBotResponding, setIsBotResponding] = useState(false);
    const [pendingBotResponse, setPendingBotResponse] = useState<null | (() => Promise<void>)>(null);

    // Timer state
    const [timeLeft, setTimeLeft] = useState(120);
    const roundEndedRef = useRef(false);

    // Question tracking
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [usedQuestionIndices, setUsedQuestionIndices] = useState<number[]>([]);
    const [currentQuestion, setCurrentQuestion] = useState<any>(null);
    const [currentModel] = useState(AI_MODELS.CLAUDE_HAIKU.id);

    // Define the AI agents
    const agents = [
        {
            id: 'logic',
            name: 'Logic Bot',
            avatar: 'logic_avatar.png',
            systemPrompt: `You are Logic Bot, a student who excels at logical reasoning and step-by-step problem solving.
As a fellow student in the class, you ask insightful questions about math problems.
Ask 1-2 thoughtful questions about the problem, phrased naturally as a curious student would.
Your questions should help identify key logical structures or relationships in the problem.
For example: "I'm wondering, have we considered how the order affects the outcome?" or "Does anyone else think the constraints might be important here?"
Keep your messages brief (2-3 sentences) and conversational, like a real classmate asking questions.
DO NOT solve the problem - just ask questions that would help the class think about it.`
        },
        {
            id: 'pattern',
            name: 'Pattern Bot',
            avatar: 'pattern_avatar.png',
            systemPrompt: `You are Pattern Bot, a student who excels at recognizing patterns in math problems.
As a fellow student in the class, you ask insightful questions focused on patterns and visualization.
Ask 1-2 thoughtful questions about the problem, phrased naturally as a curious student would.
Your questions should highlight pattern recognition approaches to the problem.
For example: "Does anyone else see a pattern in how these elements combine?" or "I'm thinking - could we visualize this problem differently?"
Keep your messages brief (2-3 sentences) and conversational, like a real classmate asking questions.
DO NOT solve the problem - just ask questions that would help the class think about it.`
        },
        {
            id: 'bob',
            name: 'Bob',
            avatar: 'bob_avatar.svg',
            systemPrompt: `You are Bob, a kind math teacher who guides students through combinatorics problems.
Your role is to present problems, provide hints, ask thoughtful questions, and evaluate solutions.
When evaluating final answers, compare the student's approach with both AI assistants' approaches.
Highlight strengths and weaknesses of all three approaches to help student understanding.`
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

        // More sensitive detection - as soon as user scrolls away from very bottom
        if (distanceFromBottom > 10) {
            // They've manually scrolled up - disable auto-scroll
            if (!userHasScrolled) {
                console.log("User manually scrolled - disabling auto-scroll");
                setUserHasScrolled(true);
            }
        } else {
            // They're at the bottom again - re-enable auto-scroll
            if (userHasScrolled) {
                console.log("User scrolled to bottom - re-enabling auto-scroll");
                setUserHasScrolled(false);
            }
        }
    };

    // Timer effect
    useEffect(() => {
        if (!isQuestioningEnabled || roundEndedRef.current) return;

        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setIsQuestioningEnabled(false);
                    roundEndedRef.current = true;
                    // Auto-submit the "I don't know" answer when time ends
                    autoSubmitTimeoutAnswer();
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isQuestioningEnabled]);


    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const triggerBobResponse = async () => {
        // If Bob is already responding or another bot is typing, queue this for later
        if (isBotResponding || typingMessageIds.length > 0) {
            setPendingBotResponse(() => triggerBobResponse);
            return;
        }

        setIsBotResponding(true);

        const bobMessageId = nextMessageId;
        setNextMessageId(prev => prev + 1);

        // Add typing indicator for Bob
        setTypingMessageIds(prev => [...prev, bobMessageId]);

        // Add placeholder message
        setMessages(prev => [
            ...prev,
            {
                id: bobMessageId,
                sender: "ai",
                text: "...",
                agentId: "bob"
            }
        ]);

        try {
            // Create a more specific context for Bob that includes the problem
            const bobContext = [
                // First, explicitly include the problem
                {
                    id: 999,
                    sender: "user",
                    text: `The current math problem is: ${currentQuestion}`
                },
                // Then include the last 5 messages (or however many you need)
                ...messages.slice(-5)
            ];

            // Get Bob's response with better context
            const bobPrompt = `${agents.find(a => a.id === 'bob')?.systemPrompt}
You are responding to questions from Logic Bot and Pattern Bot about this specific math problem: "${currentQuestion}"
Provide helpful guidance that builds on their questions without solving the problem completely.
Your response should be relevant to the specific questions they just asked.
Do NOT say "What problem are you referring to?" or similar generic responses - the problem is provided in your context.`;

            const bobResponse = await aiService.generateResponse(
                bobContext,
                {
                    systemPrompt: bobPrompt,
                    model: currentModel
                }
            );

            // Update Bob's message
            setMessages(prev =>
                prev.map(msg =>
                    msg.id === bobMessageId
                        ? {
                            ...msg,
                            text: bobResponse,
                            onComplete: () => {
                                setIsBotResponding(false);

                                if (pendingBotResponse) {
                                    const nextResponse = pendingBotResponse;
                                    setPendingBotResponse(null);
                                    setTimeout(() => nextResponse(), 500);
                                }
                            }
                        }
                        : msg
                )
            );
        } catch (error) {
            console.error("Error getting Bob's response:", error);

            setMessages(prev =>
                prev.map(msg =>
                    msg.id === bobMessageId
                        ? {
                            ...msg,
                            text: "I'm sorry, I encountered an error responding to the questions.",
                            agentId: "bob",
                            onComplete: () => setIsBotResponding(false)
                        }
                        : msg
                )
            );
        }
    };

    // Trigger bots to analyze and respond to questions
    const triggerBotThoughts = async (question: string) => {
        setBotThinking(true);

        try {
            console.log("Triggering bot thoughts for question:", question);

            // Randomly decide if both bots or just one will ask questions (70% chance for both)
            const bothBotsAsk = Math.random() < 0.7;
            const onlyLogicBot = !bothBotsAsk && Math.random() < 0.5;
            const onlyPatternBot = !bothBotsAsk && !onlyLogicBot;

            console.log(`Bot participation: Both=${bothBotsAsk}, OnlyLogic=${onlyLogicBot}, OnlyPattern=${onlyPatternBot}`);

            // Which bot goes first? (50/50 chance)
            const logicFirst = Math.random() < 0.5;
            console.log(`Logic bot goes first: ${logicFirst}`);

            // Generate delays for more natural conversation
            const firstDelay = 1000 + Math.floor(Math.random() * 3000); // 1-4 seconds
            const secondDelay = firstDelay + 3000 + Math.floor(Math.random() * 4000); // 4-8 seconds after first

            // Set up bot IDs - CRITICAL: use separate variable for each, don't rely on state updates
            const firstBotId = getUniqueMessageId();
            const bobFirstResponseId = getUniqueMessageId();
            const secondBotId = getUniqueMessageId();
            const bobSecondResponseId = getUniqueMessageId();

            // Update next ID once with the total increment needed
            setNextMessageId(prev => prev + 4);

            console.log(`IDs: firstBot=${firstBotId}, bobFirstResponse=${bobFirstResponseId}, secondBot=${secondBotId}, bobSecondResponse=${bobSecondResponseId}`);

            // Create context for bots with explicit problem description
            const context = [{
                id: 0,
                sender: "user",
                text: `Here is a math problem: "${question}" Please analyze this problem and ask 1-2 insightful questions about it that would help students understand the problem better. DO NOT solve the problem.`
            }];

            // Get thoughts from both bots - but only if they'll be used
            const [logicThoughts, patternThoughts] = await Promise.all([
                (onlyPatternBot) ? Promise.resolve("") : aiService.generateResponse(context, {
                    systemPrompt: agents[0].systemPrompt,
                    model: currentModel
                }),
                (onlyLogicBot) ? Promise.resolve("") : aiService.generateResponse(context, {
                    systemPrompt: agents[1].systemPrompt,
                    model: currentModel
                })
            ]);

            console.log("Bot responses retrieved, scheduling display");

            // Explicitly track for duplicate protection
            const responsesInProgress = new Set();

            // FIRST BOT DISPLAY
            setTimeout(() => {
                // Handle onlyLogicBot case - show Logic Bot regardless of turn order
                if (onlyLogicBot) {
                    const botText = logicThoughts;
                    const botAgentId = 'logic';

                    console.log(`Showing only Logic Bot with ID ${firstBotId}`);

                    // Add typing indicator for Logic Bot
                    setTypingMessageIds(prev => [...prev, firstBotId]);

                    // Add bot message
                    setMessages(prev => [
                        ...prev,
                        {
                            id: firstBotId,
                            sender: "ai",
                            text: "...",
                            agentId: botAgentId
                        }
                    ]);

                    // After typing delay, show message
                    setTimeout(() => {
                        setMessages(prev =>
                            prev.map(msg => {
                                if (msg.id === firstBotId) {
                                    return {
                                        ...msg,
                                        text: botText,
                                        onComplete: () => {
                                            setTypingMessageIds(prev => prev.filter(id => id !== firstBotId));

                                            // Only respond if not already responding to this message
                                            if (!responsesInProgress.has(bobFirstResponseId)) {
                                                responsesInProgress.add(bobFirstResponseId);
                                                console.log(`Scheduling Bob's response to Logic Bot with ID ${bobFirstResponseId}`);

                                                setTimeout(() => {
                                                    respondToBotQuestion(botAgentId, botText, bobFirstResponseId, question);
                                                }, 1000);
                                            }
                                        }
                                    };
                                }
                                return msg;
                            })
                        );
                    }, 500);

                    // We've handled the special case, so we're done
                    setBotThinking(false);
                    return;
                }

                // Handle onlyPatternBot case - show Pattern Bot regardless of turn order
                if (onlyPatternBot) {
                    const botText = patternThoughts;
                    const botAgentId = 'pattern';

                    console.log(`Showing only Pattern Bot with ID ${firstBotId}`);

                    // Add typing indicator for Pattern Bot
                    setTypingMessageIds(prev => [...prev, firstBotId]);

                    // Add bot message
                    setMessages(prev => [
                        ...prev,
                        {
                            id: firstBotId,
                            sender: "ai",
                            text: "...",
                            agentId: botAgentId
                        }
                    ]);

                    // After typing delay, show message
                    setTimeout(() => {
                        setMessages(prev =>
                            prev.map(msg => {
                                if (msg.id === firstBotId) {
                                    return {
                                        ...msg,
                                        text: botText,
                                        onComplete: () => {
                                            setTypingMessageIds(prev => prev.filter(id => id !== firstBotId));

                                            // Only respond if not already responding to this message
                                            if (!responsesInProgress.has(bobFirstResponseId)) {
                                                responsesInProgress.add(bobFirstResponseId);
                                                console.log(`Scheduling Bob's response to Pattern Bot with ID ${bobFirstResponseId}`);

                                                setTimeout(() => {
                                                    respondToBotQuestion(botAgentId, botText, bobFirstResponseId, question);
                                                }, 1000);
                                            }
                                        }
                                    };
                                }
                                return msg;
                            })
                        );
                    }, 500);

                    // We've handled the special case, so we're done
                    setBotThinking(false);
                    return;
                }

                // Normal case - both bots participate
                // Determine who goes first based on logicFirst
                const isLogic = logicFirst;
                const botId = firstBotId;
                const botText = logicFirst ? logicThoughts : patternThoughts;
                const botAgentId = logicFirst ? 'logic' : 'pattern';

                console.log(`Showing first bot (${botAgentId}) with ID ${botId}`);

                // Add typing indicator for first bot
                setTypingMessageIds(prev => [...prev, botId]);

                // Add bot message
                setMessages(prev => [
                    ...prev,
                    {
                        id: botId,
                        sender: "ai",
                        text: "...",
                        agentId: botAgentId
                    }
                ]);

                // After typing delay, show message
                setTimeout(() => {
                    setMessages(prev =>
                        prev.map(msg => {
                            if (msg.id === botId) {
                                return {
                                    ...msg,
                                    text: botText,
                                    onComplete: () => {
                                        setTypingMessageIds(prev => prev.filter(id => id !== botId));

                                        // Only respond if not already responding to this message
                                        if (!responsesInProgress.has(bobFirstResponseId)) {
                                            responsesInProgress.add(bobFirstResponseId);
                                            console.log(`Scheduling Bob's response to first bot with ID ${bobFirstResponseId}`);

                                            setTimeout(() => {
                                                respondToBotQuestion(botAgentId, botText, bobFirstResponseId, question);
                                            }, 1000);
                                        }
                                    }
                                };
                            }
                            return msg;
                        })
                    );
                }, 500);
            }, firstDelay);

            // Display second bot after longer delay (only if both bots ask)
            // In triggerBotThoughts function, update the code for displaying the second bot:
            if (bothBotsAsk) {
                setTimeout(() => {
                    // Check if any messages are still typing before showing second bot
                    if (typingMessageIds.length > 0) {
                        console.log(`First bot or Bob still typing, delaying second bot appearance`);

                        // Create a recursive function to check again after a delay
                        const checkAndDisplaySecondBot = () => {
                            if (typingMessageIds.length > 0) {
                                console.log(`Still typing, continuing to delay second bot`);
                                setTimeout(checkAndDisplaySecondBot, 1000);
                                return;
                            }

                            // Now it's safe to show the second bot
                            displaySecondBot();
                        };

                        setTimeout(checkAndDisplaySecondBot, 1000);
                        return;
                    }

                    // If no typing in progress, display second bot immediately
                    displaySecondBot();

                    // Function to handle second bot display logic
                    function displaySecondBot() {
                        const isLogic = !logicFirst;
                        const botId = secondBotId;
                        const botText = !logicFirst ? logicThoughts : patternThoughts;
                        const botAgentId = !logicFirst ? 'logic' : 'pattern';

                        console.log(`Showing second bot (${botAgentId}) with ID ${botId}`);

                        // Add typing indicator
                        setTypingMessageIds(prev => [...prev, botId]);

                        // Add bot message
                        setMessages(prev => [
                            ...prev,
                            {
                                id: botId,
                                sender: "ai",
                                text: "...",
                                agentId: botAgentId
                            }
                        ]);

                        // After typing delay, show message
                        setTimeout(() => {
                            setMessages(prev =>
                                prev.map(msg => {
                                    if (msg.id === botId) {
                                        return {
                                            ...msg,
                                            text: botText,
                                            onComplete: () => {
                                                setTypingMessageIds(prev => prev.filter(id => id !== botId));

                                                // Only respond if not already responding to this message
                                                if (!responsesInProgress.has(bobSecondResponseId)) {
                                                    responsesInProgress.add(bobSecondResponseId);
                                                    console.log(`Scheduling Bob's response to second bot with ID ${bobSecondResponseId}`);

                                                    setTimeout(() => {
                                                        respondToBotQuestion(botAgentId, botText, bobSecondResponseId, question);
                                                    }, 1000);
                                                }
                                            }
                                        };
                                    }
                                    return msg;
                                })
                            );
                        }, 500);
                    }

                    // Mark thinking complete after second bot handling is initiated
                    setBotThinking(false);
                }, secondDelay);
            }
        } catch (error) {
            console.error("Error getting bot thoughts:", error);
            setBotThinking(false);
        }
    };

    const respondToBotQuestion = async (botId: string, botQuestion: string, responseId: number, problemContext: string) => {
        // Enhanced check for duplicate responses
        const isDuplicate = typingMessageIds.includes(responseId) ||
            messages.some(m => m.id === responseId) ||
            completedMessageIds.includes(responseId);

        if (isDuplicate) {
            console.warn(`Response ID ${responseId} already exists or in progress, skipping Bob's response`);
            return;
        }

        // If there are any messages currently being typed, delay this response
        if (typingMessageIds.length > 0) {
            console.log(`Messages still typing (${typingMessageIds.join(',')}), delaying Bob's response to ${botId}`);
            setTimeout(() =>
                respondToBotQuestion(botId, botQuestion, responseId, problemContext),
                1200  // Increased delay to give more time for animation
            );
            return;
        }

        console.log(`Bob responding to ${botId} with ID ${responseId}, message count: ${messages.length}`);
        setIsBotResponding(true);

        // Add typing indicator for Bob
        setTypingMessageIds(prev => [...prev, responseId]);

        // Add placeholder message
        setMessages(prev => [
            ...prev,
            {
                id: responseId,
                sender: "ai",
                text: "...",
                agentId: "bob"
            }
        ]);

        try {
            // Create context for Bob's response with explicit problem mention
            const bobContext = [
                {
                    id: 100,
                    sender: "user",
                    text: `The math problem is: "${problemContext}"`
                },
                {
                    id: 101,
                    sender: "user",
                    text: `${botId === 'logic' ? 'Logic Bot' : 'Pattern Bot'} just asked: "${botQuestion}"`
                }
            ];

            // Get Bob's response with improved prompt
            const bobPrompt = `${agents.find(a => a.id === 'bob')?.systemPrompt}
You are responding to a question from ${botId === 'logic' ? 'Logic Bot' : 'Pattern Bot'} about this specific math problem: "${problemContext}"
The bot asked: "${botQuestion}"
Provide a thoughtful, encouraging response that builds on their question.
Keep your response concise (2-4 sentences) and conversational.
Address the specific question they asked without solving the entire problem.`;

            const bobResponse = await aiService.generateResponse(bobContext, {
                systemPrompt: bobPrompt,
                model: currentModel
            });

            // Update Bob's message with a small delay to ensure clean transition
            setTimeout(() => {
                setMessages(prev =>
                    prev.map(msg =>
                        msg.id === responseId
                            ? {
                                ...msg,
                                text: bobResponse,
                                onComplete: () => {
                                    console.log(`Bob's message ${responseId} complete`);
                                    setTypingMessageIds(prev => prev.filter(id => id !== responseId));
                                    setIsBotResponding(false);
                                    setCompletedMessageIds(prev => [...prev, responseId]);
                                }
                            }
                            : msg
                    )
                );
            }, 100);
        } catch (error) {
            console.error("Error getting Bob's response:", error);

            // Update with error message
            setMessages(prev =>
                prev.map(msg =>
                    msg.id === responseId
                        ? {
                            ...msg,
                            text: "I'm sorry, I encountered an error responding to the question.",
                            agentId: "bob",
                            onComplete: () => {
                                setIsBotResponding(false);
                                setTypingMessageIds(prev => prev.filter(id => id !== responseId));
                                setCompletedMessageIds(prev => [...prev, responseId]); // Still mark as completed
                            }
                        }
                        : msg
                )
            );
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
                agentId: "bob"
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
                if (typeof window !== 'undefined') {
                    router.push('/break');
                }
                return;
            }

            // Select a random question
            const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
            setCurrentQuestionIndex(randomIndex);
            setUsedQuestionIndices(prev => [...prev, randomIndex]);

            // Get the selected question (a string)
            const selectedQuestion = combinatoricsQuestions[randomIndex];
            console.log("Selected question:", selectedQuestion);

            // Set current question state
            setCurrentQuestion(selectedQuestion);

            // Set initial messages
            setMessages([
                {
                    id: 1,
                    sender: "ai",
                    text: "Welcome to the multi-agent learning experience! I'm Bob, your teacher. Logic Bot and Pattern Bot will help analyze this problem.",
                    agentId: "bob"
                },
                {
                    id: 2,
                    sender: "ai",
                    text: selectedQuestion, // Direct use of the string
                    agentId: "bob"
                }
            ]);

            // Reset for new round
            setNextMessageId(3);
            setTimeLeft(120);
            setIsQuestioningEnabled(true);
            roundEndedRef.current = false;
            setScratchboardContent("");
            setInput("");
            setEvaluationComplete(false);

            // Trigger bot thoughts after a short delay
            setTimeout(() => {
                triggerBotThoughts(selectedQuestion);
            }, 2000);

        } catch (error) {
            console.error("Error fetching question:", error);

            // Use a consistent STRING for fallback, not an object
            const fallbackQuestion = "In how many ways can 5 distinct books be distributed to 3 distinct students such that each student gets at least one book?";

            setCurrentQuestion(fallbackQuestion);

            setMessages([
                {
                    id: 1,
                    sender: "ai",
                    text: "There was an issue loading questions from the server, but I have a combinatorics problem for us to work on.",
                    agentId: "bob"
                },
                {
                    id: 2,
                    sender: "ai",
                    text: fallbackQuestion, // Direct use of the string
                    agentId: "bob"
                }
            ]);

            // Continue with the fallback question
            setTimeout(() => {
                triggerBotThoughts(fallbackQuestion);
            }, 2000);
        }
    };

    // Initialize with first question
    useEffect(() => {
        startNewRound();
    }, []);

    // Auto-scroll when messages change
    useEffect(() => {
        // Reset the userHasScrolled flag when a new message is added
        // This makes auto-scroll work again for new messages after manual scrolling
        setUserHasScrolled(false);
    }, [messages]);

    const autoSubmitTimeoutAnswer = () => {
        // Set input and scratchboard to "I don't know"
        setInput("I don't know");
        setScratchboardContent("I don't know");

        // Use setTimeout to ensure state updates first
        setTimeout(() => {
            // Then call handleSend to process the submission with auto flag and current question
            handleSend(true);
        }, 100);
    };

    // Handle user question submission
    // Handle user question submission
    const handleUserQuestion = async () => {
        if (!input.trim() || !isQuestioningEnabled) return;

        // If any bot is currently typing, delay the user question submission
        if (typingMessageIds.length > 0) {
            console.log(`Messages still typing, delaying user question response`);
            setTimeout(handleUserQuestion, 1200);
            return;
        }

        // Generate truly unique IDs
        const userMessageId = getUniqueMessageId();
        const bobMessageId = getUniqueMessageId();

        console.log(`User question: ${input.trim().substring(0, 20)}... (ID: ${userMessageId})`);
        console.log(`Adding Bob response placeholder (ID: ${bobMessageId})`);

        // Set bot responding flag
        setIsBotResponding(true);

        // Add user message
        setMessages(prev => [
            ...prev,
            {
                id: userMessageId,
                sender: "user",
                text: input.trim()
            }
        ]);
        setInput("");

        // Add typing indicator for Bob
        setTypingMessageIds(prev => [...prev, bobMessageId]);
        setMessages(prev => [
            ...prev,
            {
                id: bobMessageId,
                sender: "ai",
                text: "...",
                agentId: "bob"
            }
        ]);

        try {
            // Get response from Bob
            const bobPrompt = `${agents.find(a => a.id === 'bob')?.systemPrompt}
Remember to guide the student without giving away the full solution.
If they ask a direct question, provide a helpful hint or ask a follow-up question.`;

            const bobContext = [
                // First, explicitly include the problem
                {
                    id: 999,
                    sender: "user",
                    text: `The current math problem is: ${currentQuestion}`
                },
                // Then include the recent message history
                ...messages.slice(-5),
                // And the new question
                {
                    id: userMessageId,
                    sender: "user",
                    text: input.trim()
                }
            ];

            const bobResponse = await aiService.generateResponse(bobContext, {
                systemPrompt: bobPrompt,
                model: currentModel
            });

            // Update Bob's message with a small delay for clean transition
            setTimeout(() => {
                setMessages(prev =>
                    prev.map(msg =>
                        msg.id === bobMessageId
                            ? {
                                ...msg,
                                text: bobResponse,
                                agentId: "bob",
                                onComplete: () => {
                                    console.log(`Bob's message ${bobMessageId} complete`);
                                    setTypingMessageIds(prev => prev.filter(id => id !== bobMessageId));
                                    setIsBotResponding(false);
                                    setCompletedMessageIds(prev => [...prev, bobMessageId]);
                                }
                            }
                            : msg
                    )
                );
            }, 100);

        } catch (error) {
            console.error("Error getting Bob's response:", error);

            // Update with error message and properly remove typing indicator
            setMessages(prev =>
                prev.map(msg =>
                    msg.id === bobMessageId
                        ? {
                            ...msg,
                            text: "I'm sorry, I encountered an error. Could you try asking differently?",
                            agentId: "bob",
                            onComplete: () => {
                                setTypingMessageIds(prev => prev.filter(id => id !== bobMessageId));
                                setIsBotResponding(false);
                                setCompletedMessageIds(prev => [...prev, bobMessageId]);
                            }
                        }
                        : msg
                )
            );
        }
    };

    // Handle submitting final answer

    const handleSend = async (isAutoSubmit = false) => {
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
        const teacherMessageId = getUniqueMessageId();

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

        // Add typing indicators for all bots
        setTypingMessageIds(prev => [...prev, logicBotMessageId, patternBotMessageId, teacherMessageId]);

        // Add placeholders for AI responses
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
                id: teacherMessageId,
                sender: "ai",
                text: "...",
                agentId: "bob"
            }
        ]);

        try {
            // Create context with conversation history
            const contextMessages = [...messages, {
                id: userMessageId,
                sender: "user",
                text: userFinalAnswer
            }];

            // Configure system prompts for final solutions
            const logicBotPrompt = `${agents.find(a => a.id === 'logic')?.systemPrompt}
Now that the student has submitted their final answer, please provide YOUR complete solution approach to the problem.
Focus on logical reasoning with clear steps, showing how you would solve it from first principles.
Make sure to include a final numerical answer and explain your reasoning process clearly.`;

            const patternBotPrompt = `${agents.find(a => a.id === 'pattern')?.systemPrompt}
Now that the student has submitted their final answer, please provide YOUR complete solution approach to the problem.
Focus on pattern recognition and creative approaches, showing how you would solve it.
Make sure to include a final numerical answer and explain any patterns or shortcuts you identified.`;

            // Get solutions from both bots in parallel
            const [logicBotResponse, patternBotResponse] = await Promise.all([
                aiService.generateResponse(
                    // Use a simple, well-formed context with user message
                    [{
                        id: 100,
                        sender: "user",
                        text: `Here's the math problem: ${currentQuestion}. Please provide your solution.`
                    }],
                    {
                        systemPrompt: logicBotPrompt,
                        model: currentModel
                    }
                ),
                aiService.generateResponse(
                    // Use a simple, well-formed context with user message
                    [{
                        id: 101,
                        sender: "user",
                        text: `Here's the math problem: ${currentQuestion}. Please provide your solution.`
                    }],
                    {
                        systemPrompt: patternBotPrompt,
                        model: currentModel
                    }
                )
            ]);

            // Update the bot messages
            setMessages(prev =>
                prev.map(msg => {
                    if (msg.id === logicBotMessageId) {
                        return {
                            ...msg,
                            text: `My Solution:\n${logicBotResponse}`
                        };
                    }
                    if (msg.id === patternBotMessageId) {
                        return {
                            ...msg,
                            text: `My Solution:\n${patternBotResponse}`
                        };
                    }
                    return msg;
                })
            );

            // Wait for teacher's evaluation
            setTimeout(async () => {
                // Create a well-formed context with user messages
                const fullContext = [
                    {
                        id: 102,
                        sender: "user",
                        text: `Problem: ${currentQuestion}`
                    },
                    {
                        id: userMessageId,
                        sender: "user",
                        text: userFinalAnswer
                    },
                    {
                        id: logicBotMessageId,
                        sender: "user", // Changed to user for API compatibility
                        text: `Logic Bot's Solution:\n${logicBotResponse}`,
                    },
                    {
                        id: patternBotMessageId,
                        sender: "user", // Changed to user for API compatibility
                        text: `Pattern Bot's Solution:\n${patternBotResponse}`,
                    }
                ];

                // Teacher evaluation prompt
                const teacherPrompt = `${agents.find(a => a.id === 'bob')?.systemPrompt}

PROBLEM:
${currentQuestion || "the given problem"}

The student has submitted their final answer, and both Logic Bot and Pattern Bot have provided solutions.
Please evaluate and compare all three approaches for correctness and clarity, highlighting:
1. Strengths and weaknesses of each approach
2. Accuracy of the final answers
3. Clarity and completeness of the reasoning
4. Which aspects from each approach were most effective

Your evaluation should be thorough but encouraging.`;

                const teacherResponse = await aiService.generateResponse(fullContext, {
                    systemPrompt: teacherPrompt,
                    model: AI_MODELS.CLAUDE_HAIKU.id // Use higher-capability model for evaluation
                });

                // Update the teacher message
                setMessages(prev =>
                    prev.map(msg =>
                        msg.id === teacherMessageId
                            ? {
                                ...msg,
                                text: teacherResponse,
                                onComplete: () => {
                                    setEvaluationComplete(true);
                                }
                            }
                            : msg
                    )
                );
            }, 1000);

            // End questioning period
            setIsQuestioningEnabled(false);

        } catch (error) {
            console.error("Error in final evaluation:", error);

            // Update with error messages
            setMessages(prev =>
                prev.map(msg => {
                    if ([logicBotMessageId, patternBotMessageId, teacherMessageId].includes(msg.id)) {
                        return {
                            ...msg,
                            text: "I'm sorry, I encountered an error processing this response."
                        };
                    }
                    return msg;
                })
            );
        }
    };

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
                        <h1 className="text-2xl text-white font-bold">Multi-Agent Learning</h1>
                        <p className="text-sm text-gray-300">Learn with specialized AI assistants</p>
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
                    <div className={`p-2 rounded-lg ${timeLeft > 20 ? 'bg-green-700' : 'bg-red-700 animate-pulse'
                        }`}>
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
                                        src={agents.find(a => a.id === msg.agentId)?.avatar || '/bob_avatar.svg'}
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
                                    : 'bg-white bg-opacity-10 text-white'
                                    }`}
                            >
                                {msg.sender === 'ai' && (
                                    <div className="text-sm text-gray-300 mb-1 font-bold">
                                        {agents.find(a => a.id === msg.agentId)?.name || 'AI'}
                                    </div>
                                )}

                                {msg.sender === 'ai' && typingMessageIds.includes(msg.id) && msg.text === "..." ? (
                                    <div className="flex items-center space-x-2">
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                                    </div>
                                ) : msg.sender === 'ai' && typingMessageIds.includes(msg.id) ? (
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
                                    placeholder="Ask a question about the problem..."
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
                                    disabled={!input.trim() || botThinking}
                                    className={`px-4 py-2 rounded-md ${input.trim() && !botThinking
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                        : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                        }`}
                                >
                                    Ask
                                </button>

                                <button
                                    onClick={() => handleSend()}
                                    disabled={!input.trim() || !scratchboardContent.trim() || botThinking}
                                    className={`px-4 py-2 rounded-md ${input.trim() && scratchboardContent.trim() && !botThinking
                                        ? 'bg-green-600 hover:bg-green-700 text-white'
                                        : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                        }`}
                                >
                                    Submit Final Answer
                                </button>
                            </div>

                            {/* Scratchboard */}
                            <div className="border border-gray-700 rounded-md p-3 bg-black bg-opacity-50">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-white font-semibold">Scratchboard</span>
                                    <span className="text-sm text-gray-400">Show your work here (required for final answer)</span>
                                </div>
                                <textarea
                                    value={scratchboardContent}
                                    onChange={(e) => setScratchboardContent(e.target.value)}
                                    className="w-full h-32 bg-white bg-opacity-10 text-white border border-gray-700 rounded-md p-2 resize-none"
                                    placeholder="Use this space to work through the problem step by step..."
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="flex justify-center">
                            <div className="bg-white bg-opacity-10 text-white px-4 py-2 rounded-md">
                                Questioning period has ended. Please wait for the evaluation.
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Next Question Button - Appears after evaluation */}
            {evaluationComplete && !isQuestioningEnabled && (
                <div className="absolute bottom-28 left-1/2 transform -translate-x-1/2 z-20">
                    <button
                        onClick={handleNextQuestion}
                        className="bg-green-500 hover:bg-green-600 text-white text-lg font-bold py-3 px-6 rounded-full shadow-lg flex items-center gap-2 animate-pulse"
                    >
                        Next Question
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
                </div>
            )}
        </div>
    );
}