'use client'

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import TypewriterText from '@/components/TypewriterText';
import { aiService, AI_MODELS } from '@/services/AI';
import { Message } from '@/utils/types';
import TypewriterTextWrapper from "@/components/TypewriterTextWrapper";

export default function MultiPage() {
    const router = useRouter();

    // State management
    const [messages, setMessages] = useState<Message[]>([]);
    const [completedMessageIds, setCompletedMessageIds] = useState<number[]>([]);
    const [scratchboardContent, setScratchboardContent] = useState("");
    const [input, setInput] = useState("");
    const [finalAnswer, setFinalAnswer] = useState("");
    const [nextMessageId, setNextMessageId] = useState(3);
    const [typingMessageIds, setTypingMessageIds] = useState<number[]>([]);
    const [isQuestioningEnabled, setIsQuestioningEnabled] = useState(true);
    const [evaluationComplete, setEvaluationComplete] = useState(false);
    const [botThinking, setBotThinking] = useState(false);
    const [userHasScrolled, setUserHasScrolled] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const [currentModel] = useState(AI_MODELS.CLAUDE_HAIKU.id);
    const [lastUserActivityTime, setLastUserActivityTime] = useState(Date.now());

    // Questions from JSON
    const [allQuestions, setAllQuestions] = useState<string[]>([]);
    const [loadedQuestions, setLoadedQuestions] = useState(false);

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
            id: 'bob',
            name: 'Bob',
            avatar: 'bob_avatar.svg',
            systemPrompt: `You are Bob, an experienced and encouraging math teacher guiding a classroom.
When introducing problems, provide clear context and relevant background concepts.
Guide discussions without giving away solutions. 
Respond to student questions with helpful insights and Socratic questioning.
Acknowledge good observations from students and gently correct misconceptions.
Your goal is to facilitate learning through guided discovery.`
        },
        {
            id: 'logic',
            name: 'Logic Bot',
            avatar: 'logic_avatar.png',
            systemPrompt: `You are Logic Bot, a student who excels at logical reasoning and step-by-step problem solving.
As a fellow student in the class, you discuss math problems with other students and ask questions to the teacher Bob.
Don't provide complete solutions immediately - instead, ask insightful questions about the problem or make brief comments.
Focus on logical structures, relationships, and analytical approaches to problems.
Interact naturally as a student would - express confusion when appropriate, celebrate insights, and build on others' ideas.
When it's time to submit a final answer, provide your complete solution with reasoning.`
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

    // Load questions from JSON file
    useEffect(() => {
        const fetchQuestions = async () => {
            try {
                const response = await fetch('/questions.json');
                if (!response.ok) {
                    throw new Error('Failed to fetch questions');
                }

                const data = await response.json();

                // Flatten all categories into a single array of questions
                const questions: string[] = Object.values(data).flat();

                setAllQuestions(questions);
                setLoadedQuestions(true);
                console.log("Loaded questions:", questions);
            } catch (error) {
                console.error("Error loading questions:", error);
                // Use fallback questions if we can't load from JSON
                setAllQuestions([
                    "In how many ways can four couples be seated at a round table if the men and women want to sit alternately?",
                    "In how many different ways can five people be seated at a circular table?",
                    "A shopping mall has a straight row of 5 flagpoles at its main entrance plaza. It has 3 identical green flags and 2 identical yellow flags. How many distinct arrangements of flags on the flagpoles are possible?"
                ]);
                setLoadedQuestions(true);
            }
        };

        fetchQuestions();
    }, []);

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

    // Add a new ref to track manual scroll state for the current message
    const currentMessageScrollOverrideRef = useRef(false);

    // Add a ref to track the last manual scroll time
    const lastManualScrollTimeRef = useRef(0);

    // Add a ref to track if we should force scroll on next render
    const forceScrollToBottomRef = useRef(false);

    // Add a ref to specifically track manual scroll override during generation
    const manualScrollOverrideRef = useRef(false);

    // Improve the scrollToBottom function to respect manual override
    const scrollToBottom = (force = false) => {
        const chatContainer = chatContainerRef.current;
        if (!chatContainer) return;

        // Never scroll if manual override is active, except for forced user messages
        if (manualScrollOverrideRef.current && !force) {
            return;
        }

        // Always scroll if force is true (used for user messages) or auto-scroll is active
        if (force || forceScrollToBottomRef.current || !userHasScrolled) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
            // Reset force flag after using it
            forceScrollToBottomRef.current = false;
        }
    };

    // Update the scroll handler to immediately set manual override
    const handleScroll = () => {
        const chatContainer = chatContainerRef.current;
        if (!chatContainer) return;

        // Check if this is a programmatic scroll (very recent auto-scroll)
        const isProgrammaticScroll = Date.now() - lastManualScrollTimeRef.current < 50;

        if (isProgrammaticScroll) {
            // Ignore programmatic scrolls
            return;
        }

        // More generous threshold - user only needs to scroll a small amount
        const isNearBottom = Math.abs(
            (chatContainer.scrollHeight - chatContainer.scrollTop) - chatContainer.clientHeight
        ) < 150;

        // If user scrolls up even slightly, set manual override
        if (!isNearBottom) {
            // Update regular scroll state
            setUserHasScrolled(true);

            // Set manual override that persists during generation
            manualScrollOverrideRef.current = true;

            console.log("Manual scroll detected - autoscroll disabled");
        } else {
            // If user scrolls back to bottom, they want to follow the conversation again
            setUserHasScrolled(false);
            manualScrollOverrideRef.current = false;
        }
    };

    // Update the message change effect to reset manual override only for new messages
    useEffect(() => {
        // Only reset manual override if the new message is from user
        // This way, generated text won't reset the override
        const latestMessage = messages[messages.length - 1];
        if (latestMessage && latestMessage.sender === 'user') {
            // User sent a new message, reset the override
            manualScrollOverrideRef.current = false;

            // Record the time of auto-scroll to avoid false detection
            const scrollTime = Date.now();
            lastManualScrollTimeRef.current = scrollTime;

            // Force scroll to bottom for user messages
            setTimeout(() => {
                scrollToBottom(true);
            }, 50);
        }
    }, [messages.length]);

    // Helper for formatting time
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    // Check if a specific bot is mentioned in the message
    const checkForBotMention = (message: string) => {
        const bobMentioned = message.includes('bob') || message.includes('teacher');
        const logicMentioned = message.includes('logic') || message.includes('logic bot');
        const patternMentioned = message.includes('pattern') || message.includes('pattern bot');

        if (bobMentioned) return 'bob';
        if (logicMentioned) return 'logic';
        if (patternMentioned) return 'pattern';
        return null;
    };

    // Update the autoSubmitTimeoutAnswer function to include showing the official solution
    const autoSubmitTimeoutAnswer = () => {
        console.log("Auto-submitting answer due to timeout");

        // Disable further questioning
        setIsQuestioningEnabled(false);
        roundEndedRef.current = true;

        // Only auto-submit if user has written something in the scratchboard
        const submissionText = finalAnswer.trim() || "No answer.";

            ensureNoTypingInProgress(() => {
                const userFinalAnswer: Message = {
                    id: getUniqueMessageId(),
                    sender: 'user',
                    text: `My final answer is: ${submissionText}\n\nMy reasoning:\n${scratchboardContent}`,
                    timestamp: new Date().toISOString()
                };

                setMessages(prev => [...prev, userFinalAnswer]);
                setFinalAnswer('');

                // Generate evaluation
                generateEvaluation(userFinalAnswer.text, currentQuestion);
            });
    };

    // Add a new function to generate and display the official solution
    const generateOfficialSolution = async (question: string) => {
        console.log("Generating official solution");

        // Add system message about time expiring
        const timeoutMessageId = getUniqueMessageId();
        setMessages(prev => [...prev, {
            id: timeoutMessageId,
            sender: 'system',
            text: 'Time has expired. Here is the official solution:',
            timestamp: new Date().toISOString()
        }]);

        // Add a typing indicator for the solution
        const solutionMessageId = getUniqueMessageId();
        setMessages(prev => [...prev, {
            id: solutionMessageId,
            sender: 'system',
            text: '...',
            timestamp: new Date().toISOString()
        }]);

        // Add to typing state
        setTypingMessageIds(prev => [...prev, solutionMessageId]);

        try {
            // Generate solution using AI
            const solutionPrompt = `You are an expert math teacher providing the official solution to a problem.`;

            const response = await aiService.generateResponse(
                [
                    {
                        id: 1,
                        sender: 'user',
                        text: `Problem: ${question}

Please provide:
1. A clear, step-by-step solution
2. The final correct answer
3. Key concepts and techniques used in solving this problem

Format your response in a structured way that shows the complete solution process.`
                    }
                ],
                {
                    systemPrompt: solutionPrompt,
                    model: currentModel
                }
            );

            // Replace typing indicator with actual solution
            setMessages(prev => prev.map(msg =>
                msg.id === solutionMessageId
                    ? {
                        ...msg,
                        text: response,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));

            // Add to typing state for animation
            setTypingMessageIds(prev => [...prev, solutionMessageId]);

            // Set evaluation as complete to enable the "Next Question" button
            setEvaluationComplete(true);

        } catch (error) {
            console.error("Error generating official solution:", error);

            // Provide a fallback message
            setMessages(prev => prev.map(msg =>
                msg.id === solutionMessageId
                    ? {
                        ...msg,
                        text: "Sorry, I couldn't generate the official solution. Please proceed to the next question.",
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));

            setEvaluationComplete(true);
        }
    };

    // Modify the timer useEffect to trigger the auto-submit
    useEffect(() => {
        if (timeLeft <= 0) {
            // Time's up logic
            if (isQuestioningEnabled) {
                // Only auto-submit if questioning is still enabled (hasn't been submitted yet)
                autoSubmitTimeoutAnswer();
            }
            return;
        }

        if (roundEndedRef.current) {
            return;
        }

        const timerId = setTimeout(() => {
            setTimeLeft(prevTime => prevTime - 1);
        }, 1000);

        return () => clearTimeout(timerId);
    }, [timeLeft]);

    // Auto-scroll when messages change
    useEffect(() => {
        // Set a short timeout to ensure the DOM has updated
        setTimeout(scrollToBottom, 50);

        // Reset the userHasScrolled flag when a new message is added
        setUserHasScrolled(false);
    }, [messages.length]);

    // Handler for user question
    const handleUserQuestion = () => {
        if (!input.trim() || typingMessageIds.length > 0) return;

        // Record user activity
        setLastUserActivityTime(Date.now());

        const userMessage: Message = {
            id: getUniqueMessageId(),
            sender: 'user',
            text: input,
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');

        // Force scroll to bottom when user sends a message
        forceScrollToBottomRef.current = true;
        setTimeout(() => scrollToBottom(true), 50);

        // Check if a specific bot was mentioned
        const mentionedBot = checkForBotMention(userMessage.text);

        // Generate AI responses based on which bot was mentioned
        generateAIResponse(userMessage.text, mentionedBot);
    };

    // Handle submit/evaluation
    const handleSend = () => {
        if (!finalAnswer.trim() || !scratchboardContent.trim() || typingMessageIds.length > 0) return;

        // Record user activity
        setLastUserActivityTime(Date.now());

        ensureNoTypingInProgress(() => {
            const userFinalAnswer: Message = {
                id: getUniqueMessageId(),
                sender: 'user',
                text: `My final answer is: ${finalAnswer}\n\nMy reasoning:\n${scratchboardContent}`,
                timestamp: new Date().toISOString()
            };

            setMessages(prev => [...prev, userFinalAnswer]);
            setFinalAnswer('');

            // Force scroll to bottom when user submits final answer
            forceScrollToBottomRef.current = true;
            setTimeout(() => scrollToBottom(true), 50);

            // Don't clear scratchboard to allow review
            // Disable further questioning
            setIsQuestioningEnabled(false);
            roundEndedRef.current = true;

            // Generate evaluation
            generateEvaluation(userFinalAnswer.text, currentQuestion);
        });
    };

    // AI response generation
    const generateAIResponse = async (userMessage: string, mentionedBot: string | null) => {
        // Don't generate responses if time's up
        if (roundEndedRef.current) return;

        // Determine which bot(s) should respond
        let selectedAgentIndex: number;

        if (mentionedBot === 'bob') {
            // Teacher Bob should respond
            selectedAgentIndex = 0; // Assuming Bob is the first agent now
        } else if (mentionedBot === 'logic') {
            // Only Logic Bot should respond
            selectedAgentIndex = 1; // Logic Bot is now second
        } else if (mentionedBot === 'pattern') {
            // Only Pattern Bot should respond
            selectedAgentIndex = 2; // Pattern Bot is now third
        } else {
            // Default to Bob if no specific mention
            selectedAgentIndex = 0;
        }

        const selectedAgent = agents[selectedAgentIndex];

        console.log(`Generating response from ${selectedAgent.name}`);
        setBotThinking(true);

        try {
            // Show typing indicator temporarily
            const tempMessageId = getUniqueMessageId();
            setMessages(prev => [...prev, {
                id: tempMessageId,
                sender: 'ai',
                text: '...',
                agentId: selectedAgent.id,
                timestamp: new Date().toISOString()
            }]);

            // Generate AI response using the correct API call
            const response = await aiService.generateResponse(
                [
                    {
                        id: 1,
                        sender: 'user',
                        text: `The current problem is: ${currentQuestion}`
                    },
                    {
                        id: 2,
                        sender: 'user',
                        text: `The student asked: ${userMessage}`
                    }
                ],
                {
                    systemPrompt: selectedAgent.systemPrompt,
                    model: currentModel
                }
            );

            // Replace typing indicator with actual message
            setMessages(prev => prev.map(msg =>
                msg.id === tempMessageId
                    ? {
                        ...msg,
                        text: response,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));

            // Add to typing state
            setTypingMessageIds(prev => [...prev, tempMessageId]);

            // Check if the other agent should also respond
            // Only if both bots were mentioned or no specific bot was mentioned
            if ((mentionedBot === 'both' || mentionedBot === null) && Math.random() < 0.3) {
                const otherAgentIndex = 1 - selectedAgentIndex;
                const otherAgent = agents[otherAgentIndex];

                // Wait a bit before second agent responds
                setTimeout(() => {
                    generateFollowUpResponse(otherAgent, userMessage, response);
                }, 1000);
            }

        } catch (error) {
            console.error("Error generating AI response:", error);
            setMessages(prev => prev.filter(msg => msg.text !== '...'));
        } finally {
            setBotThinking(false);
        }
    };

    // Follow-up response generation
    const generateFollowUpResponse = async (agent: any, userMessage: string, firstAgentResponse: string) => {
        // Don't generate responses if time's up
        if (roundEndedRef.current) return;

        console.log(`Generating follow-up from ${agent.name}`);
        setBotThinking(true);

        try {
            // Show typing indicator temporarily
            const tempMessageId = getUniqueMessageId();
            setMessages(prev => [...prev, {
                id: tempMessageId,
                sender: 'ai',
                text: '...',
                agentId: agent.id,
                timestamp: new Date().toISOString()
            }]);

            // Generate AI response using the correct API call
            const response = await aiService.generateResponse(
                [
                    {
                        id: 1,
                        sender: 'user',
                        text: `The current problem is: ${currentQuestion}`
                    },
                    {
                        id: 2,
                        sender: 'user',
                        text: `The student asked: ${userMessage}`
                    },
                    {
                        id: 3,
                        sender: 'user',
                        text: `The other AI student responded: ${firstAgentResponse}`
                    },
                    {
                        id: 4,
                        sender: 'user',
                        text: 'Provide your perspective on this problem, possibly building on what the other student said or offering an alternative approach. Keep it conversational and helpful.'
                    }
                ],
                {
                    systemPrompt: agent.systemPrompt,
                    model: currentModel
                }
            );

            // Replace typing indicator with actual message
            setMessages(prev => prev.map(msg =>
                msg.id === tempMessageId
                    ? {
                        ...msg,
                        text: response,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));

            // Add to typing state
            setTypingMessageIds(prev => [...prev, tempMessageId]);

        } catch (error) {
            console.error("Error generating follow-up response:", error);
            setMessages(prev => prev.filter(msg => msg.text !== '...'));
        } finally {
            setBotThinking(false);
        }
    };

    // Update generateAIStudentFinalAnswers to return the answers
    const generateAIStudentFinalAnswers = async (question: string) => {
        // Return the final answers for later use
        return new Promise<{logicAnswer: string, patternAnswer: string}>(async (resolve) => {
            // Generate Logic Bot's final answer first
            const logicMessageId = getUniqueMessageId();
            
            // Add Logic Bot's message with typing indicator
            setMessages(prev => [...prev, {
                id: logicMessageId,
                sender: "ai",
                text: "I'm working on my final answer...",
                agentId: "logic",
                timestamp: new Date().toISOString()
            }]);
            
            try {
                // Generate Logic Bot's final answer with a clear prompt
                const logicResponse = await aiService.generateResponse(
                    [{ 
                        id: 1, 
                        sender: "user", 
                        text: `Problem: ${question}\n\nThe teacher has asked for final answers. As Logic Bot, provide your FINAL ANSWER to this problem. Include your solution approach and reasoning. Start with "My final answer is:" followed by your solution. This is NOT a question or comment.` 
                    }],
                    { systemPrompt: agents[1].systemPrompt, model: currentModel }
                );
                
                // Make sure the response starts with "My final answer is:"
                const formattedLogicResponse = logicResponse.startsWith("My final answer is:") 
                    ? logicResponse 
                    : `My final answer is:\n\n${logicResponse}`;
                
                // Store logic answer for return value
                const logicFinalAnswer = formattedLogicResponse;
                
                // Update message with response
                setMessages(prev => prev.map(msg => 
                    msg.id === logicMessageId 
                    ? { 
                        ...msg, 
                        text: formattedLogicResponse,
                        timestamp: new Date().toISOString(),
                        onComplete: () => {
                            console.log("Logic Bot's final answer typed completely");
                            // Create a timeout to show Pattern Bot's message after Logic Bot finishes
                            setTimeout(async () => {
                                // Generate Pattern Bot's final answer
                                const patternMessageId = getUniqueMessageId();
                                
                                // Add Pattern Bot's message with typing indicator
                                setMessages(prev => [...prev, {
                                    id: patternMessageId,
                                    sender: "ai",
                                    text: "I'm finalizing my solution...",
                                    agentId: "pattern",
                                    timestamp: new Date().toISOString()
                                }]);
                                
                                try {
                                    // Generate Pattern Bot's answer with a clear prompt
                                    const patternResponse = await aiService.generateResponse(
                                        [{ 
                                            id: 1, 
                                            sender: "user", 
                                            text: `Problem: ${question}\n\nThe teacher has asked for final answers. As Pattern Bot, provide your FINAL ANSWER to this problem. Include your solution approach and reasoning. Start with "My final answer is:" followed by your solution. This is NOT a question or comment.` 
                                        }],
                                        { systemPrompt: agents[2].systemPrompt, model: currentModel }
                                    );
                                    
                                    // Make sure the response starts with "My final answer is:"
                                    const formattedPatternResponse = patternResponse.startsWith("My final answer is:") 
                                        ? patternResponse 
                                        : `My final answer is:\n\n${patternResponse}`;
                                    
                                    // Store pattern answer for return value
                                    const patternFinalAnswer = formattedPatternResponse;
                                    
                                    // Update message with response
                                    setMessages(prev => prev.map(msg => 
                                        msg.id === patternMessageId 
                                        ? { 
                                            ...msg, 
                                            text: formattedPatternResponse,
                                            timestamp: new Date().toISOString(),
                                            onComplete: () => {
                                                console.log("Pattern Bot's final answer typed completely");
                                                // All done, resolve the promise with both answers
                                                setTimeout(() => {
                                                    resolve({
                                                        logicAnswer: logicFinalAnswer,
                                                        patternAnswer: patternFinalAnswer
                                                    });
                                                }, 1000);
                                            }
                                        } 
                                        : msg
                                    ));
                                    
                                    // Add to typing state for typewriter effect
                                    setTypingMessageIds(prev => [...prev, patternMessageId]);
                                    
                                } catch (error) {
                                    console.error("Error generating Pattern Bot final answer:", error);
                                    resolve({
                                        logicAnswer: logicFinalAnswer,
                                        patternAnswer: "Pattern Bot was unable to provide a final answer."
                                    }); 
                                }
                            }, 2000); // Wait 2 seconds after Logic Bot finishes
                        }
                    } 
                    : msg
                ));
                
                // Add to typing state for typewriter effect
                setTypingMessageIds(prev => [...prev, logicMessageId]);
                
            } catch (error) {
                console.error("Error generating Logic Bot final answer:", error);
                resolve({
                    logicAnswer: "Logic Bot was unable to provide a final answer.",
                    patternAnswer: "Pattern Bot was unable to provide a final answer."
                });
            }
        });
    };

    // Update generateEvaluation to use the returned answers directly
    const generateEvaluation = async (finalAnswer: string, question: string) => {
        console.log("Generating evaluation");
        setBotThinking(true);

        try {
            // Add system message about evaluation
            const tempMessageId = getUniqueMessageId();
            setMessages(prev => [...prev, {
                id: tempMessageId,
                sender: 'system',
                text: 'Bob is asking students for their final answers...',
                timestamp: new Date().toISOString()
            }]);

            // Get AI students' final answers and WAIT for them to complete
            // Now we directly get the answers from the function
            const { logicAnswer, patternAnswer } = await generateAIStudentFinalAnswers(question);
            
            console.log("Got final answers:", { logicAnswer, patternAnswer });
            
            // Update the system message
            setMessages(prev => prev.map(msg => 
                msg.id === tempMessageId
                ? {
                    ...msg,
                    text: 'Bob is evaluating all the answers...',
                    timestamp: new Date().toISOString()
                }
                : msg
            ));
            
            // Once AI students have submitted answers, generate Bob's evaluation
            const bobMessageId = getUniqueMessageId();
            setMessages(prev => [...prev, {
                id: bobMessageId,
                sender: "ai",
                text: "...",
                agentId: "bob",
                timestamp: new Date().toISOString()
            }]);
            
            // Generate Bob's evaluation of all answers - using the answers we got directly
            const response = await aiService.generateResponse(
                [
                    {
                        id: 1,
                        sender: "user",
                        text: `Problem: ${question}
                        
Student's final answer: ${finalAnswer}

Logic Bot's final answer: ${logicAnswer}

Pattern Bot's final answer: ${patternAnswer}

As Bob the teacher, provide:
1. The correct solution to this problem
2. An evaluation of all three answers, highlighting strengths and areas for improvement in each
3. Key learning points from this problem

Format your response in a clear, encouraging way as a teacher would.`
                    }
                ],
                {
                    systemPrompt: agents[0].systemPrompt,
                    model: currentModel
                }
            );

            // Remove the system message
            setMessages(prev => prev.filter(msg => msg.id !== tempMessageId));
            
            // Update Bob's evaluation message
            setMessages(prev => prev.map(msg =>
                msg.id === bobMessageId
                    ? {
                        ...msg,
                        text: response,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));

            // Add to typing state for typewriter effect
            setTypingMessageIds(prev => [...prev, bobMessageId]);
            setEvaluationComplete(true);
        } catch (error) {
            console.error("Error generating evaluation:", error);
            // Handle error
        } finally {
            setBotThinking(false);
        }
    };

    // Add a new state to track which bot spoke last
    const [lastSpeakingBot, setLastSpeakingBot] = useState<string | null>(null);

    // Add a global reference to track pending bot interactions
    const pendingBotInteractionsRef = useRef<Array<() => void>>([]);

    // Update startNewRound to use the completedMessageIds for sequencing
    const startNewRound = async () => {
        // Reset tracking of who spoke last
        setLastSpeakingBot(null);
        
        // Wait for questions to load if they haven't yet
        if (!loadedQuestions) {
            console.log("Waiting for questions to load...");
            setTimeout(startNewRound, 500);
            return;
        }

        // Check if we've used all questions and should go to the test screen
        if (usedQuestionIndices.length >= allQuestions.length) {
            console.log("All questions used, redirecting to test screen");
            router.push('/break');
            return;
        }

        // Reset state for new round
        console.log("Starting new round");
        setMessages([]);
        setCompletedMessageIds([]);
        setTypingMessageIds([]);
        setEvaluationComplete(false);
        setScratchboardContent("");
        setInput("");
        setFinalAnswer("");
        setUserHasScrolled(false);

        try {
            // Find an unused question
            let newIndex = currentQuestionIndex;
            while (usedQuestionIndices.includes(newIndex) && usedQuestionIndices.length < allQuestions.length) {
                newIndex = Math.floor(Math.random() * allQuestions.length);
            }

            setCurrentQuestionIndex(newIndex);
            setUsedQuestionIndices(prev => [...prev, newIndex]);

            const selectedQuestion = allQuestions[newIndex];
            setCurrentQuestion(selectedQuestion);

            // Clear any pending interactions from previous round
            pendingBotInteractionsRef.current = [];
            
            // Set up messages for the new round with Bob introducing the problem
            const bobIntroId = getUniqueMessageId();
            
            // Create a message object with an onComplete callback
            const bobIntroMessage = {
                id: bobIntroId,
                    sender: "ai",
                text: `Today we'll be working on an interesting problem. Take your time to understand it and think about your approach:\n\n${selectedQuestion}\n\nConsider what concepts might apply here. Feel free to ask questions as you work.`,
                agentId: "bob",
                timestamp: new Date().toISOString(),
                onComplete: () => {
                    console.log("Bob's intro completed, triggering Logic Bot");
                    // When Bob's intro is done typing, trigger Logic Bot
                    setTimeout(() => {
                        generateAIStudentComment("logic", selectedQuestion);
                    }, 2000); // Short pause after typing completes
                }
            };
            
            setMessages([bobIntroMessage]);
            setTypingMessageIds(prev => [...prev, bobIntroId]);
            
            // Reset timer and other state
            setTimeLeft(120);
            setIsQuestioningEnabled(true);
            roundEndedRef.current = false;

            // After Bob introduces the problem, set him as the last speaker
            setLastSpeakingBot("bob");

        } catch (error) {
            console.error("Error starting new round:", error);

            // Use a fallback question
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

    // Initialize with first question once questions are loaded
    useEffect(() => {
        if (loadedQuestions) {
            startNewRound();
        }
    }, [loadedQuestions]);

    // Handle next question button
    const handleNextQuestion = () => {
        setEvaluationComplete(false);
        startNewRound();
    };

    // Update generateAIStudentComment to fix the issue with Bob not responding
    const generateAIStudentComment = async (agentId: string, question: string) => {
        // Don't generate if round ended
        if (roundEndedRef.current) return;
        
        const agent = agents.find(a => a.id === agentId);
        if (!agent) return;
        
        const messageId = getUniqueMessageId();
        
        // Add typing indicator first
        setMessages(prev => [...prev, {
            id: messageId,
            sender: "ai",
            text: "...",
            agentId: agentId,
            timestamp: new Date().toISOString()
        }]);
        
        try {
            // Generate a brief question or comment about the problem
            const response = await aiService.generateResponse(
                [
                    {
                        id: 1,
                        sender: "user",
                        text: `The teacher just presented this problem: ${question}\n\nAs a student, provide a brief question or observation about this problem. Keep it concise (1-3 sentences) and don't solve it. Ask something insightful or make an observation that shows you're thinking about the problem.`
                    }
                ],
                {
                    systemPrompt: agent.systemPrompt,
                    model: currentModel
                }
            );
            
            // Store the response for later use
            const studentResponseText = response;
            
            // Update message with response and add onComplete callback
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: studentResponseText,
                        timestamp: new Date().toISOString(),
                        onComplete: () => {
                            console.log(`${agentId}'s comment completed, triggering teacher response`);
                            // When student's message is done typing, trigger Bob's response
                            setTimeout(() => {
                                generateTeacherResponse(question, studentResponseText, agentId);
                            }, 2000); // Short pause after typing completes
                        }
                    }
                    : msg
            ));
            
            // Add to typing state AFTER setting the text
            setTypingMessageIds(prev => [...prev, messageId]);
        } catch (error) {
            console.error("Error generating student comment:", error);
            // Handle error
        }
    };

    // Update generateTeacherResponse to ensure proper sequencing
    const generateTeacherResponse = async (question: string, studentMessage: string, studentId: string) => {
        // Don't generate if round ended
        if (roundEndedRef.current) return;
        
        const messageId = getUniqueMessageId();
        
        // Add typing indicator with onComplete callback
        const teacherMessage = {
            id: messageId,
            sender: "ai",
            text: "...",
            agentId: "bob",
            timestamp: new Date().toISOString(),
            onComplete: () => {
                console.log("Bob's response completed, maybe triggering next student");
                // When Bob's response is done typing, maybe trigger the other student
                setTimeout(() => {
                    // Only continue the conversation 70% of the time
                    if (Math.random() < 0.7 && !roundEndedRef.current) {
                        // Choose the other student to respond
                        const otherStudentId = studentId === "logic" ? "pattern" : "logic";
                        // Generate a follow-up comment from the other student
                        generateAIStudentComment(otherStudentId, question);
                    }
                }, 2000); // Short pause after typing completes
            }
        };
        
        setMessages(prev => [...prev, teacherMessage]);
        
        try {
            const studentName = agents.find(a => a.id === studentId)?.name || studentId;
            
            // Generate Bob's response to the student
            const response = await aiService.generateResponse(
                [
                    {
                        id: 1,
                        sender: "user",
                        text: `Problem: ${question}\n\n${studentName} asked/commented: "${studentMessage}"\n\nAs the teacher, provide a thoughtful but brief response that guides without giving away the solution. Acknowledge good insights or gently redirect if needed.`
                    }
                ],
                {
                    systemPrompt: agents.find(a => a.id === "bob")?.systemPrompt,
                    model: currentModel
                }
            );
            
            // Update message with response
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: response,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // Add to typing state AFTER setting the text
            setTypingMessageIds(prev => [...prev, messageId]);
        } catch (error) {
            console.error("Error generating teacher response:", error);
            // Handle error
        }
    };

    return (
        <div className="h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4 flex flex-row overflow-hidden">
            {/* LEFT PANEL - Problem, Submission, Scratchboard */}
            <div className="w-1/2 pr-2 flex flex-col h-full overflow-hidden">
                {/* Problem Display with Timer inside */}
                {currentQuestion && (
                    <div className="bg-white bg-opacity-20 p-4 rounded-md mb-4 border-2 border-purple-400">
                        <div className="flex justify-between items-start mb-2">
                            <h2 className="text-xl text-white font-semibold">Problem:</h2>
                            {/* Timer integrated in problem statement */}
                            <div className={`p-2 rounded-lg ${timeLeft > 20
                                ? 'bg-green-700'
                                : timeLeft > 10
                                    ? 'bg-yellow-600 animate-pulse'
                                    : 'bg-red-700 animate-pulse'} ml-4`}>
                                <div className="text-xl font-mono text-white">{formatTime(timeLeft)}</div>
                                {timeLeft <= 20 && (
                                    <div className="text-xs text-white text-center">
                                        {timeLeft <= 10 ? "Time almost up!" : "Finish soon!"}
                                    </div>
                                )}
                            </div>
                        </div>
                        <p className="text-white text-lg">{currentQuestion}</p>
                    </div>
                )}

                {/* Final Answer - Now above scratchboard with enhanced styling */}
                <div className="bg-white bg-opacity-15 rounded-md p-4 mb-4 border-2 border-blue-400 shadow-lg">
                    <h3 className="text-xl text-white font-semibold mb-2">Your Final Answer</h3>
                    <div className="flex flex-col space-y-3">
                        <input
                            type="text"
                            value={finalAnswer}
                            onChange={(e) => setFinalAnswer(e.target.value)}
                            placeholder="Enter your final answer here..."
                            className="w-full bg-white bg-opacity-10 text-white border border-gray-600 rounded-md px-3 py-3 text-lg"
                        />
                        <button
                            onClick={() => handleSend()}
                            disabled={!finalAnswer.trim() || !scratchboardContent.trim() || typingMessageIds.length > 0}
                            className={`px-4 py-3 rounded-md text-lg font-medium ${finalAnswer.trim() && scratchboardContent.trim() && typingMessageIds.length === 0
                                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                }`}
                        >
                            Submit Final Answer
                        </button>
                    </div>
                </div>

                {/* Scratchboard - Now below final answer with different styling */}
                <div className="flex-1 border border-gray-600 rounded-md p-3 bg-black bg-opacity-30 overflow-auto">
                    <div className="flex justify-between mb-2">
                        <h3 className="text-white font-semibold">Rough Work (Scratchpad)</h3>
                    </div>
                    <textarea
                        value={scratchboardContent}
                        onChange={(e) => setScratchboardContent(e.target.value)}
                        className="w-full h-[calc(100%-40px)] min-h-[200px] bg-black bg-opacity-40 text-white border-none rounded p-2"
                        placeholder="Show your work here... (calculations, reasoning, etc.)"
                    />
                </div>
            </div>

            {/* RIGHT PANEL - Chat */}
            <div className="w-1/2 pl-2 flex flex-col h-full">
                <div className="flex-1 bg-white bg-opacity-10 rounded-md flex flex-col overflow-hidden">
                    {/* Agent info for group/multi modes */}
                    <div className="bg-black bg-opacity-30 p-2">
                        <div className="flex space-x-3">
                            {agents.map(agent => (
                                <div key={agent.id} className="flex items-center">
                                    <Image
                                        src={agent.avatar}
                                        alt={agent.name}
                                        width={40}
                                        height={40}
                                        className="rounded-full border-2 border-white"
                                    />
                                    <span className="text-xs text-white ml-2">{agent.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Chat messages - Scrollable */}
                    <div className="flex-1 p-4 overflow-y-auto"
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
                                            width={40}
                                            height={40}
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

                                    {typingMessageIds.includes(msg.id) ? (
                                        <TypewriterTextWrapper
                                            key={`typewriter-${msg.id}`}
                                            text={msg.text}
                                            speed={20}
                                            messageId={msg.id}
                                            onTypingProgress={(progress) => {
                                                if (!userHasScrolled) {
                                                    scrollToBottom();
                                                }
                                            }}
                                            onTypingComplete={() => {
                                                console.log(`Message ${msg.id} completed typing`);

                                                setTimeout(() => {
                                                    if (typingMessageIds.includes(msg.id)) {
                                                        setTypingMessageIds(prev => prev.filter(id => id !== msg.id));
                                                        setCompletedMessageIds(prev => [...prev, msg.id]);

                                                        if (msg.onComplete) {
                                                            msg.onComplete();
                                                        }

                                                        if (!userHasScrolled) {
                                                            scrollToBottom();
                                                        }
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

                    {/* Chat input (for questions only, separate from final answer) */}
                    {isQuestioningEnabled && (
                        <div className="p-3 bg-black bg-opacity-30">
                            <div className="flex space-x-2">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Ask about the problem (mention Bob, Logic Bot, or Pattern Bot specifically if needed)..."
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
                            </div>
                        </div>
                    )}

                    {/* Next question button (when time's up) */}
                    {!isQuestioningEnabled && evaluationComplete && (
                        <div className="p-3 bg-black bg-opacity-30 flex justify-center">
                            <button
                                onClick={handleNextQuestion}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md"
                            >
                                Next Question
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}