import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Message } from "@/utils/types";
import { Agent } from "@/lib/agents";
import { aiService } from "@/services/AI";
import TypewriterTextWrapper from "./TypewriterTextWrapper";
import { formatMessageForDisplay } from "@/lib/utils";
import RenderMathExpression from "./RenderMathExpression";
import MessageWithHighlights from "./MessageWithHighlights";

interface GroupScenarioChatProps {
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

const GroupScenarioChat: React.FC<GroupScenarioChatProps> = ({
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
    const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const agentResponseInProgressRef = useRef(false); // Prevent multiple simultaneous responses
    const cancelCurrentResponseRef = useRef(false); // Signal to cancel ongoing agent responses
    const hasInitialResponseStarted = useRef(false); // Track if initial response sequence has started
    const nextMessageIdRef = useRef(
        Math.max(...initialMessages.map((m) => m.id), 0) + 1
    );
    const isUnmountedRef = useRef(false); // Track if component is unmounted
    const pendingTimeoutsRef = useRef<Set<NodeJS.Timeout>>(new Set()); // Track all timeouts for cleanup

    // Cleanup function to stop all ongoing operations
    const cleanup = useCallback(() => {
        console.log("🧹 GroupScenarioChat component cleanup initiated");
        isUnmountedRef.current = true;
        agentResponseInProgressRef.current = false;
        
        if (inactivityTimeoutRef.current) {
            clearTimeout(inactivityTimeoutRef.current);
            inactivityTimeoutRef.current = null;
        }
        
        // Clear all pending timeouts
        pendingTimeoutsRef.current.forEach(timeout => {
            clearTimeout(timeout);
        });
        pendingTimeoutsRef.current.clear();
        
        // Hide any active tooltips
        setShowTooltip(false);
        
        console.log("✅ GroupScenarioChat component cleanup completed");
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
            console.log("⚠️ Attempted to create timeout on unmounted GroupScenarioChat component");
            return setTimeout(() => {}, 0); // Return dummy timeout
        }
        
        const timeout = setTimeout(() => {
            if (!isUnmountedRef.current) {
                pendingTimeoutsRef.current.delete(timeout);
                callback();
            }
        }, delay);
        
        pendingTimeoutsRef.current.add(timeout);
        return timeout;
    }, []);

    // Helper function for cancellable delays in async flows
    const cancellableDelay = useCallback((ms: number): Promise<void> => {
        return new Promise((resolve) => {
            createManagedTimeout(() => {
                if (!cancelCurrentResponseRef.current && !isUnmountedRef.current) {
                    resolve();
                }
            }, ms);
        });
    }, [createManagedTimeout]);

    // Helper function to parse who was addressed in a message
    const parseAddressedParticipant = useCallback((message: string): string => {
        // Check case-insensitively for @mentions
        if (message.includes('@User') || message.includes('@user')) return 'User';
        if (message.includes('@Alice') || message.includes('@alice')) return 'Alice';
        if (message.includes('@Charlie') || message.includes('@charlie')) return 'Charlie';
        return 'Unknown';
    }, []);

    // Helper function to randomly select first responder (Alice or Charlie)
    const getRandomFirstResponder = useCallback((): 'Alice' | 'Charlie' => {
        const responders: ('Alice' | 'Charlie')[] = ['Alice', 'Charlie'];
        const randomIndex = Math.floor(Math.random() * responders.length);
        const selected = responders[randomIndex];
        console.log(`🎲 Randomly selected first responder: ${selected}`);
        return selected;
    }, []);

    // Helper function to randomly select next participant (excluding current agent)
    const getRandomNextParticipant = useCallback((excludeAgent: string): 'User' | 'Alice' | 'Charlie' => {
        const allParticipants: ('User' | 'Alice' | 'Charlie')[] = ['User', 'Alice', 'Charlie'];
        const availableParticipants = allParticipants.filter(p => 
            p !== excludeAgent && 
            p !== (excludeAgent === 'arithmetic' ? 'Alice' : excludeAgent === 'concept' ? 'Charlie' : excludeAgent)
        );
        
        const randomIndex = Math.floor(Math.random() * availableParticipants.length);
        const selected = availableParticipants[randomIndex];
        console.log(`🎲 ${excludeAgent} randomly selected next participant: ${selected}`);
        return selected;
    }, []);

    // Helper function to detect if user is interrupting (wasn't previously addressed)
    const isUserInterrupting = useCallback((): boolean => {
        if (messages.length === 0) return false;
        
        const lastMessage = messages[messages.length - 1];
        if (lastMessage.sender === "user") return false; // Last message was also from user
        
        // Check if last agent message addressed the user
        const addressedParticipant = parseAddressedParticipant(lastMessage.text);
        const wasUserAddressed = addressedParticipant === 'User';
        
        console.log(`🔍 Checking interruption: Last message addressed ${addressedParticipant}, user was addressed: ${wasUserAddressed}`);
        return !wasUserAddressed;
    }, [messages, parseAddressedParticipant]);

    // Enhanced state setter that checks if component is mounted
    const safeSetMessages = useCallback((updater: React.SetStateAction<Message[]>) => {
        if (!isUnmountedRef.current) {
            setMessages(updater);
        }
    }, []);

    const safeAddTypingMessageId = useCallback((id: number) => {
        if (!isUnmountedRef.current) {
            setTypingMessageIds(prev => [...prev, id]);
        }
    }, []);

    const safeRemoveTypingMessageId = useCallback((id: number) => {
        if (!isUnmountedRef.current) {
            setTypingMessageIds(prev => prev.filter(msgId => msgId !== id));
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

    const getUniqueMessageId = useCallback(() => {
        return nextMessageIdRef.current++;
    }, []);

    // Function to stop all ongoing agent responses when user takes turn
    const stopAgentResponsesForUserTurn = useCallback(() => {
        console.log("🛑 Stopping all agent responses for user turn");
        
        // Signal all ongoing agent responses to cancel
        cancelCurrentResponseRef.current = true;
        agentResponseInProgressRef.current = false;
        
        // Clear inactivity timer
        if (inactivityTimeoutRef.current) {
            clearTimeout(inactivityTimeoutRef.current);
            inactivityTimeoutRef.current = null;
        }
        
        // Reset cancellation flag after a brief delay
        createManagedTimeout(() => {
            cancelCurrentResponseRef.current = false;
        }, 500);
    }, [createManagedTimeout]);

    const generateAliceResponse = useCallback(
        async (previousMessage: Message, isFirstInSequence: boolean = false, userAnswer?: Message) => {
            if (isUnmountedRef.current) return null;
            
            // Check for cancellation before starting
            if (cancelCurrentResponseRef.current) {
                console.log("Alice response cancelled");
                agentResponseInProgressRef.current = false; // Reset on cancellation
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
                // Check for cancellation before API call
                if (cancelCurrentResponseRef.current) {
                    console.log("Alice response cancelled before API call");
                    safeRemoveTypingMessageId(placeholderId);
                    safeSetMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    agentResponseInProgressRef.current = false; // Reset on cancellation
                    return null;
                }

                let enhancedSystemPrompt;
                
                if (isFirstInSequence) {
                    // First agent just gives their answer without addressing anyone
                    enhancedSystemPrompt = aliceAgent.systemPrompt + `\n\n[Response ID: ${aliceAgent.id}-${Date.now()}-${Math.random().toFixed(6)}]

You are Alice, a student in a group discussion. 

PROBLEM: ${currentQuestion?.question || "No problem provided"}

You just heard the user say: "${previousMessage.text}"

TASK: Give your final answer to this problem as Alice would:
- Show your reasoning process and explain how you arrived at your answer
- Make arithmetic errors but show good conceptual understanding
- Be thorough but natural (2-3 sentences explaining your thinking)
- End with your final answer

IMPORTANT: 
- Don't use any special formatting like asterisks, bold, or markdown
- Don't use @mentions or address anyone specifically
- Explain your reasoning first, then give your final answer`;
                } else {
                    // Regular response with random participant selection
                    const nextParticipant = getRandomNextParticipant('Alice');
                    
                    let contextMessage = previousMessage.text;
                    
                    // If we have both user answer and first agent's answer, provide context
                    if (userAnswer && userAnswer.sender === "user") {
                        contextMessage = `The user originally answered: "${userAnswer.text}"
Then Charlie responded: "${previousMessage.text}"`;
                    }
                    
                    enhancedSystemPrompt = aliceAgent.systemPrompt + `\n\n[Response ID: ${aliceAgent.id}-${Date.now()}-${Math.random().toFixed(6)}]

You are Alice, a student in a group discussion. 

PROBLEM: ${currentQuestion?.question || "No problem provided"}

CONTEXT: ${contextMessage}

TASK: 
1. Respond naturally as Alice would:
   - React to what they said (agree/disagree/comment)
   - If giving your own answer, make arithmetic errors but show good conceptual understanding
   - Keep it conversational and brief (1-2 sentences)
2. Then ask a follow-up question to keep the discussion going:
   - Ask about their reasoning, approach, or a related concept
   - Be curious and engaging like a real student would be

FORMAT: [Your response] [Then ask your question]

IMPORTANT: 
- Address your question to @${nextParticipant} specifically
- Don't use any special formatting like asterisks, bold, or markdown
- End with "@${nextParticipant}, [your specific question]"`;
                }

                const response = await aiService.generateResponse(
                    [previousMessage],
                    {
                        systemPrompt: enhancedSystemPrompt,
                        model: aliceAgent.model,
                        temperature: 0.8,
                    }
                );

                if (isUnmountedRef.current || cancelCurrentResponseRef.current) {
                    console.log("Alice response cancelled after API call");
                    safeRemoveTypingMessageId(placeholderId);
                    safeSetMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    agentResponseInProgressRef.current = false; // Reset on cancellation
                    return null;
                }

                const finalMessage: Message = {
                    id: placeholderId,
                    sender: "ai",
                    agentId: aliceAgent.id,
                    text: response,
                    timestamp: new Date().toISOString(),
                };

                safeSetMessages(prev => prev.map(msg => 
                    msg.id === placeholderId ? finalMessage : msg
                ));
                
                safeRemoveTypingMessageId(placeholderId);
                onNewMessage(finalMessage);
                
                // Handle who Alice addressed based on response type
                if (!isUnmountedRef.current) {
                    if (isFirstInSequence) {
                        // First agent doesn't address anyone - trigger Charlie automatically
                        console.log("🎯 Alice gave initial answer, triggering Charlie next");
                        createManagedTimeout(() => {
                            // Find the user's original answer from initial messages
                            const userAnswer = initialMessages[initialMessages.length - 1];
                            generateCharlieResponse(finalMessage, false, userAnswer); // Charlie is second, so should choose next participant
                        }, 2000);
                    } else {
                        // Regular response handling with addressing - agent response complete, allow user input
                        agentResponseInProgressRef.current = false;
                        
                        const addressedParticipant = parseAddressedParticipant(finalMessage.text);
                        
                        if (addressedParticipant === 'User') {
                            // Alice addressed user, enable input and start inactivity timer
                            safeSetIsQuestioningEnabled(true);
                            // Clear any existing timer
                            if (inactivityTimeoutRef.current) {
                                clearTimeout(inactivityTimeoutRef.current);
                            }
                            inactivityTimeoutRef.current = createManagedTimeout(() => {
                                if (!isUnmountedRef.current && !agentResponseInProgressRef.current) {
                                    console.log("⏰ User inactivity after Alice - Charlie covering");
                                    const coverMessage: Message = {
                                        id: getUniqueMessageId(),
                                        sender: "ai",
                                        agentId: "concept", 
                                        text: "Hey! I know this one!",
                                        timestamp: new Date().toISOString(),
                                    };
                                    generateCharlieResponse(coverMessage, false);
                                }
                            }, 30000);
                        } else if (addressedParticipant === 'Charlie') {
                            // Alice addressed Charlie, trigger Charlie's response
                            agentResponseInProgressRef.current = true; // Set to true for next agent response
                            createManagedTimeout(() => {
                                generateCharlieResponse(finalMessage, false);
                            }, 2000);
                        } else {
                            // Default to enabling user input
                            safeSetIsQuestioningEnabled(true);
                            // Clear any existing timer
                            if (inactivityTimeoutRef.current) {
                                clearTimeout(inactivityTimeoutRef.current);
                            }
                            inactivityTimeoutRef.current = createManagedTimeout(() => {
                                if (!isUnmountedRef.current && !agentResponseInProgressRef.current) {
                                    console.log("⏰ User inactivity after Alice - Charlie covering");
                                    const coverMessage: Message = {
                                        id: getUniqueMessageId(),
                                        sender: "ai",
                                        agentId: "concept",
                                        text: "Ooh, I've got this!",
                                        timestamp: new Date().toISOString(),
                                    };
                                    generateCharlieResponse(coverMessage, false);
                                }
                            }, 30000);
                        }
                    }
                }
                
                return finalMessage;
            } catch (error) {
                console.error("Error generating Alice's response:", error);
                safeRemoveTypingMessageId(placeholderId);
                safeSetMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                agentResponseInProgressRef.current = false; // Reset on error
                return null;
            }
        },
        [agents, getUniqueMessageId, safeSetMessages, safeAddTypingMessageId, safeRemoveTypingMessageId, onNewMessage, safeSetIsQuestioningEnabled, createManagedTimeout, parseAddressedParticipant, getRandomNextParticipant, initialMessages]
    );

    const generateCharlieResponse = useCallback(
        async (previousMessage: Message, isFirstInSequence: boolean = false, userAnswer?: Message) => {
            if (isUnmountedRef.current) return null;
            
            // Check for cancellation before starting
            if (cancelCurrentResponseRef.current) {
                console.log("Charlie response cancelled");
                agentResponseInProgressRef.current = false; // Reset on cancellation
                return null;
            }
            
            const charlieAgent = agents.find(agent => agent.id === "concept");
            if (!charlieAgent) return null;

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
                // Check for cancellation before API call
                if (cancelCurrentResponseRef.current) {
                    console.log("Charlie response cancelled before API call");
                    safeRemoveTypingMessageId(placeholderId);
                    safeSetMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    agentResponseInProgressRef.current = false; // Reset on cancellation
                    return null;
                }

                let enhancedSystemPrompt;
                
                if (isFirstInSequence) {
                    // First agent just gives their answer without addressing anyone
                    enhancedSystemPrompt = charlieAgent.systemPrompt + `\n\n[Response ID: ${charlieAgent.id}-${Date.now()}-${Math.random().toFixed(6)}]

You are Charlie, a student in a group discussion. 

PROBLEM: ${currentQuestion?.question || "No problem provided"}

You just heard the user say: "${previousMessage.text}"

TASK: Give your final answer to this problem as Charlie would:
- Show your reasoning process and explain how you arrived at your answer
- Use wrong conceptual approach but correct arithmetic
- Be thorough but natural (2-3 sentences explaining your thinking)
- End with your final answer

IMPORTANT: 
- Don't use any special formatting like asterisks, bold, or markdown
- Don't use @mentions or address anyone specifically
- Explain your reasoning first, then give your final answer`;
                } else {
                    // Regular response with random participant selection
                    const nextParticipant = getRandomNextParticipant('Charlie');
                    
                    let contextMessage = previousMessage.text;
                    
                    // If we have both user answer and first agent's answer, provide context
                    if (userAnswer && userAnswer.sender === "user") {
                        contextMessage = `The user originally answered: "${userAnswer.text}"
Then Alice responded: "${previousMessage.text}"`;
                    }
                    
                    enhancedSystemPrompt = charlieAgent.systemPrompt + `\n\n[Response ID: ${charlieAgent.id}-${Date.now()}-${Math.random().toFixed(6)}]

You are Charlie, a student in a group discussion. 

PROBLEM: ${currentQuestion?.question || "No problem provided"}

CONTEXT: ${contextMessage}

TASK: 
1. Respond naturally as Charlie would:
   - React to what they said (agree/disagree/comment) 
   - If giving your own answer, use wrong conceptual approach but correct arithmetic
   - Be brief and slightly argumentative (1-2 sentences)
2. Then ask a follow-up question to keep the discussion going:
   - Ask about their reasoning, approach, or a related concept
   - Be curious and challenging like a real student would be

FORMAT: [Your response] [Then ask your question]

IMPORTANT: 
- Address your question to @${nextParticipant} specifically
- Don't use any special formatting like asterisks, bold, or markdown
- End with "@${nextParticipant}, [your specific question]"`;
                }

                const response = await aiService.generateResponse(
                    [previousMessage],
                    {
                        systemPrompt: enhancedSystemPrompt,
                        model: charlieAgent.model,
                        temperature: 0.8,
                    }
                );

                if (isUnmountedRef.current || cancelCurrentResponseRef.current) {
                    console.log("Charlie response cancelled after API call");
                    safeRemoveTypingMessageId(placeholderId);
                    safeSetMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    agentResponseInProgressRef.current = false; // Reset on cancellation
                    return null;
                }

                const finalMessage: Message = {
                    id: placeholderId,
                    sender: "ai",
                    agentId: charlieAgent.id,
                    text: response,
                    timestamp: new Date().toISOString(),
                };

                safeSetMessages(prev => prev.map(msg => 
                    msg.id === placeholderId ? finalMessage : msg
                ));
                
                safeRemoveTypingMessageId(placeholderId);
                onNewMessage(finalMessage);
                
                // Handle who Charlie addressed based on response type
                if (!isUnmountedRef.current) {
                    if (isFirstInSequence) {
                        // First agent doesn't address anyone - trigger Alice automatically
                        console.log("🎯 Charlie gave initial answer, triggering Alice next");
                        createManagedTimeout(() => {
                            // Find the user's original answer from initial messages
                            const userAnswer = initialMessages[initialMessages.length - 1];
                            generateAliceResponse(finalMessage, false, userAnswer); // Alice is second, so should choose next participant
                        }, 2000);
                    } else {
                        // Regular response handling with addressing - agent response complete, allow user input
                        agentResponseInProgressRef.current = false;
                        
                        const addressedParticipant = parseAddressedParticipant(finalMessage.text);
                        
                        if (addressedParticipant === 'User') {
                            // Charlie addressed user, enable input and start inactivity timer
                            safeSetIsQuestioningEnabled(true);
                            // Clear any existing timer
                            if (inactivityTimeoutRef.current) {
                                clearTimeout(inactivityTimeoutRef.current);
                            }
                            inactivityTimeoutRef.current = createManagedTimeout(() => {
                                if (!isUnmountedRef.current && !agentResponseInProgressRef.current) {
                                    console.log("⏰ User inactivity after Charlie - Alice covering");
                                    const coverMessage: Message = {
                                        id: getUniqueMessageId(),
                                        sender: "ai",
                                        agentId: "arithmetic",
                                        text: "Oh! I know this one!",
                                        timestamp: new Date().toISOString(),
                                    };
                                    generateAliceResponse(coverMessage, false);
                                }
                            }, 30000);
                        } else if (addressedParticipant === 'Alice') {
                            // Charlie addressed Alice, trigger Alice's response
                            agentResponseInProgressRef.current = true; // Set to true for next agent response
                            createManagedTimeout(() => {
                                generateAliceResponse(finalMessage, false);
                            }, 2000);
                        } else {
                            // Default to enabling user input
                            safeSetIsQuestioningEnabled(true);
                            // Clear any existing timer
                            if (inactivityTimeoutRef.current) {
                                clearTimeout(inactivityTimeoutRef.current);
                            }
                            inactivityTimeoutRef.current = createManagedTimeout(() => {
                                if (!isUnmountedRef.current && !agentResponseInProgressRef.current) {
                                    console.log("⏰ User inactivity after Charlie - Alice covering");
                                    const coverMessage: Message = {
                                        id: getUniqueMessageId(),
                                        sender: "ai",
                                        agentId: "arithmetic",
                                        text: "Wait, I think I can get this!",
                                        timestamp: new Date().toISOString(),
                                    };
                                    generateAliceResponse(coverMessage, false);
                                }
                            }, 30000);
                        }
                    }
                }
                
                return finalMessage;
            } catch (error) {
                console.error("Error generating Charlie's response:", error);
                safeRemoveTypingMessageId(placeholderId);
                safeSetMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                agentResponseInProgressRef.current = false; // Reset on error
                return null;
            }
        },
        [agents, getUniqueMessageId, safeSetMessages, safeAddTypingMessageId, safeRemoveTypingMessageId, onNewMessage, safeSetIsQuestioningEnabled, createManagedTimeout, parseAddressedParticipant, getRandomNextParticipant, initialMessages]
    );

    const handleSendMessage = useCallback(async () => {
        console.log("🔍 handleSendMessage called", {
            inputTrim: input.trim(),
            isQuestioningEnabled,
            agentResponseInProgress: agentResponseInProgressRef.current
        });
        
        // Users should NEVER be blocked from sending messages! Only block on empty input.
        if (!input.trim()) {
            console.log("❌ Message sending blocked: no input provided");
            return;
        }
        
        // If agents are responding or questioning is disabled, user interrupts and takes priority
        if (agentResponseInProgressRef.current || !isQuestioningEnabled) {
            console.log("🚨 User interrupting conversation - taking priority!");
        }

        const userInput = input.trim();
        setInput("");
        
        // Stop any ongoing agent responses and reset progress flag
        stopAgentResponsesForUserTurn();
        
        console.log("✅ User message sending - resetting agent progress flag");
        agentResponseInProgressRef.current = false;
        
        // Always enable questioning when user participates
        safeSetIsQuestioningEnabled(true);
        
        const userMessage: Message = {
            id: getUniqueMessageId(),
            sender: "user",
            text: userInput,
            timestamp: new Date().toISOString(),
        };

        safeSetMessages(prev => [...prev, userMessage]);
        onNewMessage(userMessage);
        
        // Temporarily disable input to prevent rapid-fire messages, but will be re-enabled after agent responds
        safeSetIsQuestioningEnabled(false);
        
        // Check if user specifically mentioned an agent
        const mentionedAgent = parseAddressedParticipant(userInput);
        
        if (mentionedAgent === 'Alice') {
            console.log("👤 User specifically mentioned Alice");
            agentResponseInProgressRef.current = true;
            createManagedTimeout(() => {
                generateAliceResponse(userMessage, false); // Not first in sequence
            }, 1500);
        } else if (mentionedAgent === 'Charlie') {
            console.log("👤 User specifically mentioned Charlie");
            agentResponseInProgressRef.current = true;
            createManagedTimeout(() => {
                generateCharlieResponse(userMessage, false); // Not first in sequence
            }, 1500);
        } else {
            // Check if user was interrupting or responding normally
            const isInterrupting = isUserInterrupting();
            
            if (isInterrupting) {
                console.log("💬 User interrupting - treating as fresh conversation start");
            } else {
                console.log("� User responding to addressed question");
            }
            
            // In both cases, randomly select agent to respond
            const firstResponder = getRandomFirstResponder();
            agentResponseInProgressRef.current = true;
            createManagedTimeout(() => {
                if (firstResponder === 'Alice') {
                    generateAliceResponse(userMessage, false); // Not first in sequence
                } else {
                    generateCharlieResponse(userMessage, false); // Not first in sequence
                }
            }, 1500);
        }
        
    }, [input, isQuestioningEnabled, onNewMessage, safeSetMessages, safeSetIsQuestioningEnabled, stopAgentResponsesForUserTurn, getUniqueMessageId, parseAddressedParticipant, isUserInterrupting, getRandomFirstResponder, createManagedTimeout, generateAliceResponse, generateCharlieResponse]);

    // Handle initial response when conversation starts
    useEffect(() => {
        if (triggerInitialResponse && 
            !hasInitialResponseStarted.current && 
            agents.length > 0 && 
            initialMessages.length > 0 &&
            !agentResponseInProgressRef.current) {
            
            hasInitialResponseStarted.current = true;
            agentResponseInProgressRef.current = true;
            
            console.log("🚀 Starting initial group scenario response sequence");
            
            // Randomly select first responder (Alice or Charlie)
            const firstResponder = getRandomFirstResponder();
            const userAnswer = initialMessages[initialMessages.length - 1];
            
            createManagedTimeout(() => {
                if (!isUnmountedRef.current) {
                    if (firstResponder === 'Alice') {
                        generateAliceResponse(userAnswer, true); // First agent in sequence
                    } else {
                        generateCharlieResponse(userAnswer, true); // First agent in sequence
                    }
                }
            }, 2000);
        }
    }, [triggerInitialResponse, agents, initialMessages, getRandomFirstResponder, generateAliceResponse, generateCharlieResponse, createManagedTimeout]);

    // Sync messages with initialMessages when they change
    useEffect(() => {
        if (initialMessages.length > messages.length) {
            setMessages(initialMessages);
        }
    }, [initialMessages, messages.length]);

    // Auto-scroll when new messages are added
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages.length]);

    const getAgentDisplayInfo = (msg: Message) => {
        if (msg.sender === "user") {
            return { name: "User (You)", avatar: "user.png" };
        }
        
        const agent = agents.find(a => a.id === msg.agentId);
        if (agent) {
            return { name: agent.name, avatar: agent.avatar };
        }
        
        // Fallback for unknown agents
        return { name: "AI", avatar: "user.png" };
    };

    return (
        <div className="h-full w-1/2 pl-2 flex flex-col bg-black bg-opacity-50 backdrop-blur rounded-lg border border-gray-700 overflow-hidden chat-container">
            <div 
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4 chat-messages"
                style={{ minHeight: 0 }} // Ensures flex-1 child can shrink below content size
            >
                {messages.map((msg) => {
                    const agentInfo = getAgentDisplayInfo(msg);
                    
                    return (
                        <div
                            key={`${msg.id}-${msg.timestamp}`}
                            className={`flex items-start space-x-3 ${
                                msg.sender === "user" ? "justify-end" : "justify-start"
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
                                        onTypingComplete={safeRemoveTypingMessageId}
                                        skip={false}
                                        formatMath={true}
                                    />
                                ) : (
                                    <MessageWithHighlights
                                        text={msg.text || ""}
                                    />
                                )}
                            </div>
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
                            isQuestioningEnabled
                                ? "Ask a question..."
                                : "Type to join the conversation..."
                        }
                        className="flex-1 bg-white bg-opacity-10 border border-gray-700 rounded-md p-3 text-white resize-none h-16"
                    />
                    <button
                        onClick={() => {
                            console.log("🖱️ Send button clicked", {
                                inputValue: input,
                                isQuestioningEnabled,
                                buttonDisabled: !input.trim()
                            });
                            handleSendMessage();
                        }}
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

export default GroupScenarioChat;
