import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Message } from "@/utils/types";
import { Agent } from "@/lib/agents";
import { aiService } from "@/services/AI";
import TypewriterTextWrapper from "./TypewriterTextWrapper";
import { formatMessageForDisplay } from "@/lib/utils";
import RenderMathExpression from "./RenderMathExpression";
import MessageWithHighlights from "./MessageWithHighlights";

interface SingleScenarioChatProps {
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
    scratchboardContent?: string; // User's scratchboard/working area content
    agentContextMessage?: Message; // Message with full context for agents
}

const SingleScenarioChat: React.FC<SingleScenarioChatProps> = ({
    agents,
    initialMessages,
    onNewMessage,
    isQuestioningEnabled,
    setIsQuestioningEnabled,
    triggerInitialResponse = false,
    currentQuestion,
    scratchboardContent,
    agentContextMessage,
}) => {
    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [input, setInput] = useState("");
    const [typingMessageIds, setTypingMessageIds] = useState<number[]>([]);
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipMessage, setTooltipMessage] = useState("");
    const chatContainerRef = useRef<HTMLDivElement>(null);
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
        console.log("🧹 SingleScenarioChat component cleanup initiated");
        isUnmountedRef.current = true;
        agentResponseInProgressRef.current = false;
        
        // Clear all pending timeouts
        pendingTimeoutsRef.current.forEach(timeout => {
            clearTimeout(timeout);
        });
        pendingTimeoutsRef.current.clear();
        
        // Hide any active tooltips
        setShowTooltip(false);
        
        console.log("✅ SingleScenarioChat component cleanup completed");
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
            console.log("⚠️ Attempted to create timeout on unmounted SingleScenarioChat component");
            return setTimeout(() => {}, 0); // Return dummy timeout
        }
        
        const timeout = setTimeout(() => {
            if (!isUnmountedRef.current) {
                callback();
            }
            pendingTimeoutsRef.current.delete(timeout);
        }, delay);
        
        pendingTimeoutsRef.current.add(timeout);
        return timeout;
    }, []);

    // Helper function for cancellable delays in async flows
    const cancellableDelay = useCallback((ms: number): Promise<void> => {
        return new Promise((resolve, reject) => {
            if (cancelCurrentResponseRef.current) {
                reject(new Error('Cancelled before delay started'));
                return;
            }
            
            const timeout = createManagedTimeout(() => {
                if (cancelCurrentResponseRef.current) {
                    reject(new Error('Cancelled during delay'));
                } else {
                    resolve();
                }
            }, ms);
        });
    }, [createManagedTimeout]);

    // Helper function to detect if user is responding to a direct question vs interrupting
    const isUserRespondingToQuestion = useCallback((userMessage: Message): boolean => {
        // Get the last agent message
        const lastAgentMessage = messages.slice().reverse().find(msg => msg.sender === "ai");
        
        if (!lastAgentMessage) {
            // No previous agent messages, this is likely a fresh start
            return false;
        }
        
        // Check if the last agent message addressed the user directly
        const addressedUser = lastAgentMessage.text.includes('@User');
        
        if (addressedUser) {
            // The last agent message was directed at the user
            // Check timing - if it's been less than 5 minutes, consider it a response
            const lastMessageTime = new Date(lastAgentMessage.timestamp).getTime();
            const userMessageTime = new Date(userMessage.timestamp).getTime();
            const timeDiff = userMessageTime - lastMessageTime;
            
            // If less than 5 minutes and user is responding, consider it a response
            return timeDiff < 300000; // 5 minutes in milliseconds
        }
        
        // Last agent message wasn't directed at user, so this is likely an interruption
        return false;
    }, [messages]);

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
            
            // Set the next message ID to start after the highest existing ID
            const maxId = Math.max(0, ...initialMessages.map(m => m.id));
            nextMessageIdRef.current = maxId + 1;
        }
    }, [initialMessages, messages.length]);

    // Auto-scroll when new messages are added
    useEffect(() => {
        // Small delay to allow DOM to update with new message
        const timer = setTimeout(() => {
            scrollToBottom();
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
            chatContainerRef.current.scrollTo({
                top: chatContainerRef.current.scrollHeight,
                behavior: 'smooth'
            });
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

    // Bob's initial message (provides feedback and prompts user)
    const bobInitialMessage = useCallback(
        async (conversationHistory: Message[]) => {
            const bobAgent = agents.find(agent => agent.id === "bob");
            if (!bobAgent) return null;

            // Check for cancellation before starting
            if (cancelCurrentResponseRef.current) {
                console.log("Bob initial message cancelled");
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
                // Check for cancellation before API call
                if (cancelCurrentResponseRef.current) {
                    console.log("Bob initial message cancelled before API call");
                    removeTypingMessageId(placeholderId);
                    setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    return null;
                }

                let enhancedSystemPrompt = bobAgent.systemPrompt + `\n\n[Response ID: ${bobAgent.id}-${Date.now()}-${Math.random().toFixed(6)}]`;
                
                // Extract the user's message from conversation history
                const userMessage = conversationHistory.find(msg => msg.sender === "user");
                
                console.log("Bob's conversation analysis:");
                console.log("User message:", userMessage?.text || "No response");
                console.log("Single scenario - only Bob and User");
                
                // Single scenario: Give feedback only to the user
                enhancedSystemPrompt += `\n\nYou are Bob, a precise and concise math tutor working one-on-one with a student. Review their answer and provide brief, accurate feedback.

STUDENT'S RESPONSE:
- User said: "${userMessage?.text || "No response"}"

TASK: 
1. Give concise feedback (2-3 sentences max):
   - Briefly state if their answer is correct or incorrect
   - If incorrect, identify the main error without over-explaining
2. If needed, show ONE key step or concept they should focus on
3. Ask a focused follow-up question

REQUIREMENTS:
- Be precise and mathematically accurate - double-check all calculations
- Keep responses under 100 words
- Be encouraging but direct
- No special formatting (asterisks, bold, markdown)
- End with "@User, [specific question]"

CRITICAL: Verify all math before responding. If unsure about any calculation, state the correct answer without showing work.`;

                // Add current question context including correct answer
                if (currentQuestion) {
                    enhancedSystemPrompt += `\n\nMATH PROBLEM: "${currentQuestion.question}"`;
                    if (currentQuestion.options) {
                        enhancedSystemPrompt += `\nOPTIONS: ${Array.isArray(currentQuestion.options) ? currentQuestion.options.join(", ") : Object.values(currentQuestion.options).join(", ")}`;
                    }
                    // Use answer field (what pages pass) or correctAnswer for backward compatibility
                    const correctAnswer = currentQuestion.answer || currentQuestion.correctAnswer;
                    if (correctAnswer) {
                        enhancedSystemPrompt += `\nCORRECT ANSWER: ${correctAnswer}`;
                    }
                }
                
                // Include user's scratchboard work if available
                if (scratchboardContent && scratchboardContent.trim()) {
                    enhancedSystemPrompt += `\n\nUSER'S SCRATCHBOARD WORK:\n"""\n${scratchboardContent.trim()}\n"""\nUse this to understand their reasoning process and identify any errors in their approach.`;
                }

                const response = await aiService.generateResponse(
                    conversationHistory,
                    {
                        systemPrompt: enhancedSystemPrompt,
                        model: bobAgent.model,
                        temperature: 0.3, // Lower temperature for more precise, consistent responses
                    }
                );

                // Check for cancellation after API call
                if (cancelCurrentResponseRef.current) {
                    console.log("Bob initial message cancelled after API call");
                    removeTypingMessageId(placeholderId);
                    setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                    return null;
                }

                const finalMessage: Message = {
                    id: placeholderId,
                    sender: "ai",
                    agentId: bobAgent.id,
                    text: response,
                    timestamp: new Date().toISOString(),
                };

                setMessages(prev => prev.map(msg => 
                    msg.id === placeholderId ? finalMessage : msg
                ));
                
                removeTypingMessageId(placeholderId);
                onNewMessage(finalMessage);

                // In single scenario, stop agent responses since user should respond
                stopAgentResponsesForUserTurn();
                
                // Enable questioning after a small delay
                createManagedTimeout(() => {
                    safeSetIsQuestioningEnabled(true);
                }, 1000); // Small delay to ensure message is fully rendered

                return finalMessage;
            } catch (error) {
                console.error("Error generating Bob's initial message:", error);
                removeTypingMessageId(placeholderId);
                setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
                return null;
            }
        },
        [agents, getUniqueMessageId, setMessages, addTypingMessageId, removeTypingMessageId, currentQuestion, onNewMessage, stopAgentResponsesForUserTurn]
    );

    // Bob's generate message (responds to user message)
    const generateBobMessage = useCallback(
        async (conversationHistory: Message[]) => {
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
                let enhancedSystemPrompt = bobAgent.systemPrompt + `\n\n[Response ID: ${bobAgent.id}-${Date.now()}-${Math.random().toFixed(6)}]`;
                
                // The most recent message should be the student's response
                const studentResponse = conversationHistory[conversationHistory.length - 1];
                
                // Find Bob's most recent message before the student response
                let bobPreviousMessage = null;
                for (let i = conversationHistory.length - 2; i >= 0; i--) {
                    if (conversationHistory[i].agentId === "bob") {
                        bobPreviousMessage = conversationHistory[i];
                        break;
                    }
                }
                
                console.log("Bob generate message context:");
                console.log("Bob's previous message:", bobPreviousMessage?.text?.substring(0, 100) || "Not found");
                console.log("Student response:", studentResponse?.text?.substring(0, 100) || "Not found");
                console.log("Single scenario - Bob responding to user");
                
                enhancedSystemPrompt += `\n\nYou are Bob, a concise math tutor. The user just responded to your previous question.

CONVERSATION CONTEXT:
- You previously said: "${bobPreviousMessage?.text || "Previous message not found"}"
- The user just responded: "${studentResponse?.text || "No response found"}"

TASK: 
1. Briefly acknowledge their response (1 sentence)
2. Give concise feedback - correct or incorrect? What's the main issue? (1-2 sentences)
3. Ask a focused follow-up question

REQUIREMENTS:
- Keep responses under 80 words
- Be mathematically accurate - verify all calculations
- Reference their specific response briefly
- No special formatting (asterisks, bold, markdown)
- End with "@User, [new question]"

CRITICAL: Double-check any math before responding. If uncertain, just state the correct answer.`;

                // Add current question context if available (use answer field, with correctAnswer fallback)
                if (currentQuestion) {
                    const correctAnswer = currentQuestion.answer || currentQuestion.correctAnswer;
                    if (correctAnswer) {
                        enhancedSystemPrompt += `\n\nORIGINAL PROBLEM: "${currentQuestion.question}"\nCORRECT ANSWER: ${correctAnswer}`;
                    }
                }
                
                // Include user's scratchboard work if available
                if (scratchboardContent && scratchboardContent.trim()) {
                    enhancedSystemPrompt += `\n\nUSER'S SCRATCHBOARD WORK:\n"""\n${scratchboardContent.trim()}\n"""\nUse this to understand their reasoning process.`;
                }

                if (isUnmountedRef.current) return null;

                const response = await aiService.generateResponse(
                    conversationHistory, // Pass full conversation history for context
                    {
                        systemPrompt: enhancedSystemPrompt,
                        model: bobAgent.model,
                        temperature: 0.3, // Lower temperature for more precise, consistent responses
                    }
                );

                if (isUnmountedRef.current) return null;

                const finalMessage: Message = {
                    id: placeholderId,
                    sender: "ai",
                    agentId: bobAgent.id,
                    text: response,
                    timestamp: new Date().toISOString(),
                };

                safeSetMessages(prev => prev.map(msg => 
                    msg.id === placeholderId ? finalMessage : msg
                ));
                
                safeRemoveTypingMessageId(placeholderId);
                onNewMessage(finalMessage);

                // In single scenario, stop agent responses since user should respond
                stopAgentResponsesForUserTurn();
                
                // Enable questioning after a small delay
                createManagedTimeout(() => {
                    safeSetIsQuestioningEnabled(true);
                }, 1000); // Small delay to ensure message is fully rendered

                return finalMessage;
            } catch (error) {
                console.error("Error generating Bob's message:", error);
                return null;
            }
        },
        [agents, getUniqueMessageId, safeSetMessages, safeAddTypingMessageId, safeRemoveTypingMessageId, currentQuestion, onNewMessage, createManagedTimeout]
    );

    // Simplified sequential agent response function for single scenario
    const triggerSequentialAgentResponse = useCallback(
        async (userMessage: Message, isIntervention = false) => {
            if (agentResponseInProgressRef.current) {
                console.log("Agent response already in progress, skipping");
                return;
            }
            
            agentResponseInProgressRef.current = true;
            
            try {
                // Check for cancellation at the start
                if (cancelCurrentResponseRef.current) {
                    console.log("Sequential agent response cancelled");
                    return;
                }

                // Determine if user is responding to a question or interrupting
                const isUserResponse = isUserRespondingToQuestion(userMessage);
                console.log(`User message type: ${isUserResponse ? 'Response to question' : 'Interruption/Fresh start'}`);

                // Build conversation history with user message
                let conversationHistory: Message[] = [...messages];
                
                // If this isn't an intervention and the userMessage isn't already in messages, add it
                if (!isIntervention) {
                    const messageExists = messages.some(m => m.id === userMessage.id);
                    if (!messageExists) {
                        // Use agent context message if available, otherwise use the regular message
                        const messageForAgents = agentContextMessage && agentContextMessage.id === userMessage.id 
                            ? agentContextMessage 
                            : userMessage;
                        conversationHistory.push(messageForAgents);
                    }
                }

                // If user is interrupting, clear conversation history except for the user's message
                if (!isUserResponse && !isIntervention) {
                    console.log("User interrupting - clearing conversation context");
                    const userMessageForAgents = agentContextMessage && agentContextMessage.id === userMessage.id 
                        ? agentContextMessage 
                        : userMessage;
                    conversationHistory = [userMessageForAgents];
                }

                console.log("Single scenario: Generating Bob's direct response...");
                if (cancelCurrentResponseRef.current) return;
                await bobInitialMessage(conversationHistory);

                setIsQuestioningEnabled(true);
            } catch (error) {
                console.error("Error in sequential agent response:", error);
            } finally {
                agentResponseInProgressRef.current = false;
            }
        },
        [bobInitialMessage, setIsQuestioningEnabled, messages, agentContextMessage, isUserRespondingToQuestion]
    );

    // Handle user messages
    const handleUserMessage = useCallback(
        async (userMessage: Message) => {
            // Reset cancellation flag for new response sequence
            cancelCurrentResponseRef.current = false;
            
            // Set agent response in progress flag
            agentResponseInProgressRef.current = true;
            
            try {
                // Add user message to conversation
                safeSetMessages(prev => [...prev, userMessage]);
                onNewMessage(userMessage);
                safeSetIsQuestioningEnabled(false);

                // Wait for any currently typing messages to finish before responding
                const waitForCurrentTyping = () => {
                    return new Promise<void>((resolve) => {
                        if (typingMessageIds.length === 0) {
                            resolve();
                            return;
                        }
                        
                        const checkTyping = () => {
                            if (typingMessageIds.length === 0) {
                                resolve();
                            } else {
                                createManagedTimeout(checkTyping, 100);
                            }
                        };
                        createManagedTimeout(checkTyping, 100);
                    });
                };

                await waitForCurrentTyping();

                createManagedTimeout(() => {
                    // Determine if user is responding to a question or interrupting
                    const isUserResponse = isUserRespondingToQuestion(userMessage);
                    console.log(`User message in handleUserMessage: ${isUserResponse ? 'Response to question' : 'Interruption/Fresh start'}`);
                    
                    let conversationHistory: Message[];
                    if (isUserResponse) {
                        // User is responding to a question - use full conversation history
                        conversationHistory = [...messages, userMessage];
                    } else {
                        // User is interrupting - create fresh context with just their message
                        console.log("User interrupting - using fresh context for Bob");
                        conversationHistory = [userMessage];
                    }
                    
                    // Single scenario - Bob responds but doesn't auto-trigger (only user can respond)
                    generateBobMessage(conversationHistory);
                    
                    // Release the lock after the timeout
                    agentResponseInProgressRef.current = false;
                }, 1000);
            } catch (error) {
                console.error("Error in handleUserMessage:", error);
                agentResponseInProgressRef.current = false;
            }
        },
        [generateBobMessage, setMessages, onNewMessage, setIsQuestioningEnabled, typingMessageIds, isUserRespondingToQuestion]
    );

    // Effect to trigger initial agent responses after user submission (one-time only)
    useEffect(() => {
        if (triggerInitialResponse && initialMessages.length > 0 && agents.length > 0 && !hasInitialResponseStarted.current) {
            const lastMessage = initialMessages[initialMessages.length - 1];
            if (lastMessage.sender === "user") {
                const hasAgentResponses = messages.some(msg => 
                    msg.sender === "ai" && msg.timestamp > lastMessage.timestamp
                );
                
                // Only trigger initial responses if no agent has responded yet
                if (!hasAgentResponses) {
                    hasInitialResponseStarted.current = true;
                    createManagedTimeout(() => {
                        triggerSequentialAgentResponse(lastMessage);
                    }, 100);
                }
            }
        }
    }, [triggerInitialResponse, initialMessages, agents, setIsQuestioningEnabled, triggerSequentialAgentResponse]);

    const handleSendMessage = useCallback(() => {
        // Only validate that input is not empty - allow sending anytime
        if (!input.trim()) {
            safeSetTooltipMessage("Please enter a message");
            safeSetShowTooltip(true);
            
            // Hide tooltip after 3 seconds
            createManagedTimeout(() => {
                safeSetShowTooltip(false);
            }, 3000);
            
            return;
        }

        // Cancel any ongoing agent responses when user interrupts
        cancelOngoingResponses();

        const userMessage: Message = {
            id: getUniqueMessageId(),
            sender: "user",
            text: input,
            timestamp: new Date().toISOString(),
        };

        setInput("");
        
        // Handle the user message (Bob will respond based on scenario)
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
                                : "Waiting for response..."
                        }
                        className="flex-1 bg-white bg-opacity-10 border border-gray-700 rounded-md p-3 text-white resize-none h-16"
                        disabled={!isQuestioningEnabled}
                    />
                    <button
                        onClick={handleSendMessage}
                        disabled={!input.trim() || !isQuestioningEnabled}
                        className="px-5 py-3 rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-700 disabled:text-gray-400"
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SingleScenarioChat;
