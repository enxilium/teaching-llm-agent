import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Message } from "@/utils/types";
import { Agent } from "@/lib/agents";
import { aiService } from "@/services/AI";
import TypewriterTextWrapper from "./TypewriterTextWrapper";
import { formatMessageForDisplay } from "@/lib/utils";
import RenderMathExpression from "./RenderMathExpression";

interface ChatProps {
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

const Chat: React.FC<ChatProps> = ({
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
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const interventionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const followUpInProgressRef = useRef(false);
    const followUpCountRef = useRef(0); // Track follow-up rounds
    const agentResponseInProgressRef = useRef(false); // Prevent multiple simultaneous responses
    const lastRespondentTypeRef = useRef<"bot" | "user" | null>(null); // Track who responded last for alternating
    const hasInitialResponseStarted = useRef(false); // Track if initial response sequence has started
    const nextMessageIdRef = useRef(
        Math.max(...initialMessages.map((m) => m.id), 0) + 1
    );

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
        setTypingMessageIds((prev) => [...prev, messageId]);
    };

    const removeTypingMessageId = (messageId: number) => {
        setTypingMessageIds((prev) => prev.filter((id) => id !== messageId));
        // Auto-scroll to bottom when typing completes
        scrollToBottom();
    };

    const scrollToBottom = () => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTo({
                top: chatContainerRef.current.scrollHeight,
                behavior: 'smooth'
            });
        }
    };

    // Alice's initial message (responds to user's answer)
    const aliceInitialMessage = useCallback(
        async (conversationHistory: Message[]) => {
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

            setMessages(prev => [...prev, placeholder]);
            addTypingMessageId(placeholderId);

            try {
                let enhancedSystemPrompt = aliceAgent.systemPrompt + `\n\n[Response ID: ${aliceAgent.id}-${Date.now()}-${Math.random().toFixed(6)}]`;
                
                enhancedSystemPrompt += `\n\nYou are Alice, a student who just heard another student answer this math problem.

TASK: React to their answer as a fellow student:
- Say if you agree or disagree with their answer
- Give your own answer showing good conceptual understanding but making arithmetic errors
- Be brief and natural (1-2 sentences)
- Don't start with formal phrases like "Absolutely" - respond like a real student
- Don't use any special formatting like asterisks, bold, or markdown

Example: "I agree with your approach! I got..." or "Actually, I think it's different. I calculated..."`;

                // Add current question context
                if (currentQuestion) {
                    enhancedSystemPrompt += `\n\nMATH PROBLEM: "${currentQuestion.question}"`;
                    if (currentQuestion.options) {
                        enhancedSystemPrompt += `\nOPTIONS: ${Array.isArray(currentQuestion.options) ? currentQuestion.options.join(", ") : Object.values(currentQuestion.options).join(", ")}`;
                    }
                }

                const response = await aiService.generateResponse(
                    conversationHistory,
                    {
                        systemPrompt: enhancedSystemPrompt,
                        model: aliceAgent.model,
                        temperature: 0.8,
                    }
                );

                const finalMessage: Message = {
                    id: placeholderId,
                    sender: "ai",
                    agentId: aliceAgent.id,
                    text: response,
                    timestamp: new Date().toISOString(),
                };

                setMessages(prev => prev.map(msg => 
                    msg.id === placeholderId ? finalMessage : msg
                ));
                
                removeTypingMessageId(placeholderId);
                onNewMessage(finalMessage);
                return finalMessage;
            } catch (error) {
                console.error("Error generating Alice's initial message:", error);
                return null;
            }
        },
        [agents, getUniqueMessageId, setMessages, addTypingMessageId, removeTypingMessageId, currentQuestion, onNewMessage]
    );

    // Alice's generate message (responds to previous message)
    const generateAliceMessage = useCallback(
        async (previousMessage: Message) => {
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

            setMessages(prev => [...prev, placeholder]);
            addTypingMessageId(placeholderId);

            try {
                let enhancedSystemPrompt = aliceAgent.systemPrompt + `\n\n[Response ID: ${aliceAgent.id}-${Date.now()}-${Math.random().toFixed(6)}]`;
                
                // Determine if this is group scenario (no Bob) or multi scenario (with Bob)
                const hasBob = agents.some(agent => agent.id === "bob");
                const isGroupScenario = !hasBob;
                
                if (isGroupScenario) {
                    // Group scenario: Alice should respond and then prompt the user
                    enhancedSystemPrompt += `\n\nYou are Alice, a student in a group discussion. You just heard someone say: "${previousMessage.text}"

TASK: 
1. Respond naturally as Alice would in this conversation:
   - React to what they said (agree/disagree/comment)
   - If giving your own answer, make arithmetic errors but show good conceptual understanding
   - Keep it conversational and brief (1-2 sentences)
2. Then ask the user a follow-up question to keep the discussion going:
   - Ask about their reasoning, approach, or a related concept
   - Be curious and engaging like a real student would be

FORMAT: 
[Your response to what they said] [Then ask user a question]

Example: "I think that's right, but I got a different answer when I calculated it. @User, can you explain how you got that step?"

IMPORTANT: 
- Don't use any special formatting like asterisks, bold, or markdown
- End with "@User, [your specific question]"`;
                } else {
                    // Multi scenario: Alice responds normally (Bob manages the conversation)
                    enhancedSystemPrompt += `\n\nYou are Alice, a student in this math conversation. You just heard someone say: "${previousMessage.text}"

TASK: Respond naturally as Alice would in this conversation:
- React to what they said (agree/disagree/comment)
- If giving your own answer, make arithmetic errors but show good conceptual understanding
- Keep it conversational and brief (1-2 sentences)
- Don't start with "Absolutely" or "Certainly" - respond like a real student would
- Don't use any special formatting like asterisks, bold, or markdown

Example good responses: "I agree!" or "Actually, I think it's..." or "Wait, let me try..." or "That makes sense, but..."`;
                }

                const response = await aiService.generateResponse(
                    [previousMessage],
                    {
                        systemPrompt: enhancedSystemPrompt,
                        model: aliceAgent.model,
                        temperature: 0.8,
                    }
                );

                const finalMessage: Message = {
                    id: placeholderId,
                    sender: "ai",
                    agentId: aliceAgent.id,
                    text: response,
                    timestamp: new Date().toISOString(),
                };

                setMessages(prev => prev.map(msg => 
                    msg.id === placeholderId ? finalMessage : msg
                ));
                
                removeTypingMessageId(placeholderId);
                onNewMessage(finalMessage);
                
                // In group scenario, set up alternating for future responses
                const bobExists = agents.some(agent => agent.id === "bob");
                const isGroupMode = !bobExists;
                if (isGroupMode) {
                    lastRespondentTypeRef.current = "bot"; // Alice just responded, so next should be user
                    setIsQuestioningEnabled(true); // Enable user input
                }
                
                return finalMessage;
            } catch (error) {
                console.error("Error generating Alice's message:", error);
                return null;
            }
        },
        [agents, getUniqueMessageId, setMessages, addTypingMessageId, removeTypingMessageId, onNewMessage, setIsQuestioningEnabled]
    );

    // Charlie's initial message (responds to user's and Alice's answers)
    const charlieInitialMessage = useCallback(
        async (conversationHistory: Message[]) => {
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

            setMessages(prev => [...prev, placeholder]);
            addTypingMessageId(placeholderId);

            try {
                let enhancedSystemPrompt = charlieAgent.systemPrompt + `\n\n[Response ID: ${charlieAgent.id}-${Date.now()}-${Math.random().toFixed(6)}]`;
                
                // Extract what the user and Alice specifically said
                const userMessage = conversationHistory.find(msg => msg.sender === "user");
                const aliceMessage = conversationHistory.find(msg => msg.agentId === "arithmetic");
                
                // Determine if this is group scenario (no Bob) or multi scenario (with Bob)
                const hasBob = agents.some(agent => agent.id === "bob");
                const isGroupScenario = !hasBob;
                
                if (isGroupScenario) {
                    // Group scenario: Charlie should respond and then prompt the user for more discussion
                    enhancedSystemPrompt += `\n\nYou are Charlie, a student in a group discussion who just heard two other students answer this math problem.

WHAT THEY SAID:
- User said: "${userMessage?.text || "No response"}"
- Alice said: "${aliceMessage?.text || "No response"}"

TASK: 
1. React to both their answers as a fellow student:
   - Look at what each student said and their reasoning
   - Give your own answer using wrong conceptual approach but correct arithmetic within that approach
   - Be brief and slightly argumentative (1-2 sentences)
2. Then ask the user a follow-up question to keep the discussion going:
   - Ask about their reasoning, approach, or a related concept
   - Be curious and engaging like a real student would be

FORMAT: 
[Your response to their answers] [Then ask user a question]

Example: "I disagree with your approach, I think we should multiply first and got X. @User, why did you choose to add before multiplying?"

IMPORTANT: 
- Don't use any special formatting like asterisks, bold, or markdown
- End with "@User, [your specific question]"`;
                } else {
                    // Multi scenario: Charlie responds normally (Bob will follow up)
                    enhancedSystemPrompt += `\n\nYou are Charlie, a student who just heard two other students answer this math problem.

WHAT THEY SAID:
- User said: "${userMessage?.text || "No response"}"
- Alice said: "${aliceMessage?.text || "No response"}"

TASK: React to both their answers as a fellow student:
- Look at what each student said and their reasoning
- Give your own answer using wrong conceptual approach but correct arithmetic within that approach
- Be brief and slightly argumentative (1-2 sentences)
- Only claim someone is "wrong" if their final answer is actually different from yours
- Don't start with formal phrases - respond like a real student
- Don't use any special formatting like asterisks, bold, or markdown

IMPORTANT: If your calculation leads to the same answer as someone else, acknowledge that but explain your different method.

Example: "I got the same answer as Alice, but I used a different method..." or "I disagree with your approach..." or "Actually, I think we should..."`;
                }

                // Add current question context
                if (currentQuestion) {
                    enhancedSystemPrompt += `\n\nMATH PROBLEM: "${currentQuestion.question}"`;
                    if (currentQuestion.options) {
                        enhancedSystemPrompt += `\nOPTIONS: ${Array.isArray(currentQuestion.options) ? currentQuestion.options.join(", ") : Object.values(currentQuestion.options).join(", ")}`;
                    }
                }

                const response = await aiService.generateResponse(
                    conversationHistory,
                    {
                        systemPrompt: enhancedSystemPrompt,
                        model: charlieAgent.model,
                        temperature: 0.8,
                    }
                );

                const finalMessage: Message = {
                    id: placeholderId,
                    sender: "ai",
                    agentId: charlieAgent.id,
                    text: response,
                    timestamp: new Date().toISOString(),
                };

                setMessages(prev => prev.map(msg => 
                    msg.id === placeholderId ? finalMessage : msg
                ));
                
                removeTypingMessageId(placeholderId);
                onNewMessage(finalMessage);
                
                // In group scenario, set up alternating for future responses
                if (isGroupScenario) {
                    lastRespondentTypeRef.current = "bot"; // Charlie just responded, so next should be user
                }
                
                return finalMessage;
            } catch (error) {
                console.error("Error generating Charlie's initial message:", error);
                return null;
            }
        },
        [agents, getUniqueMessageId, setMessages, addTypingMessageId, removeTypingMessageId, currentQuestion, onNewMessage]
    );

    // Charlie's generate message (responds to previous message)
    const generateCharlieMessage = useCallback(
        async (previousMessage: Message) => {
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

            setMessages(prev => [...prev, placeholder]);
            addTypingMessageId(placeholderId);

            try {
                let enhancedSystemPrompt = charlieAgent.systemPrompt + `\n\n[Response ID: ${charlieAgent.id}-${Date.now()}-${Math.random().toFixed(6)}]`;
                
                // Determine if this is group scenario (no Bob) or multi scenario (with Bob)
                const hasBob = agents.some(agent => agent.id === "bob");
                const isGroupScenario = !hasBob;
                
                if (isGroupScenario) {
                    // Group scenario: Charlie should respond and then prompt the user
                    enhancedSystemPrompt += `\n\nYou are Charlie, a student in a group discussion. You just heard someone say: "${previousMessage.text}"

TASK: 
1. Respond naturally as Charlie would in this conversation:
   - React to what they said (agree/disagree/comment) 
   - If giving your own answer, use wrong conceptual approach but correct arithmetic
   - Be brief and slightly argumentative (1-2 sentences)
2. Then ask the user a follow-up question to keep the discussion going:
   - Ask about their reasoning, approach, or a related concept
   - Be curious and challenging like a real student would be

FORMAT: 
[Your response to what they said] [Then ask user a question]

Example: "I disagree with that approach, I think we should use multiplication instead and got X. @User, why did you choose that method over this one?"

IMPORTANT: 
- Don't use any special formatting like asterisks, bold, or markdown
- End with "@User, [your specific question]"`;
                } else {
                    // Multi scenario: Charlie responds normally (Bob manages the conversation)
                    enhancedSystemPrompt += `\n\nYou are Charlie, a student in this math conversation. You just heard someone say: "${previousMessage.text}"

TASK: Respond naturally as Charlie would in this conversation:
- React to what they said (agree/disagree/comment) 
- If giving your own answer, use wrong conceptual approach but correct arithmetic
- Be brief and slightly argumentative (1-2 sentences)
- Don't start with "Absolutely" or "Certainly" - respond like a real student would
- Don't use any special formatting like asterisks, bold, or markdown

Example good responses: "I disagree!" or "That's not right..." or "Actually, I think we should..." or "Hold on, I got..."`;
                }

                const response = await aiService.generateResponse(
                    [previousMessage],
                    {
                        systemPrompt: enhancedSystemPrompt,
                        model: charlieAgent.model,
                        temperature: 0.8,
                    }
                );

                const finalMessage: Message = {
                    id: placeholderId,
                    sender: "ai",
                    agentId: charlieAgent.id,
                    text: response,
                    timestamp: new Date().toISOString(),
                };

                setMessages(prev => prev.map(msg => 
                    msg.id === placeholderId ? finalMessage : msg
                ));
                
                removeTypingMessageId(placeholderId);
                onNewMessage(finalMessage);
                
                // In group scenario, set up alternating for future responses
                const bobPresent = agents.some(agent => agent.id === "bob");
                const isGroupMode = !bobPresent;
                if (isGroupMode) {
                    lastRespondentTypeRef.current = "bot"; // Charlie just responded, so next should be user
                    setIsQuestioningEnabled(true); // Enable user input
                }
                
                return finalMessage;
            } catch (error) {
                console.error("Error generating Charlie's message:", error);
                return null;
            }
        },
        [agents, getUniqueMessageId, setMessages, addTypingMessageId, removeTypingMessageId, onNewMessage, setIsQuestioningEnabled]
    );

    // Bob's initial message (provides feedback and prompts next participant)
    const bobInitialMessage = useCallback(
        async (conversationHistory: Message[]) => {
            const bobAgent = agents.find(agent => agent.id === "bob");
            if (!bobAgent) return null;

            // Select next participant based on available agents
            const hasAlice = agents.some(agent => agent.id === "arithmetic");
            const hasCharlie = agents.some(agent => agent.id === "concept");
            
            let nextParticipant: string;
            if (hasAlice && hasCharlie) {
                // Multi scenario: Randomly select from all participants
                const participants = ["Alice", "Charlie", "@User"];
                nextParticipant = participants[Math.floor(Math.random() * participants.length)];
            } else {
                // Single scenario: Only user can respond
                nextParticipant = "@User";
            }
            
            // Track what type of participant we're selecting for alternating logic
            lastRespondentTypeRef.current = nextParticipant === "@User" ? "user" : "bot";

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
                let enhancedSystemPrompt = bobAgent.systemPrompt + `\n\n[Response ID: ${bobAgent.id}-${Date.now()}-${Math.random().toFixed(6)}]`;
                
                // Extract the specific messages from conversation history
                const userMessage = conversationHistory.find(msg => msg.sender === "user");
                const aliceMessage = conversationHistory.find(msg => msg.agentId === "arithmetic");
                const charlieMessage = conversationHistory.find(msg => msg.agentId === "concept");
                
                console.log("Bob's conversation analysis:");
                console.log("User message:", userMessage?.text || "No response");
                console.log("Alice message:", aliceMessage?.text || "No response");
                console.log("Charlie message:", charlieMessage?.text || "No response");
                
                // Determine which agents are present
                const hasAlice = agents.some(agent => agent.id === "arithmetic");
                const hasCharlie = agents.some(agent => agent.id === "concept");
                console.log("Scenario - hasAlice:", hasAlice, "hasCharlie:", hasCharlie);
                
                if (hasAlice && hasCharlie) {
                    // Multi scenario: Give feedback to all three participants
                    enhancedSystemPrompt += `\n\nYou are Bob, the tutor in this math conversation. Review what everyone said and give specific feedback.

CONVERSATION SUMMARY:
- User said: "${userMessage?.text || "No response"}"
- Alice (Arithmetic Gap student) said: "${aliceMessage?.text || "No response"}"
- Charlie (Concept Gap student) said: "${charlieMessage?.text || "No response"}"

TASK: 
1. Give specific feedback to each person by name (don't repeat their full quotes, just reference what they did):
   - Comment on the User's approach and any errors
   - Comment on Alice's arithmetic errors but good conceptual understanding
   - Comment on Charlie's conceptual errors but good arithmetic
2. Solve the problem step-by-step showing the correct method
3. End by directly asking ${nextParticipant} a specific follow-up question

FORMAT: Be concise - reference their work without repeating full quotes. Don't use any special formatting like asterisks, bold, or markdown.

IMPORTANT: End with "${nextParticipant}, [specific question for them]"`;
                } else {
                    // Single scenario: Give feedback only to the user
                    enhancedSystemPrompt += `\n\nYou are Bob, the tutor working one-on-one with a student. Review their answer and provide helpful feedback.

STUDENT'S RESPONSE:
- User said: "${userMessage?.text || "No response"}"

TASK: 
1. Give specific feedback on the user's approach and answer:
   - What did they get right?
   - What errors did they make?
   - How can they improve their understanding?
2. Solve the problem step-by-step showing the correct method
3. Ask the user a specific follow-up question to deepen their understanding

FORMAT: Be encouraging and educational. Don't use any special formatting like asterisks, bold, or markdown.

IMPORTANT: End with "@User, [specific question for them]"`;
                }

                // Add current question context including correct answer
                if (currentQuestion) {
                    enhancedSystemPrompt += `\n\nMATH PROBLEM: "${currentQuestion.question}"`;
                    if (currentQuestion.options) {
                        enhancedSystemPrompt += `\nOPTIONS: ${Array.isArray(currentQuestion.options) ? currentQuestion.options.join(", ") : Object.values(currentQuestion.options).join(", ")}`;
                    }
                    if (currentQuestion.correctAnswer) {
                        enhancedSystemPrompt += `\nCORRECT ANSWER: ${currentQuestion.correctAnswer}`;
                    }
                }

                const response = await aiService.generateResponse(
                    conversationHistory,
                    {
                        systemPrompt: enhancedSystemPrompt,
                        model: bobAgent.model,
                        temperature: 0.6,
                    }
                );

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

                // Handle next participant
                setTimeout(() => {
                    if (nextParticipant === "Alice") {
                        generateAliceMessage(finalMessage).then((aliceResponse) => {
                            if (aliceResponse) {
                                // Wait for Alice's message to finish typing before Bob responds
                                const waitForTyping = () => {
                                    if (!typingMessageIds.includes(aliceResponse.id)) {
                                        setTimeout(() => {
                                            generateBobMessage([finalMessage, aliceResponse]);
                                        }, 2000);
                                    } else {
                                        setTimeout(waitForTyping, 100);
                                    }
                                };
                                setTimeout(waitForTyping, 500);
                            }
                        });
                    } else if (nextParticipant === "Charlie") {
                        generateCharlieMessage(finalMessage).then((charlieResponse) => {
                            if (charlieResponse) {
                                // Wait for Charlie's message to finish typing before Bob responds
                                const waitForTyping = () => {
                                    if (!typingMessageIds.includes(charlieResponse.id)) {
                                        setTimeout(() => {
                                            generateBobMessage([finalMessage, charlieResponse]);
                                        }, 2000);
                                    } else {
                                        setTimeout(waitForTyping, 100);
                                    }
                                };
                                setTimeout(waitForTyping, 500);
                            }
                        });
                    }
                    // If @User, do nothing - user will respond manually
                }, 3000);

                return finalMessage;
            } catch (error) {
                console.error("Error generating Bob's initial message:", error);
                return null;
            }
        },
        [agents, getUniqueMessageId, setMessages, addTypingMessageId, removeTypingMessageId, currentQuestion, onNewMessage, generateAliceMessage, generateCharlieMessage]
    );

    // Bob's generate message (responds to previous TWO messages for context)
    const generateBobMessage = useCallback(
        async (conversationHistory: Message[], autoTriggerNext: boolean = true) => {
            const bobAgent = agents.find(agent => agent.id === "bob");
            if (!bobAgent) return null;

            // Alternate participant selection based on who responded last and available agents
            let nextParticipant: string;
            const hasAlice = agents.some(agent => agent.id === "arithmetic");
            const hasCharlie = agents.some(agent => agent.id === "concept");
            
            if (hasAlice || hasCharlie) {
                // Multi scenario: Alternate between bots and user
                if (lastRespondentTypeRef.current === "user") {
                    // If user responded last, choose a bot
                    const botParticipants = [];
                    if (hasAlice) botParticipants.push("Alice");
                    if (hasCharlie) botParticipants.push("Charlie");
                    nextParticipant = botParticipants[Math.floor(Math.random() * botParticipants.length)];
                    lastRespondentTypeRef.current = "bot";
                } else {
                    // If bot responded last (or first time), choose user
                    nextParticipant = "@User";
                    lastRespondentTypeRef.current = "user";
                }
            } else {
                // Single scenario: Only user can respond
                nextParticipant = "@User";
                lastRespondentTypeRef.current = "user";
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
                let enhancedSystemPrompt = bobAgent.systemPrompt + `\n\n[Response ID: ${bobAgent.id}-${Date.now()}-${Math.random().toFixed(6)}]`;
                
                // Extract the last two messages for context
                const lastTwoMessages = conversationHistory.slice(-2);
                
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
                
                // Identify who responded
                const respondentName = studentResponse?.agentId === "arithmetic" ? "Alice" : 
                                     studentResponse?.agentId === "concept" ? "Charlie" : 
                                     studentResponse?.sender === "user" ? "the user" : "someone";

                console.log("Bob generate message context:");
                console.log("Bob's previous message:", bobPreviousMessage?.text?.substring(0, 100) || "Not found");
                console.log("Student response:", studentResponse?.text?.substring(0, 100) || "Not found");
                console.log("Respondent:", respondentName);
                console.log("Auto trigger next:", autoTriggerNext);
                
                enhancedSystemPrompt += `\n\nYou are Bob in this ongoing math conversation. You previously asked a question and someone just responded.

CONVERSATION CONTEXT:
- You previously said: "${bobPreviousMessage?.text || "Previous message not found"}"
- ${respondentName} just responded: "${studentResponse?.text || "No response found"}"

TASK: 
1. Acknowledge ${respondentName}'s specific response to your previous question
2. Give feedback on their answer - what did they get right or wrong?
3. ${autoTriggerNext ? `Ask ${nextParticipant} a new follow-up question to continue the discussion` : 'Ask a follow-up question to continue the discussion'}

IMPORTANT: 
- Reference what ${respondentName} specifically said in response to your question
- Be concise and don't repeat full quotes
- ${autoTriggerNext ? `End with "${nextParticipant}, [new question]...` : '[Follow-up question]...'}"
- Don't use any special formatting like asterisks, bold, or markdown

Example: "Thanks ${respondentName}, I see you said [brief reference to their response]. That's [feedback]. ${autoTriggerNext ? `${nextParticipant}, [new question]...` : '[Follow-up question]...'}"`;

                // Add current question context if available
                if (currentQuestion && currentQuestion.correctAnswer) {
                    enhancedSystemPrompt += `\n\nORIGINAL PROBLEM CORRECT ANSWER: ${currentQuestion.correctAnswer}`;
                }

                const response = await aiService.generateResponse(
                    conversationHistory, // Pass full conversation history for context
                    {
                        systemPrompt: enhancedSystemPrompt,
                        model: bobAgent.model,
                        temperature: 0.6,
                    }
                );

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

                // Only handle next participant if autoTriggerNext is true
                if (autoTriggerNext) {
                    setTimeout(() => {
                        if (nextParticipant === "Alice") {
                            generateAliceMessage(finalMessage).then((aliceResponse) => {
                                if (aliceResponse) {
                                    // Wait for Alice's message to finish typing before Bob responds
                                    const waitForTyping = () => {
                                        if (!typingMessageIds.includes(aliceResponse.id)) {
                                            setTimeout(() => {
                                                const newHistory = [...messages, finalMessage, aliceResponse];
                                                generateBobMessage(newHistory);
                                            }, 2000);
                                        } else {
                                            setTimeout(waitForTyping, 100);
                                        }
                                    };
                                    setTimeout(waitForTyping, 500);
                                }
                            });
                        } else if (nextParticipant === "Charlie") {
                            generateCharlieMessage(finalMessage).then((charlieResponse) => {
                                if (charlieResponse) {
                                    // Wait for Charlie's message to finish typing before Bob responds
                                    const waitForTyping = () => {
                                        if (!typingMessageIds.includes(charlieResponse.id)) {
                                            setTimeout(() => {
                                                const newHistory = [...messages, finalMessage, charlieResponse];
                                                generateBobMessage(newHistory);
                                            }, 2000);
                                        } else {
                                            setTimeout(waitForTyping, 100);
                                        }
                                    };
                                    setTimeout(waitForTyping, 500);
                                }
                            });
                        }
                        // If @User, do nothing - user will respond manually
                    }, 2000);
                }

                return finalMessage;
            } catch (error) {
                console.error("Error generating Bob's message:", error);
                return null;
            }
        },
        [agents, getUniqueMessageId, setMessages, addTypingMessageId, removeTypingMessageId, currentQuestion, onNewMessage, generateAliceMessage, generateCharlieMessage, messages]
    );

    // Simplified sequential agent response function
    const triggerSequentialAgentResponse = useCallback(
        async (userMessage: Message, isIntervention = false) => {
            if (agentResponseInProgressRef.current) {
                console.log("Agent response already in progress, skipping");
                return;
            }
            
            agentResponseInProgressRef.current = true;
            
            try {
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

                // Determine which agents are available
                const hasAlice = agents.some(agent => agent.id === "arithmetic");
                const hasCharlie = agents.some(agent => agent.id === "concept");
                const hasBob = agents.some(agent => agent.id === "bob");

                console.log(`Initial response scenario - Alice: ${hasAlice}, Charlie: ${hasCharlie}, Bob: ${hasBob}`);

                if (hasAlice && hasCharlie && hasBob) {
                    // Multi scenario: Alice → Charlie → Bob sequence
                    console.log("Multi scenario: Generating Alice's initial response...");
                    const aliceMessage = await aliceInitialMessage(conversationHistory);
                    if (!aliceMessage) return;
                    conversationHistory.push(aliceMessage);

                    // Wait a bit before Charlie responds
                    await new Promise(resolve => setTimeout(resolve, 1500));

                    console.log("Multi scenario: Generating Charlie's initial response...");
                    const charlieMessage = await charlieInitialMessage(conversationHistory);
                    if (!charlieMessage) return;
                    conversationHistory.push(charlieMessage);

                    // Wait a bit before Bob responds
                    await new Promise(resolve => setTimeout(resolve, 1500));

                    console.log("Multi scenario: Generating Bob's initial response...");
                    await bobInitialMessage(conversationHistory);
                } else if (hasBob && !hasAlice && !hasCharlie) {
                    // Single scenario: Bob responds directly
                    console.log("Single scenario: Generating Bob's direct response...");
                    await bobInitialMessage(conversationHistory);
                } else if ((hasAlice || hasCharlie) && !hasBob) {
                    // Group scenario: Alice → Charlie sequence (like multi, but Charlie prompts user instead of Bob)
                    console.log("Group scenario: Starting Alice → Charlie sequence...");
                    
                    if (hasAlice && hasCharlie) {
                        // Both agents available: Full Alice → Charlie sequence
                        console.log("Group scenario: Generating Alice's initial response...");
                        const aliceMessage = await aliceInitialMessage(conversationHistory);
                        if (!aliceMessage) return;
                        conversationHistory.push(aliceMessage);

                        // Wait a bit before Charlie responds
                        await new Promise(resolve => setTimeout(resolve, 1500));

                        console.log("Group scenario: Generating Charlie's initial response (with user prompt)...");
                        await charlieInitialMessage(conversationHistory);
                    } else if (hasAlice) {
                        // Only Alice available
                        console.log("Group scenario: Only Alice available, generating her response...");
                        await aliceInitialMessage(conversationHistory);
                    } else if (hasCharlie) {
                        // Only Charlie available
                        console.log("Group scenario: Only Charlie available, generating his response...");
                        await charlieInitialMessage(conversationHistory);
                    }
                } else {
                    console.warn("Unknown agent configuration:", { hasAlice, hasCharlie, hasBob });
                }

                setIsQuestioningEnabled(true);
            } catch (error) {
                console.error("Error in sequential agent response:", error);
            } finally {
                agentResponseInProgressRef.current = false;
            }
        },
        [aliceInitialMessage, charlieInitialMessage, bobInitialMessage, setIsQuestioningEnabled, messages, agentContextMessage, agents]
    );

    // Handle user messages - different logic based on scenario
    const handleUserMessage = useCallback(
        async (userMessage: Message) => {
            // Prevent multiple simultaneous user message handling
            if (agentResponseInProgressRef.current) {
                console.log("Agent response already in progress, skipping user message handling");
                return;
            }
            
            agentResponseInProgressRef.current = true;
            
            try {
                // Add user message to conversation
                setMessages(prev => [...prev, userMessage]);
                onNewMessage(userMessage);
                setIsQuestioningEnabled(false);

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
                                setTimeout(checkTyping, 100);
                            }
                        };
                        setTimeout(checkTyping, 100);
                    });
                };

                await waitForCurrentTyping();

                // Determine response based on available agents
                const hasAlice = agents.some(agent => agent.id === "arithmetic");
                const hasCharlie = agents.some(agent => agent.id === "concept");
                const hasBob = agents.some(agent => agent.id === "bob");

                setTimeout(() => {
                    const conversationHistory = [...messages, userMessage];
                    
                    if (hasBob) {
                        // Determine if this is Multi or Single scenario
                        const isMultiScenario = hasAlice || hasCharlie;
                        
                        if (isMultiScenario) {
                            // Multi scenario - Bob responds and auto-triggers next participant
                            generateBobMessage(conversationHistory, true);
                        } else {
                            // Single scenario - Bob responds but doesn't auto-trigger (only user can respond)
                            generateBobMessage(conversationHistory, false);
                        }
                    } else if ((hasAlice || hasCharlie) && !hasBob) {
                        // Group scenario - random Alice/Charlie responds
                        const availableStudents = [];
                        if (hasAlice) availableStudents.push("Alice");
                        if (hasCharlie) availableStudents.push("Charlie");
                        
                        const randomStudent = availableStudents[Math.floor(Math.random() * availableStudents.length)];
                        
                        if (randomStudent === "Alice") {
                            generateAliceMessage(userMessage);
                        } else {
                            generateCharlieMessage(userMessage);
                        }
                    }
                    
                    // Release the lock after the timeout
                    agentResponseInProgressRef.current = false;
                }, 1000);
            } catch (error) {
                console.error("Error in handleUserMessage:", error);
                agentResponseInProgressRef.current = false;
            }
        },
        [generateBobMessage, generateAliceMessage, generateCharlieMessage, setMessages, onNewMessage, setIsQuestioningEnabled, agents, typingMessageIds]
    );

    // Effect to trigger initial agent responses after user submission (one-time only)
    useEffect(() => {
        if (triggerInitialResponse && initialMessages.length > 0 && agents.length > 0 && !hasInitialResponseStarted.current) {
            const lastMessage = initialMessages[initialMessages.length - 1];
            if (lastMessage.sender === "user") {
                const hasAgentResponses = messages.some(msg => 
                    msg.sender === "ai" && msg.timestamp > lastMessage.timestamp
                );
                
                // Check which agents are available
                const hasAlice = agents.some(agent => agent.id === "arithmetic");
                const hasCharlie = agents.some(agent => agent.id === "concept");
                const hasBob = agents.some(agent => agent.id === "bob");
                
                // Only trigger initial responses if no agent has responded yet
                if (!hasAgentResponses) {
                    hasInitialResponseStarted.current = true;
                    setTimeout(() => {
                        triggerSequentialAgentResponse(lastMessage);
                    }, 100);
                }
            }
        }
    }, [triggerInitialResponse, initialMessages, agents, setIsQuestioningEnabled, triggerSequentialAgentResponse]);

    const handleSendMessage = useCallback(() => {
        if (!input.trim() || !isQuestioningEnabled) return;

        const userMessage: Message = {
            id: getUniqueMessageId(),
            sender: "user",
            text: input,
            timestamp: new Date().toISOString(),
        };

        setInput("");
        
        // Handle the user message (Bob will respond and prompt next participant)
        handleUserMessage(userMessage);
    }, [input, isQuestioningEnabled, handleUserMessage]);

    const getAgentInfo = (agentId: string | null | undefined) => {
        if (!agentId) return { name: "User", avatar: "user_avatar.svg" };
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
                                    <div className="whitespace-pre-wrap break-words text-message">
                                        <RenderMathExpression
                                            text={msg.text || ""}
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
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
    );
};

export default Chat;
