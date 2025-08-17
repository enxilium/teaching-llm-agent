import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Message } from "@/utils/types";
import { Agent } from "@/lib/agents";
import { aiService } from "@/services/AI";
import TypewriterTextWrapper from "./TypewriterTextWrapper";
import { formatMessageForDisplay } from "@/lib/utils";
import RenderMathExpression from "./RenderMathExpression";
import MessageWithHighlights from "./MessageWithHighlights";

interface MultiScenarioChatProps {
    agents: Agent[];
    initialMessages: Message[];
    onNewMessage: (message: Message) => void;
    isQuestioningEnabled: boolean;
    setIsQuestioningEnabled: (isEnabled: boolean) => void;
    triggerInitialResponse?: boolean;
    currentQuestion?: {
        id: number;
        question: string;
        options?: string[] | Record<string, string>;
        answer: string;
        correctAnswer?: string;
    };
    agentContextMessage?: Message; // Message with full context for agents
}

const MultiScenarioChat: React.FC<MultiScenarioChatProps> = ({
    agents,
    initialMessages,
    onNewMessage,
    isQuestioningEnabled,
    setIsQuestioningEnabled,
    triggerInitialResponse = false,
    currentQuestion,
    agentContextMessage,
}) => {
    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [input, setInput] = useState("");
    const [typingMessageIds, setTypingMessageIds] = useState<number[]>([]);
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipMessage, setTooltipMessage] = useState("");
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const lastQuestioningAgent = useRef<string | null>(null); // Track which agent asked the last question
    const followUpInProgressRef = useRef(false);
    const followUpCountRef = useRef(0); // Track follow-up rounds
    const agentResponseInProgressRef = useRef(false); // Prevent multiple simultaneous responses
    const cancelCurrentResponseRef = useRef(false); // Signal to cancel ongoing agent responses
    const lastRespondentTypeRef = useRef<"bot" | "user" | null>(null); // Track who responded last for alternating
    const hasInitialResponseStarted = useRef(false); // Track if initial response sequence has started
    const nextMessageIdRef = useRef(
        Math.max(...initialMessages.map((m) => m.id), 0) + 1
    );
    const isUnmountedRef = useRef(false); // Track if component is unmounted
    const pendingTimeoutsRef = useRef<Set<NodeJS.Timeout>>(new Set()); // Track all timeouts for cleanup

    // State to track peer conversation exchanges to prevent infinite loops
    const peerExchangeCountRef = useRef(0);

    // Cleanup function to stop all ongoing operations
    const cleanup = useCallback(() => {
        console.log("🧹 MultiScenarioChat component cleanup initiated");
        isUnmountedRef.current = true;
        agentResponseInProgressRef.current = false;
        
        // Clear all pending timeouts
        pendingTimeoutsRef.current.forEach(timeout => {
            clearTimeout(timeout);
        });
        pendingTimeoutsRef.current.clear();
        
        // Hide any active tooltips
        setShowTooltip(false);
        
        console.log("✅ MultiScenarioChat component cleanup completed");
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            cleanup();
        };
    }, [cleanup]);

    // Helper function to create managed timeouts that auto-cleanup
    const createManagedTimeout = useCallback((callback: () => void, delay: number): NodeJS.Timeout => {
        if (isUnmountedRef.current) {
            // Component is unmounted, don't create new timeouts
            return setTimeout(() => {}, 0); // Return a dummy timeout
        }
        
        const timeout = setTimeout(() => {
            pendingTimeoutsRef.current.delete(timeout);
            if (!isUnmountedRef.current) {
                callback();
            }
        }, delay);
        
        pendingTimeoutsRef.current.add(timeout);
        return timeout;
    }, []);

    // Helper function for cancellable delays in async flows
    const cancellableDelay = useCallback((ms: number): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (isUnmountedRef.current) {
                reject(new Error("Component unmounted"));
                return;
            }
            const timeout = createManagedTimeout(() => resolve(), ms);
        });
    }, [createManagedTimeout]);

    // Helper function to ensure Bob's response has proper @mention
    const ensureProperMention = useCallback((bobResponse: string, intendedParticipant: string): string => {
        // Check if the response already has a proper @mention
        if (bobResponse.includes('@Alice') || bobResponse.includes('@Charlie') || bobResponse.includes('@User')) {
            return bobResponse;
        }
        
        // If no @mention found, add one at the end
        const fixedResponse = `${bobResponse}\n\n@${intendedParticipant}, what do you think?`;
        console.log(`⚠️ Fixed Bob's response to include @mention for ${intendedParticipant}`);
        return fixedResponse;
    }, []);

    // Helper function to randomly select next participant for Bob to address
    const getRandomParticipant = useCallback((): string => {
        const participants = ['User', 'Alice', 'Charlie'];
        const randomIndex = Math.floor(Math.random() * participants.length);
        const selected = participants[randomIndex];
        console.log(`🎲 Randomly selected participant for Bob to address: ${selected}`);
        return selected;
    }, []);

    // Helper function to parse who was addressed in a message (only check the final paragraph for follow-up questions)
    const parseAddressedParticipant = useCallback((message: string): string => {
        // Split message into paragraphs and get the last one (where follow-up questions typically are)
        const paragraphs = message.split('\n').filter(p => p.trim().length > 0);
        const lastParagraph = paragraphs[paragraphs.length - 1] || message;
        
        // Check the last paragraph for addressing - this is where follow-up questions are typically directed
        if (lastParagraph.includes('@Alice')) return 'Alice';
        if (lastParagraph.includes('@Charlie')) return 'Charlie';
        if (lastParagraph.includes('@User')) return 'User';
        
        // If no explicit addressing in the last paragraph, default to User
        return 'User';
    }, []);

    // Helper function to detect if user is responding to a direct question vs interrupting
    const isUserRespondingToQuestion = useCallback((userMessage: Message): boolean => {
        // Get the last agent message
        const lastAgentMessage = messages.slice().reverse().find(msg => msg.sender === "ai");
        
        if (!lastAgentMessage) {
            return true; // First message is always a response
        }
        
        // Check if the last agent message addressed the user directly
        const addressedParticipant = parseAddressedParticipant(lastAgentMessage.text);
        
        if (addressedParticipant === 'User') {
            return true; // User was directly addressed
        }
        
        // Last agent message wasn't directed at user, so this is likely an interruption
        return false;
    }, [messages, parseAddressedParticipant]);

    // Enhanced state setter that checks if component is mounted
    const safeSetMessages = useCallback((updater: React.SetStateAction<Message[]>) => {
        if (!isUnmountedRef.current) {
            setMessages(updater);
        }
    }, []);

    const safeSetTypingMessageIds = useCallback((updater: React.SetStateAction<number[]>) => {
        if (!isUnmountedRef.current) {
            setTypingMessageIds(updater);
        }
    }, []);

    const safeSetIsQuestioningEnabled = useCallback((enabled: boolean) => {
        if (!isUnmountedRef.current) {
            setIsQuestioningEnabled(enabled);
        }
    }, [setIsQuestioningEnabled]);

    // Safe state setter for tooltip
    const safeSetShowTooltip = useCallback((show: boolean) => {
        if (!isUnmountedRef.current) {
            setShowTooltip(show);
        }
    }, []);

    const safeSetTooltipMessage = useCallback((message: string) => {
        if (!isUnmountedRef.current) {
            setTooltipMessage(message);
        }
    }, []);

    useEffect(() => {
        // Only update messages if we don't already have them to avoid wiping agent responses
        if (messages.length === 0 && initialMessages.length > 0) {
            setMessages(initialMessages);
        }
    }, [initialMessages, messages.length]);

    // Auto-scroll when new messages are added
    useEffect(() => {
        // Small delay to allow DOM to update with new message
        const timer = setTimeout(() => {
            if (chatContainerRef.current) {
                chatContainerRef.current.scrollTop =
                    chatContainerRef.current.scrollHeight;
            }
        }, 50);

        return () => clearTimeout(timer);
    }, [messages.length]);

    const getUniqueMessageId = () => {
        const id = nextMessageIdRef.current;
        nextMessageIdRef.current += 1;
        console.log(`Generated unique message ID: ${id}, next will be: ${nextMessageIdRef.current}`);
        return id;
    };

    const addTypingMessageId = (messageId: number) => {
        safeSetTypingMessageIds((prev) => [...prev, messageId]);
    };

    const removeTypingMessageId = (messageId: number) => {
        safeSetTypingMessageIds((prev) => prev.filter((id) => id !== messageId));
        // Auto-scroll to bottom when typing completes
        scrollToBottom();
    };

    // Safe wrapper functions for typing message IDs
    const safeAddTypingMessageId = useCallback((id: number) => {
        if (!isUnmountedRef.current) {
            addTypingMessageId(id);
        }
    }, []);

    const safeRemoveTypingMessageId = useCallback((id: number) => {
        if (!isUnmountedRef.current) {
            removeTypingMessageId(id);
        }
    }, []);

    const scrollToBottom = () => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop =
                chatContainerRef.current.scrollHeight;
        }
    };

    // Function to cancel ongoing agent responses when user interrupts
    const cancelOngoingResponses = useCallback(() => {
        console.log("🚫 Cancelling ongoing agent responses due to user interruption");
        
        // Signal all agent functions to stop
        cancelCurrentResponseRef.current = true;
        
        // Clear all managed timeouts to prevent delayed responses
        pendingTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
        pendingTimeoutsRef.current.clear();
        console.log("🚫 Cleared all pending managed timeouts");
        
        // Clear typing indicators
        safeSetTypingMessageIds([]);
        
        // Remove any placeholder messages (those with "..." text)
        safeSetMessages(prev => prev.filter(msg => msg.text !== "..."));
        
        // Reset agent response flag
        agentResponseInProgressRef.current = false;
        
        console.log("✅ Ongoing response cancellation completed");
    }, [safeSetTypingMessageIds, safeSetMessages]);

    // Function to stop agent responses when user is addressed (but keep existing messages)
    const stopAgentResponsesForUserTurn = useCallback(() => {
        console.log("🛑 Stopping agent responses - user's turn to respond");
        
        // Signal all agent functions to stop generating new responses
        cancelCurrentResponseRef.current = true;
        
        // Clear all managed timeouts to prevent delayed agent responses
        pendingTimeoutsRef.current.forEach(timeout => clearTimeout(timeout));
        pendingTimeoutsRef.current.clear();
        console.log("🛑 Cleared all pending timeouts - waiting for user response");
        
        // Reset agent response flag
        agentResponseInProgressRef.current = false;
        
        console.log("✅ Agent response stopping completed - user can now respond");
    }, []);

    // Bob's redirect response when user doesn't respond to his direct question
    const generateBobRedirectResponse = useCallback(async () => {
        const bobAgent = agents.find(agent => agent.id === "bob");
        if (!bobAgent) return;

        const placeholderId = getUniqueMessageId();
        const placeholder: Message = {
            id: placeholderId,
            sender: "ai",
            agentId: bobAgent.id,
            text: "...",
            timestamp: new Date().toISOString(),
        };

        setMessages(prev => [...prev, placeholder]);
        addTypingMessageId(placeholderId);

        try {
            // Get the last few messages for context
            const recentMessages = messages.slice(-3).map(msg => {
                if (msg.sender === 'user') {
                    return `User: ${msg.text}`;
                } else if (msg.agentId === 'arithmetic') {
                    return `Alice: ${msg.text}`;
                } else if (msg.agentId === 'concept') {
                    return `Charlie: ${msg.text}`;
                } else if (msg.agentId === 'bob') {
                    return `Bob: ${msg.text}`;
                } else {
                    return `${msg.agentId || 'Agent'}: ${msg.text}`;
                }
            }).join('\n');

            // Randomly select who Bob should redirect to (Alice or Charlie only for redirect)
            const redirectOptions = ['Alice', 'Charlie'];
            const randomIndex = Math.floor(Math.random() * redirectOptions.length);
            const redirectTarget = redirectOptions[randomIndex];
            console.log(`🎲 Bob redirecting to: ${redirectTarget}`);

            const bobPrompt = `${bobAgent.systemPrompt}

Question: ${currentQuestion?.question || "No question available"}

This is a group discussion with three students: User, Alice, and Charlie. Here's the recent conversation:
${recentMessages}

The user didn't respond to your previous question. As Bob the tutor, acknowledge that the user might need more time or be thinking, then redirect the question specifically to @${redirectTarget} to keep the discussion moving. Mention that the user can still jump in whenever they're ready. Don't use markdown formatting (no **bold** or *italics*) - use plain text. LaTeX math formatting with single $ is fine. Remember to use single $ for math like $x^2 + 3x + 2$.`;

            const response = await aiService.generateResponse([
                { 
                    id: 1,
                    sender: "user", 
                    text: bobPrompt, 
                    timestamp: new Date().toISOString() 
                }
            ]);

            // Ensure Bob's response has proper @mention
            const validatedResponse = ensureProperMention(response, redirectTarget);

            const bobMessage: Message = {
                id: placeholderId,
                sender: "ai",
                agentId: bobAgent.id,
                text: validatedResponse,
                timestamp: new Date().toISOString(),
            };

            setMessages(prev => prev.map(msg => 
                msg.id === placeholderId ? bobMessage : msg
            ));
            removeTypingMessageId(placeholderId);
            onNewMessage(bobMessage);

            // Determine who should respond next based on Bob's redirect
            const addressedParticipant = parseAddressedParticipant(validatedResponse);
            
            // Trigger immediate agent response when Bob redirects to them
            if (addressedParticipant === 'Alice') {
                createManagedTimeout(async () => {
                    if (!cancelCurrentResponseRef.current) {
                        console.log("Bob redirected to Alice - triggering Alice response");
                        // Find Alice agent and trigger response
                        const aliceAgent = agents.find(agent => agent.id === "arithmetic");
                        if (aliceAgent) {
                            const placeholderId = getUniqueMessageId();
                            const placeholder: Message = {
                                id: placeholderId,
                                sender: "ai",
                                agentId: aliceAgent.id,
                                text: "...",
                                timestamp: new Date().toISOString(),
                            };
                            setMessages(prev => [...prev, placeholder]);
                            addTypingMessageId(placeholderId);
                            
                            try {
                                const alicePrompt = `${aliceAgent.systemPrompt}

Question: ${currentQuestion?.question || "No question available"}

Bob just asked you to respond. As Alice (a fellow student who understands concepts but makes arithmetic mistakes), respond by working on the math problem or sharing your thoughts. Use the RIGHT mathematical concepts but make arithmetic calculation errors. Be confident in your calculations even though they're wrong. Don't encourage or tutor - just act like a peer student. Keep response to 1 sentence only. Remember to use single $ for math like $x^2 + 3x + 2$ and don't acknowledge errors in your reasoning.`;

                                const response = await aiService.generateResponse([
                                    { 
                                        id: 1,
                                        sender: "user", 
                                        text: alicePrompt, 
                                        timestamp: new Date().toISOString() 
                                    }
                                ]);

                                const aliceMessage: Message = {
                                    id: placeholderId,
                                    sender: "ai",
                                    agentId: aliceAgent.id,
                                    text: response,
                                    timestamp: new Date().toISOString(),
                                };

                                setMessages(prev => prev.map(msg => 
                                    msg.id === placeholderId ? aliceMessage : msg
                                ));
                                removeTypingMessageId(placeholderId);
                                onNewMessage(aliceMessage);
                            } catch (error) {
                                console.error("Error generating Alice redirect response:", error);
                                removeTypingMessageId(placeholderId);
                                setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                            }
                        }
                    }
                }, 1500);
            } else if (addressedParticipant === 'Charlie') {
                createManagedTimeout(async () => {
                    if (!cancelCurrentResponseRef.current) {
                        console.log("Bob redirected to Charlie - triggering Charlie response");
                        // Find Charlie agent and trigger response
                        const charlieAgent = agents.find(agent => agent.id === "concept");
                        if (charlieAgent) {
                            const placeholderId = getUniqueMessageId();
                            const placeholder: Message = {
                                id: placeholderId,
                                sender: "ai",
                                agentId: charlieAgent.id,
                                text: "...",
                                timestamp: new Date().toISOString(),
                            };
                            setMessages(prev => [...prev, placeholder]);
                            addTypingMessageId(placeholderId);
                            
                            try {
                                const charliePrompt = `${charlieAgent.systemPrompt}

Question: ${currentQuestion?.question || "No question available"}

Bob just asked you to respond. As Charlie (a fellow student who's good at arithmetic but misunderstands concepts), respond by working on the math problem or sharing your thoughts. Use WRONG concepts or methods but make your arithmetic calculations correct. Be confident in your conceptually flawed approach. Don't encourage or tutor - just act like a peer student. Keep response to 1 sentence only. Remember to use single $ for math like $x^2 + 3x + 2$ and don't acknowledge errors in your reasoning.`;

                                const response = await aiService.generateResponse([
                                    { 
                                        id: 1,
                                        sender: "user", 
                                        text: charliePrompt, 
                                        timestamp: new Date().toISOString() 
                                    }
                                ]);

                                const charlieMessage: Message = {
                                    id: placeholderId,
                                    sender: "ai",
                                    agentId: charlieAgent.id,
                                    text: response,
                                    timestamp: new Date().toISOString(),
                                };

                                setMessages(prev => prev.map(msg => 
                                    msg.id === placeholderId ? charlieMessage : msg
                                ));
                                removeTypingMessageId(placeholderId);
                                onNewMessage(charlieMessage);
                            } catch (error) {
                                console.error("Error generating Charlie redirect response:", error);
                                removeTypingMessageId(placeholderId);
                                setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                            }
                        }
                    }
                }, 1500);
            }

        } catch (error) {
            console.error("Error generating Bob redirect response:", error);
            removeTypingMessageId(placeholderId);
            setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
        }
    }, [agents, messages, setMessages, onNewMessage, addTypingMessageId, removeTypingMessageId, currentQuestion, parseAddressedParticipant, createManagedTimeout, getUniqueMessageId, aiService]);

    // Alice's initial message (responds to user's answer)
    const aliceInitialMessage = useCallback(
        async (conversationHistory: Message[], isUserResponse: boolean = true) => {
            const aliceAgent = agents.find(agent => agent.id === "arithmetic");
            if (!aliceAgent) return null;

            // Check for cancellation before starting
            if (cancelCurrentResponseRef.current) {
                console.log("🚫 Alice initial message cancelled before starting");
                return null;
            }

            const placeholderId = getUniqueMessageId();
            const placeholder: Message = {
                id: placeholderId,
                sender: "ai",
                agentId: aliceAgent.id,
                text: "...",
                timestamp: new Date().toISOString(),
            };

            setMessages(prev => [...prev, placeholder]);
            addTypingMessageId(placeholderId);

            const userAnswer = conversationHistory[conversationHistory.length - 1];
            
            try {
                // Multi scenario specific Alice prompt
                const alicePrompt = `${aliceAgent.systemPrompt}

Question: ${currentQuestion?.question || "No question available"}

User's answer: "${userAnswer.text}"

As Alice (a fellow student who understands concepts but makes arithmetic mistakes), respond to the user's answer by working on the math problem yourself. Show your own solution approach with the RIGHT concept but make arithmetic calculation errors. Be confident in your calculations even though they're wrong. Don't encourage or praise - just work on the problem like a peer. Keep response to 1 sentence only. Remember to use single $ for math like $x^2 + 3x + 2$ and don't acknowledge errors in your reasoning.`;

                const response = await aiService.generateResponse([
                    { 
                        id: 1,
                        sender: "user", 
                        text: alicePrompt, 
                        timestamp: new Date().toISOString() 
                    }
                ]);

                // Check for cancellation before processing response
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Alice initial message cancelled before completion");
                    removeTypingMessageId(placeholderId);
                    setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    return null;
                }

                const aliceMessage: Message = {
                    id: placeholderId,
                    sender: "ai",
                    agentId: aliceAgent.id,
                    text: response,
                    timestamp: new Date().toISOString(),
                };

                setMessages(prev => prev.map(msg => 
                    msg.id === placeholderId ? aliceMessage : msg
                ));
                removeTypingMessageId(placeholderId);
                onNewMessage(aliceMessage);

                // Don't continue to Charlie here - let triggerSequentialAgentResponse handle the sequence
                // Don't call stopAgentResponsesForUserTurn here as it would cancel the sequence

                return aliceMessage;
            } catch (error) {
                console.error("Error generating Alice's initial message:", error);
                removeTypingMessageId(placeholderId);
                setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                return null;
            }
        },
        [agents, getUniqueMessageId, setMessages, addTypingMessageId, removeTypingMessageId, currentQuestion, onNewMessage, setIsQuestioningEnabled, stopAgentResponsesForUserTurn]
    );

    // Bob's follow-up feedback (provides feedback on agent response and asks new question)
    const bobFollowUpFeedback = useCallback(
        async (conversationHistory: Message[]) => {
            const bobAgent = agents.find(agent => agent.id === "bob");
            if (!bobAgent) return null;

            // Check for cancellation before starting
            if (cancelCurrentResponseRef.current) {
                console.log("🚫 Bob follow-up feedback cancelled before starting");
                return null;
            }

            const placeholderId = getUniqueMessageId();
            const placeholder: Message = {
                id: placeholderId,
                sender: "ai",
                agentId: bobAgent.id,
                text: "...",
                timestamp: new Date().toISOString(),
            };

            setMessages(prev => [...prev, placeholder]);
            addTypingMessageId(placeholderId);

            try {
                // Check for cancellation before generating prompt
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Bob follow-up feedback cancelled before prompt generation");
                    removeTypingMessageId(placeholderId);
                    setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    return null;
                }

                // Get recent conversation for context
                const recentMessages = conversationHistory.slice(-6).map(msg => {
                    if (msg.sender === 'user') {
                        return `User: ${msg.text}`;
                    } else if (msg.agentId === 'arithmetic') {
                        return `Alice: ${msg.text}`;
                    } else if (msg.agentId === 'concept') {
                        return `Charlie: ${msg.text}`;
                    } else if (msg.agentId === 'bob') {
                        return `Bob: ${msg.text}`;
                    } else {
                        return `${msg.agentId || 'Agent'}: ${msg.text}`;
                    }
                }).join('\n');

                // Get the most recent agent response to provide feedback on
                const lastAgentMessage = conversationHistory.slice().reverse().find(msg => 
                    msg.sender === 'ai' && (msg.agentId === 'arithmetic' || msg.agentId === 'concept')
                );
                const respondingAgent = lastAgentMessage?.agentId === 'arithmetic' ? 'Alice' : 'Charlie';

                // Randomly select who Bob should address next
                const nextParticipant = getRandomParticipant();

                const bobPrompt = `${bobAgent.systemPrompt}

Question: ${currentQuestion?.question || "No question available"}

This is a group discussion with three students: User, Alice, and Charlie. Here's the recent conversation:
${recentMessages}

As Bob the tutor, provide brief feedback on ${respondingAgent}'s recent response, then ask a follow-up question to keep the discussion going. Address your follow-up question to @${nextParticipant} specifically. Focus on helping students learn through guided questions. Don't use markdown formatting (no **bold** or *italics*) - use plain text. LaTeX math formatting with single $ is fine. Remember to use single $ for math like $x^2 + 3x + 2$.`;

                console.log("🎓 Bob generating follow-up feedback and question");

                // Final cancellation check before making AI call
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Bob follow-up feedback cancelled before AI call");
                    removeTypingMessageId(placeholderId);
                    setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    return null;
                }

                const response = await aiService.generateResponse([
                    { 
                        id: 1,
                        sender: "user", 
                        text: bobPrompt, 
                        timestamp: new Date().toISOString() 
                    }
                ]);

                // Check for cancellation immediately after AI response
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Bob follow-up feedback cancelled after AI response received");
                    removeTypingMessageId(placeholderId);
                    setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    return null;
                }

                // Ensure Bob's response has proper @mention
                const validatedResponse = ensureProperMention(response, nextParticipant);

                const bobMessage: Message = {
                    id: placeholderId,
                    sender: "ai",
                    agentId: bobAgent.id,
                    text: validatedResponse,
                    timestamp: new Date().toISOString(),
                };

                setMessages(prev => prev.map(msg => 
                    msg.id === placeholderId ? bobMessage : msg
                ));
                removeTypingMessageId(placeholderId);
                onNewMessage(bobMessage);

                // Final check for cancellation before determining next steps
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Bob follow-up feedback follow-up cancelled - user interrupted");
                    return null;
                }

                // Determine who should respond next based on Bob's follow-up question
                const addressedParticipant = parseAddressedParticipant(validatedResponse);
                console.log(`🎯 Bob's follow-up addressed: "${addressedParticipant}" in message: "${validatedResponse}"`);
                
                if (addressedParticipant === 'Alice') {
                    // Alice should respond after a brief delay
                    createManagedTimeout(async () => {
                        if (!cancelCurrentResponseRef.current) {
                            // Inline Alice generation to avoid circular dependency
                            const aliceAgent = agents.find(agent => agent.id === "arithmetic");
                            if (aliceAgent) {
                                const alicePlaceholderId = getUniqueMessageId();
                                const alicePlaceholder: Message = {
                                    id: alicePlaceholderId,
                                    sender: "ai",
                                    agentId: aliceAgent.id,
                                    text: "...",
                                    timestamp: new Date().toISOString(),
                                };

                                safeSetMessages(prev => [...prev, alicePlaceholder]);
                                safeAddTypingMessageId(alicePlaceholderId);

                                try {
                                    const alicePrompt = `${aliceAgent.systemPrompt}

Previous message: "${bobMessage.text}"

As Alice (a fellow student who understands concepts but makes arithmetic mistakes), respond by working on the math problem or sharing your own solution approach. Use the RIGHT mathematical concepts but make arithmetic calculation errors. Be confident in your work even though your calculations are wrong. Don't encourage or tutor - just act like a peer student. Keep response to 1 sentence only. Remember to use single $ for math like $x^2 + 3x + 2$ and don't acknowledge errors in your reasoning.`;

                                    const aliceResponse = await aiService.generateResponse([
                                        { 
                                            id: 1,
                                            sender: "user", 
                                            text: alicePrompt, 
                                            timestamp: new Date().toISOString() 
                                        }
                                    ]);

                                    if (!cancelCurrentResponseRef.current) {
                                        const aliceMessage: Message = {
                                            id: alicePlaceholderId,
                                            sender: "ai",
                                            agentId: aliceAgent.id,
                                            text: aliceResponse,
                                            timestamp: new Date().toISOString(),
                                        };

                                        safeSetMessages(prev => prev.map(msg => 
                                            msg.id === alicePlaceholderId ? aliceMessage : msg
                                        ));
                                        safeRemoveTypingMessageId(alicePlaceholderId);
                                        onNewMessage(aliceMessage);
                                        
                                        // Enable user input after Alice responds to keep flow natural
                                        safeSetIsQuestioningEnabled(true);
                                    }
                                } catch (error) {
                                    console.error("Error generating Alice follow-up response:", error);
                                    safeRemoveTypingMessageId(alicePlaceholderId);
                                    safeSetMessages(prev => prev.filter(msg => msg.id !== alicePlaceholderId));
                                }
                            }
                        }
                    }, 1500);
                } else if (addressedParticipant === 'Charlie') {
                    // Charlie should respond after a brief delay
                    createManagedTimeout(async () => {
                        if (!cancelCurrentResponseRef.current) {
                            // Inline Charlie generation to avoid circular dependency
                            const charlieAgent = agents.find(agent => agent.id === "concept");
                            if (charlieAgent) {
                                const charliePlaceholderId = getUniqueMessageId();
                                const charliePlaceholder: Message = {
                                    id: charliePlaceholderId,
                                    sender: "ai",
                                    agentId: charlieAgent.id,
                                    text: "...",
                                    timestamp: new Date().toISOString(),
                                };

                                safeSetMessages(prev => [...prev, charliePlaceholder]);
                                safeAddTypingMessageId(charliePlaceholderId);

                                try {
                                    const charliePrompt = `${charlieAgent.systemPrompt}

Previous message: "${bobMessage.text}"  

As Charlie (a fellow student who is good at arithmetic but makes conceptual errors), respond by working on the math problem or sharing your solution approach. Use CORRECT arithmetic calculations but apply WRONG mathematical concepts or make conceptual mistakes. Be confident in your approach even though your reasoning is flawed. Don't encourage or tutor - just act like a peer student. Keep response to 1 sentence only. Remember to use single $ for math like $x^2 + 3x + 2$ and don't acknowledge errors in your reasoning.`;

                                    const charlieResponse = await aiService.generateResponse([
                                        { 
                                            id: 1,
                                            sender: "user", 
                                            text: charliePrompt, 
                                            timestamp: new Date().toISOString() 
                                        }
                                    ]);

                                    if (!cancelCurrentResponseRef.current) {
                                        const charlieMessage: Message = {
                                            id: charliePlaceholderId,
                                            sender: "ai",
                                            agentId: charlieAgent.id,
                                            text: charlieResponse,
                                            timestamp: new Date().toISOString(),
                                        };

                                        safeSetMessages(prev => prev.map(msg => 
                                            msg.id === charliePlaceholderId ? charlieMessage : msg
                                        ));
                                        safeRemoveTypingMessageId(charliePlaceholderId);
                                        onNewMessage(charlieMessage);
                                        
                                        // Enable user input after Charlie responds to keep flow natural
                                        safeSetIsQuestioningEnabled(true);
                                    }
                                } catch (error) {
                                    console.error("Error generating Charlie follow-up response:", error);
                                    safeRemoveTypingMessageId(charliePlaceholderId);
                                    safeSetMessages(prev => prev.filter(msg => msg.id !== charliePlaceholderId));
                                }
                            }
                        }
                    }, 1500);
                } else {
                    // User was addressed - enable input
                    safeSetIsQuestioningEnabled(true);
                }

                return bobMessage;

            } catch (error) {
                console.error("Error generating Bob's follow-up feedback:", error);
                removeTypingMessageId(placeholderId);
                setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                return null;
            }
        },
        [agents, getUniqueMessageId, setMessages, addTypingMessageId, removeTypingMessageId, currentQuestion, onNewMessage, parseAddressedParticipant, createManagedTimeout, safeSetIsQuestioningEnabled, safeSetMessages, safeAddTypingMessageId, safeRemoveTypingMessageId, getRandomParticipant]
    );

    // Alice's generate message (responds to previous message)
    const generateAliceMessage = useCallback(
        async (previousMessage: Message) => {
            if (isUnmountedRef.current) return null;
            
            // Check for cancellation before starting
            if (cancelCurrentResponseRef.current) {
                console.log("🚫 Alice message generation cancelled before starting");
                return null;
            }
            
            const aliceAgent = agents.find(agent => agent.id === "arithmetic");
            if (!aliceAgent) return null;

            const placeholderId = getUniqueMessageId();
            const placeholder: Message = {
                id: placeholderId,
                sender: "ai",
                agentId: aliceAgent.id,
                text: "...",
                timestamp: new Date().toISOString(),
            };

            safeSetMessages(prev => [...prev, placeholder]);
            safeAddTypingMessageId(placeholderId);

            try {
                // Multi scenario specific Alice prompt
                const alicePrompt = `${aliceAgent.systemPrompt}

Previous message: "${previousMessage.text}"

As Alice (a fellow student who understands concepts but makes arithmetic mistakes), respond by working on the math problem or sharing your own solution approach. Use the RIGHT mathematical concepts but make arithmetic calculation errors. Be confident in your work even though your calculations are wrong. Don't encourage or tutor - just act like a peer student. Keep response to 1 sentence only. Remember to use single $ for math like $x^2 + 3x + 2$ and don't acknowledge errors in your reasoning.`;

                const response = await aiService.generateResponse([
                    { 
                        id: 1,
                        sender: "user", 
                        text: alicePrompt, 
                        timestamp: new Date().toISOString() 
                    }
                ]);

                // Check for cancellation before processing response
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Alice message generation cancelled before completion");
                    safeRemoveTypingMessageId(placeholderId);
                    safeSetMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    return null;
                }

                const aliceMessage: Message = {
                    id: placeholderId,
                    sender: "ai",
                    agentId: aliceAgent.id,
                    text: response,
                    timestamp: new Date().toISOString(),
                };

                safeSetMessages(prev => prev.map(msg => 
                    msg.id === placeholderId ? aliceMessage : msg
                ));
                safeRemoveTypingMessageId(placeholderId);
                onNewMessage(aliceMessage);

                // After Alice responds to Bob's question, trigger Bob's follow-up feedback
                // Schedule Bob's follow-up after a brief delay to maintain natural conversation flow
                createManagedTimeout(async () => {
                    if (!cancelCurrentResponseRef.current) {
                        // Get current messages state and build conversation history
                        safeSetMessages(currentMessages => {
                            const updatedHistory = [...currentMessages];
                            // Trigger Bob's follow-up in the next tick to ensure state is updated
                            setTimeout(async () => {
                                if (!cancelCurrentResponseRef.current) {
                                    console.log("🔄 Triggering Bob's follow-up after Alice's response");
                                    await bobFollowUpFeedback(updatedHistory);
                                }
                            }, 100);
                            return currentMessages; // Don't change messages, just use for history
                        });
                    }
                }, 2000); // 2 second delay for natural flow

                return aliceMessage;
            } catch (error) {
                console.error("Error generating Alice message:", error);
                safeRemoveTypingMessageId(placeholderId);
                safeSetMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                return null;
            }
        },
        [agents, getUniqueMessageId, safeSetMessages, safeAddTypingMessageId, safeRemoveTypingMessageId, onNewMessage, safeSetIsQuestioningEnabled, createManagedTimeout, stopAgentResponsesForUserTurn, messages, bobFollowUpFeedback]
    );

    // Charlie's initial message (responds to user's and Alice's answers)
    const charlieInitialMessage = useCallback(
        async (conversationHistory: Message[], isUserResponse: boolean = true) => {
            const charlieAgent = agents.find(agent => agent.id === "concept");
            if (!charlieAgent) return null;

            // Check for cancellation before starting
            if (cancelCurrentResponseRef.current) {
                console.log("🚫 Charlie initial message cancelled before starting");
                return null;
            }

            const placeholderId = getUniqueMessageId();
            const placeholder: Message = {
                id: placeholderId,
                sender: "ai",
                agentId: charlieAgent.id,
                text: "...",
                timestamp: new Date().toISOString(),
            };

            setMessages(prev => [...prev, placeholder]);
            addTypingMessageId(placeholderId);

            try {
                // Multi scenario specific Charlie prompt
                const recentMessages = conversationHistory.slice(-3).map(msg => 
                    `${msg.sender === 'user' ? 'User' : (msg.agentId || 'Agent')}: ${msg.text}`
                ).join('\n');

                const charliePrompt = `${charlieAgent.systemPrompt}

Question: ${currentQuestion?.question || "No question available"}

Recent conversation:
${recentMessages}

As Charlie (a fellow student who's good at arithmetic but misunderstands concepts), respond by working on the math problem yourself. Show your own solution approach using WRONG concepts or methods but with correct arithmetic calculations. Be confident in your approach even though it's conceptually wrong. Don't encourage or tutor - just act like a peer student. Keep response to 1 sentence only. Remember to use single $ for math like $x^2 + 3x + 2$ and don't acknowledge errors in your reasoning.`;

                const response = await aiService.generateResponse([
                    { 
                        id: 1,
                        sender: "user", 
                        text: charliePrompt, 
                        timestamp: new Date().toISOString() 
                    }
                ]);

                // Check for cancellation before processing response
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Charlie initial message cancelled before completion");
                    removeTypingMessageId(placeholderId);
                    setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    return null;
                }

                const charlieMessage: Message = {
                    id: placeholderId,
                    sender: "ai",
                    agentId: charlieAgent.id,
                    text: response,
                    timestamp: new Date().toISOString(),
                };

                setMessages(prev => prev.map(msg => 
                    msg.id === placeholderId ? charlieMessage : msg
                ));
                removeTypingMessageId(placeholderId);
                onNewMessage(charlieMessage);

                // Don't continue to Bob here - let triggerSequentialAgentResponse handle the sequence
                // Don't call stopAgentResponsesForUserTurn here as it would cancel the sequence

                return charlieMessage;
            } catch (error) {
                console.error("Error generating Charlie's initial message:", error);
                removeTypingMessageId(placeholderId);
                setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                return null;
            }
        },
        [agents, getUniqueMessageId, setMessages, addTypingMessageId, removeTypingMessageId, currentQuestion, onNewMessage, setIsQuestioningEnabled, stopAgentResponsesForUserTurn]
    );

    // Charlie's generate message (responds to previous message)
    const generateCharlieMessage = useCallback(
        async (previousMessage: Message) => {
            console.log("🔥 generateCharlieMessage called with message:", previousMessage.text);
            
            if (isUnmountedRef.current) return null;
            
            // Check for cancellation before starting
            if (cancelCurrentResponseRef.current) {
                console.log("🚫 Charlie message generation cancelled before starting");
                return null;
            }
            
            const charlieAgent = agents.find(agent => agent.id === "concept");
            if (!charlieAgent) {
                console.log("🚫 Charlie agent not found");
                return null;
            }

            console.log("🔥 Charlie is generating a response...");
            const placeholderId = getUniqueMessageId();
            const placeholder: Message = {
                id: placeholderId,
                sender: "ai",
                agentId: charlieAgent.id,
                text: "...",
                timestamp: new Date().toISOString(),
            };

            safeSetMessages(prev => [...prev, placeholder]);
            safeAddTypingMessageId(placeholderId);

            try {
                // Check for cancellation before generating prompt
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Charlie message generation cancelled before prompt generation");
                    safeRemoveTypingMessageId(placeholderId);
                    safeSetMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    return null;
                }

                // Multi scenario specific Charlie prompt
                const charliePrompt = `${charlieAgent.systemPrompt}

Previous message: "${previousMessage.text}"

As Charlie (a fellow student who's good at arithmetic but misunderstands concepts), respond by working on the math problem or sharing your own solution approach. Use WRONG concepts or methods but make your arithmetic calculations correct. Be confident in your conceptually flawed approach. Don't encourage or tutor - just act like a peer student. Keep response to 1 sentence only. Remember to use single $ for math like $x^2 + 3x + 2$ and don't acknowledge errors in your reasoning.`;

                // Final cancellation check before making AI call
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Charlie message generation cancelled before AI call");
                    safeRemoveTypingMessageId(placeholderId);
                    safeSetMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    return null;
                }

                console.log("🔥 Charlie making AI call...");
                const response = await aiService.generateResponse([
                    { 
                        id: 1,
                        sender: "user", 
                        text: charliePrompt, 
                        timestamp: new Date().toISOString() 
                    }
                ]);

                // Check for cancellation immediately after AI response
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Charlie message generation cancelled after AI response received");
                    safeRemoveTypingMessageId(placeholderId);
                    safeSetMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    return null;
                }

                console.log("🔥 Charlie received AI response:", response);
                const charlieMessage: Message = {
                    id: placeholderId,
                    sender: "ai",
                    agentId: charlieAgent.id,
                    text: response,
                    timestamp: new Date().toISOString(),
                };

                safeSetMessages(prev => prev.map(msg => 
                    msg.id === placeholderId ? charlieMessage : msg
                ));
                safeRemoveTypingMessageId(placeholderId);
                onNewMessage(charlieMessage);

                // After Charlie responds to Bob's question, trigger Bob's follow-up feedback
                // Schedule Bob's follow-up after a brief delay to maintain natural conversation flow
                createManagedTimeout(async () => {
                    if (!cancelCurrentResponseRef.current) {
                        // Get current messages state and build conversation history
                        safeSetMessages(currentMessages => {
                            const updatedHistory = [...currentMessages];
                            // Trigger Bob's follow-up in the next tick to ensure state is updated
                            setTimeout(async () => {
                                if (!cancelCurrentResponseRef.current) {
                                    console.log("🔄 Triggering Bob's follow-up after Charlie's response");
                                    await bobFollowUpFeedback(updatedHistory);
                                }
                            }, 100);
                            return currentMessages; // Don't change messages, just use for history
                        });
                    }
                }, 2000); // 2 second delay for natural flow
                console.log("🔥 Charlie response completed successfully");

                return charlieMessage;
            } catch (error) {
                console.error("Error generating Charlie message:", error);
                safeRemoveTypingMessageId(placeholderId);
                safeSetMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                return null;
            }
        },
        [agents, getUniqueMessageId, safeSetMessages, safeAddTypingMessageId, safeRemoveTypingMessageId, onNewMessage, safeSetIsQuestioningEnabled, createManagedTimeout, stopAgentResponsesForUserTurn, messages, bobFollowUpFeedback]
    );

    // Bob's initial message (provides feedback and prompts next participant)
    const bobInitialMessage = useCallback(
        async (conversationHistory: Message[]) => {
            const bobAgent = agents.find(agent => agent.id === "bob");
            if (!bobAgent) return null;

            // Check for cancellation before starting
            if (cancelCurrentResponseRef.current) {
                console.log("🚫 Bob initial message cancelled before starting");
                return null;
            }

            const placeholderId = getUniqueMessageId();
            const placeholder: Message = {
                id: placeholderId,
                sender: "ai",
                agentId: bobAgent.id,
                text: "...",
                timestamp: new Date().toISOString(),
            };

            setMessages(prev => [...prev, placeholder]);
            addTypingMessageId(placeholderId);

            try {
                // Check for cancellation before generating prompt
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Bob initial message cancelled before prompt generation");
                    removeTypingMessageId(placeholderId);
                    setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    return null;
                }

                // Multi scenario specific Bob prompt
                const recentMessages = conversationHistory.slice(-4).map(msg => {
                    if (msg.sender === 'user') {
                        return `User: ${msg.text}`;
                    } else if (msg.agentId === 'arithmetic') {
                        return `Alice: ${msg.text}`;
                    } else if (msg.agentId === 'concept') {
                        return `Charlie: ${msg.text}`;
                    } else {
                        return `${msg.agentId || 'Agent'}: ${msg.text}`;
                    }
                }).join('\n');

                // Find the user's original final answer from the conversation history
                const userFinalAnswer = conversationHistory.find(msg => msg.sender === 'user')?.text || "No answer provided";
                
                // Debug logging for Bob's context
                console.log("🔍 Bob Context Debug:");
                console.log("- User's final answer:", userFinalAnswer);
                console.log("- Current question:", currentQuestion?.question || "No question");
                console.log("- Conversation history length:", conversationHistory.length);

                // Randomly select who Bob should address in his follow-up question
                const nextParticipant = getRandomParticipant();

                const bobPrompt = `${bobAgent.systemPrompt}

Question: ${currentQuestion?.question || "No question available"}

The user's final answer was: "${userFinalAnswer}"

This is a group discussion with three students: User, Alice, and Charlie. Here's the recent conversation:
${recentMessages}

As Bob the tutor, carefully evaluate each student's work:
- The User provided their final answer: "${userFinalAnswer}"
- Alice tends to make arithmetic mistakes but understands concepts
- Charlie makes conceptual errors but is good at arithmetic

Before concluding if any answer is right or wrong, work through the problem yourself to verify the correct solution. Give separate, specific feedback to each participant using @User, @Alice, or @Charlie to address them directly. Be encouraging and focus on their mathematical reasoning. Don't use markdown formatting (no **bold** or *italics*) - use plain text. LaTeX math formatting with single $ is fine. After your feedback, ask ONE follow-up question and address it specifically to @${nextParticipant}. Remember to use single $ for math like $x^2 + 3x + 2$.`;

                // Final cancellation check before making AI call
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Bob initial message cancelled before AI call");
                    removeTypingMessageId(placeholderId);
                    setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    return null;
                }

                const response = await aiService.generateResponse([
                    { 
                        id: 1,
                        sender: "user", 
                        text: bobPrompt, 
                        timestamp: new Date().toISOString() 
                    }
                ]);

                // Check for cancellation immediately after AI response
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Bob initial message cancelled after AI response received");
                    removeTypingMessageId(placeholderId);
                    setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    return null;
                }

                // Ensure Bob's response has proper @mention
                const validatedResponse = ensureProperMention(response, nextParticipant);

                const bobMessage: Message = {
                    id: placeholderId,
                    sender: "ai",
                    agentId: bobAgent.id,
                    text: validatedResponse,
                    timestamp: new Date().toISOString(),
                };

                setMessages(prev => prev.map(msg => 
                    msg.id === placeholderId ? bobMessage : msg
                ));
                removeTypingMessageId(placeholderId);
                onNewMessage(bobMessage);

                // Final check for cancellation before determining next steps
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Bob initial message follow-up cancelled - user interrupted");
                    return null;
                }

                // Determine who should respond next based on Bob's message
                const addressedParticipant = parseAddressedParticipant(validatedResponse);
                console.log(`🎯 Bob addressed: "${addressedParticipant}" in message: "${validatedResponse}"`);
                
                if (addressedParticipant === 'Alice') {
                    console.log("🍎 Alice should respond to Bob's question");
                    // Alice should respond immediately when called upon
                    createManagedTimeout(() => {
                        if (!cancelCurrentResponseRef.current) {
                            generateAliceMessage(bobMessage);
                        }
                    }, 1500);
                    setIsQuestioningEnabled(false); // Disable user input while Alice responds
                    return bobMessage;
                } else if (addressedParticipant === 'Charlie') {
                    console.log("🔥 Charlie should respond to Bob's question");
                    // Charlie should respond immediately when called upon
                    createManagedTimeout(() => {
                        if (!cancelCurrentResponseRef.current) {
                            console.log("🔥 Triggering Charlie's response now");
                            generateCharlieMessage(bobMessage);
                        }
                    }, 1500);
                    setIsQuestioningEnabled(false); // Disable user input while Charlie responds
                    return bobMessage;
                } else if (addressedParticipant === 'User') {
                    console.log("👤 User was addressed by Bob");
                    // User was addressed - enable input
                    setIsQuestioningEnabled(true);
                    return bobMessage;
                }

                // If no specific participant was addressed, treat as general discussion
                console.log("💬 Bob made a general comment - no specific participant addressed");
                setIsQuestioningEnabled(true);

                return bobMessage;
            } catch (error) {
                console.error("Error generating Bob's initial message:", error);
                removeTypingMessageId(placeholderId);
                setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                return null;
            }
        },
        [agents, getUniqueMessageId, setMessages, addTypingMessageId, removeTypingMessageId, currentQuestion, onNewMessage, generateAliceMessage, generateCharlieMessage, stopAgentResponsesForUserTurn, getRandomParticipant]
    );

    // Bob's generate message (responds to previous TWO messages for context)
    const generateBobMessage = useCallback(
        async (conversationHistory: Message[], autoTriggerNext: boolean = true) => {
            if (isUnmountedRef.current) return null;
            
            const bobAgent = agents.find(agent => agent.id === "bob");
            if (!bobAgent) return null;

            const placeholderId = getUniqueMessageId();
            const placeholder: Message = {
                id: placeholderId,
                sender: "ai",
                agentId: bobAgent.id,
                text: "...",
                timestamp: new Date().toISOString(),
            };

            safeSetMessages(prev => [...prev, placeholder]);
            safeAddTypingMessageId(placeholderId);

            try {
                // Check for cancellation before generating prompt
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Bob message generation cancelled before prompt generation");
                    safeRemoveTypingMessageId(placeholderId);
                    safeSetMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    return null;
                }

                // Multi scenario specific Bob prompt
                const recentMessages = conversationHistory.slice(-3).map(msg => {
                    if (msg.sender === 'user') {
                        return `User: ${msg.text}`;
                    } else if (msg.agentId === 'arithmetic') {
                        return `Alice: ${msg.text}`;
                    } else if (msg.agentId === 'concept') {
                        return `Charlie: ${msg.text}`;
                    } else {
                        return `${msg.agentId || 'Agent'}: ${msg.text}`;
                    }
                }).join('\n');

                // Randomly select who Bob should address in his follow-up question
                const nextParticipant = getRandomParticipant();

                const bobPrompt = `${bobAgent.systemPrompt}

Question: ${currentQuestion?.question || "No question available"}

This is a group discussion with three students: User, Alice, and Charlie. Here's the recent conversation:
${recentMessages}

The user has just sent a message. As Bob the tutor, first acknowledge what the user said - their answer, approach, or reasoning. Then provide brief guidance and ask a follow-up question to keep the group discussion going. Address your follow-up question specifically to @${nextParticipant} to maintain the collaborative learning environment. Don't use markdown formatting (no **bold** or *italics*) - use plain text. LaTeX math formatting with single $ is fine. Remember to use single $ for math like $x^2 + 3x + 2$.`;

                // Final cancellation check before making AI call
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Bob message generation cancelled before AI call");
                    safeRemoveTypingMessageId(placeholderId);
                    safeSetMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    return null;
                }

                const response = await aiService.generateResponse([
                    { 
                        id: 1,
                        sender: "user", 
                        text: bobPrompt, 
                        timestamp: new Date().toISOString() 
                    }
                ]);

                // Check for cancellation immediately after AI response
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Bob message generation cancelled after AI response received");
                    safeRemoveTypingMessageId(placeholderId);
                    safeSetMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    return null;
                }

                // Ensure Bob's response has proper @mention
                const validatedResponse = ensureProperMention(response, nextParticipant);

                const bobMessage: Message = {
                    id: placeholderId,
                    sender: "ai",
                    agentId: bobAgent.id,
                    text: validatedResponse,
                    timestamp: new Date().toISOString(),
                };

                safeSetMessages(prev => prev.map(msg => 
                    msg.id === placeholderId ? bobMessage : msg
                ));
                safeRemoveTypingMessageId(placeholderId);
                onNewMessage(bobMessage);

                // Final check for cancellation before any follow-up logic
                if (cancelCurrentResponseRef.current) {
                    console.log("🚫 Bob message follow-up cancelled - user interrupted");
                    return null;
                }

                // Check if Bob addressed any specific agent in his response
                const addressedParticipant = parseAddressedParticipant(validatedResponse);
                
                if (addressedParticipant === 'Alice') {
                    // Bob is asking Alice to respond
                    console.log(`Bob addressed Alice - triggering Alice response`);
                    createManagedTimeout(async () => {
                        if (!cancelCurrentResponseRef.current) {
                            await generateAliceMessage(bobMessage);
                        }
                    }, 1500);
                } else if (addressedParticipant === 'Charlie') {
                    // Bob is asking Charlie to respond
                    console.log(`Bob addressed Charlie - triggering Charlie response`);
                    createManagedTimeout(async () => {
                        if (!cancelCurrentResponseRef.current) {
                            await generateCharlieMessage(bobMessage);
                        }
                    }, 1500);
                } else {
                    // Bob is addressing the user or general discussion
                }

                return bobMessage;
            } catch (error) {
                console.error("Error generating Bob message:", error);
                safeRemoveTypingMessageId(placeholderId);
                safeSetMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                return null;
            }
        },
        [agents, getUniqueMessageId, safeSetMessages, safeAddTypingMessageId, safeRemoveTypingMessageId, currentQuestion, onNewMessage, generateAliceMessage, generateCharlieMessage, messages, createManagedTimeout, parseAddressedParticipant, getRandomParticipant]
    );

    // Simplified sequential agent response function
    const triggerSequentialAgentResponse = useCallback(
        async (userMessage: Message, isIntervention = false) => {
            if (agentResponseInProgressRef.current) {
                console.log("🚫 Agent response already in progress, skipping");
                return;
            }
            
            agentResponseInProgressRef.current = true;
            
            try {
                // Multi scenario: Alice → Charlie → Bob sequence (exact same as original Chat.tsx)
                const contextualMessage = agentContextMessage || userMessage;
                const conversationHistory = [contextualMessage];
                const isUserResponse = !isIntervention;
                
                console.log("Multi scenario: Generating Alice's initial response...");
                const aliceMessage = await aliceInitialMessage(conversationHistory, isUserResponse);
                if (!aliceMessage || cancelCurrentResponseRef.current) return;
                conversationHistory.push(aliceMessage);

                // Wait a bit before Charlie responds
                try {
                    await cancellableDelay(1500);
                } catch {
                    console.log("Multi scenario: Delay cancelled, stopping sequence");
                    return;
                }
                if (cancelCurrentResponseRef.current) return;

                console.log("Multi scenario: Generating Charlie's initial response...");
                const charlieMessage = await charlieInitialMessage(conversationHistory, isUserResponse);
                if (!charlieMessage || cancelCurrentResponseRef.current) return;
                conversationHistory.push(charlieMessage);

                // Wait a bit before Bob responds
                try {
                    await cancellableDelay(1500);
                } catch {
                    console.log("Multi scenario: Delay cancelled, stopping sequence");
                    return;
                }
                if (cancelCurrentResponseRef.current) return;

                console.log("Multi scenario: Generating Bob's initial response...");
                const bobMessage = await bobInitialMessage(conversationHistory);
                
                // Check if Bob's message was cancelled
                if (!bobMessage || cancelCurrentResponseRef.current) {
                    console.log("Multi scenario: Bob's initial response was cancelled");
                    return;
                }
            } catch (error) {
                console.error("Error in triggerSequentialAgentResponse:", error);
            } finally {
                agentResponseInProgressRef.current = false;
                setIsQuestioningEnabled(true);
            }
        },
        [aliceInitialMessage, charlieInitialMessage, bobInitialMessage, setIsQuestioningEnabled, messages, agentContextMessage, agents, isUserRespondingToQuestion, cancellableDelay]
    );

    // Handle user messages - multi scenario logic
    const handleUserMessage = useCallback(
        async (userMessage: Message) => {
            // Reset cancellation flag for new response sequence
            cancelCurrentResponseRef.current = false;
            
            // Set agent response in progress flag
            agentResponseInProgressRef.current = true;
            
            try {
                // Add user message to conversation first
                setMessages(prev => [...prev, userMessage]);
                onNewMessage(userMessage);
                setIsQuestioningEnabled(false);
                
                // In multi scenario, any user message is treated as an interruption/reset
                // Bob should respond directly to understand and guide the user
                console.log("User message received, Bob responding to interruption/input");
                await generateBobMessage([...messages, userMessage], false); // Don't auto-trigger next
                
            } catch (error) {
                console.error("Error handling user message:", error);
            } finally {
                agentResponseInProgressRef.current = false;
                setIsQuestioningEnabled(true);
            }
        },
        [generateBobMessage, setMessages, onNewMessage, setIsQuestioningEnabled, messages]
    );

    // Effect to trigger initial agent responses after user submission (one-time only)
    useEffect(() => {
        if (triggerInitialResponse && initialMessages.length > 0 && agents.length > 0 && !hasInitialResponseStarted.current) {
            console.log("🚀 Triggering initial agent response for multi scenario");
            hasInitialResponseStarted.current = true;
            setIsQuestioningEnabled(false);
            
            // Add a small delay to ensure UI is ready
            const timer = setTimeout(() => {
                triggerSequentialAgentResponse(initialMessages[initialMessages.length - 1]);
            }, 500);
            
            return () => clearTimeout(timer);
        }
    }, [triggerInitialResponse, initialMessages, agents, setIsQuestioningEnabled, triggerSequentialAgentResponse]);

    const handleSendMessage = useCallback(() => {
        // Only validate that input is not empty - user can always send messages
        if (!input.trim()) {
            safeSetTooltipMessage("Please enter a message");
            safeSetShowTooltip(true);
            createManagedTimeout(() => safeSetShowTooltip(false), 2000);
            return;
        }

        const messageText = input.trim();
        setInput("");

        // Cancel any ongoing agent responses since user is interrupting/resetting the flow
        console.log("User sending message - cancelling all ongoing responses and resetting flow");
        cancelOngoingResponses();

        const userMessage: Message = {
            id: getUniqueMessageId(),
            sender: "user",
            text: messageText,
            timestamp: new Date().toISOString(),
        };

        handleUserMessage(userMessage);
    }, [input, handleUserMessage, safeSetTooltipMessage, safeSetShowTooltip, createManagedTimeout, cancelOngoingResponses]);

    const getAgentInfo = (agentId: string | null | undefined) => {
        if (!agentId) return { name: "User (You)", avatar: "user_avatar.svg" };
        const agent = agents.find((a) => a.id === agentId);
        return {
            name: agent?.name || "Bot",
            avatar: agent?.avatar || "tutor_avatar.svg",
        };
    };

    return (
        <div className="chat-container flex-1 flex flex-col h-full overflow-hidden">
            <div
                ref={chatContainerRef}
                className="flex-1 bg-black bg-opacity-20 rounded-md overflow-y-auto p-2 chat-messages scrollbar"
            >
                {messages.map((msg) => {
                    const agentInfo = getAgentInfo(msg.agentId);
                    return (
                        <div
                            key={msg.id}
                            className={`mb-3 flex items-end ${
                                msg.sender === "user"
                                    ? "justify-end"
                                    : "justify-start"
                            }`}
                        >
                            {msg.sender !== "user" && (
                                <div className="mr-2 flex-shrink-0">
                                    <Image
                                        src={`/${agentInfo.avatar}`}
                                        alt={agentInfo.name}
                                        width={40}
                                        height={40}
                                        className="rounded-full border-2 border-white"
                                    />
                                </div>
                            )}
                            <div
                                className={`max-w-[85%] rounded-lg p-3 chat-message-bubble ${
                                    msg.sender === "user"
                                        ? "bg-blue-600 text-white"
                                        : "bg-gray-800 text-white"
                                }`}
                            >
                                <div className="text-sm text-gray-400 mb-1 font-bold">
                                    {agentInfo.name}
                                </div>
                                {typingMessageIds.includes(msg.id) ? (
                                    <TypewriterTextWrapper
                                        messageId={msg.id}
                                        text={formatMessageForDisplay(
                                            msg.text || ""
                                        )}
                                        speed={10}
                                        onTypingComplete={removeTypingMessageId}
                                        skip={false}
                                        formatMath={true}
                                    />
                                ) : (
                                    <MessageWithHighlights
                                        text={msg.text || ""}
                                    />
                                )}
                            </div>
                            {msg.sender === "user" && (
                                <div className="ml-2 flex-shrink-0">
                                    <Image
                                        src="/user.png"
                                        alt="User"
                                        width={40}
                                        height={40}
                                        className="rounded-full border-2 border-white"
                                    />
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
            <div className="relative">
                {/* Tooltip */}
                {showTooltip && (
                    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-800 text-white text-sm rounded-lg shadow-lg border border-gray-600 whitespace-nowrap z-50 animate-fade-in">
                        {tooltipMessage}
                        <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-800"></div>
                    </div>
                )}
                <div className="mt-3 flex items-start gap-2 chat-input">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                        placeholder={
                            "Type your message..."
                        }
                        className="flex-1 bg-white bg-opacity-10 border border-gray-700 rounded-md p-3 text-white resize-none h-16"
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={!input.trim()}
                        className="px-5 py-3 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
};

export default MultiScenarioChat;
