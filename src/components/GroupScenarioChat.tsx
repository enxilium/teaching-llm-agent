import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Message } from "@/utils/types";
import { Agent } from "@/lib/agents";
import { aiService } from "@/services/AI";
import TypewriterTextWrapper from "./TypewriterTextWrapper";
import { formatMessageForDisplay } from "@/lib/utils";
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
    scratchboardContent?: string;
}

/**
 * GROUP SCENARIO CHAT FLOW:
 * 1. User submits answer
 * 2. Randomly pick Alice or Charlie to respond first with their answer
 * 3. The other follows with their answer
 * 4. Bots can @mention User or each other
 * 5. If bot mentions User → other bot stays silent, user's turn
 * 6. If bot mentions other bot → that bot responds and MUST mention User (prevent loops)
 * 7. User can @mention specific agents to trigger their response
 */
const GroupScenarioChat: React.FC<GroupScenarioChatProps> = ({
    agents,
    initialMessages,
    onNewMessage,
    isQuestioningEnabled,
    setIsQuestioningEnabled,
    triggerInitialResponse = false,
    currentQuestion,
    scratchboardContent,
}) => {
    const [messages, setMessages] = useState<Message[]>(initialMessages);
    const [input, setInput] = useState("");
    const [typingMessageIds, setTypingMessageIds] = useState<number[]>([]);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const hasInitialResponseStarted = useRef(false);
    const nextMessageIdRef = useRef(Math.max(...initialMessages.map((m) => m.id), 0) + 1);
    const isUnmountedRef = useRef(false);
    const agentResponseInProgressRef = useRef(false);

    // Get agents by their actual IDs
    const aliceAgent = agents.find(a => a.id === "arithmetic");
    const charlieAgent = agents.find(a => a.id === "concept");

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            isUnmountedRef.current = true;
        };
    }, []);

    // Auto-scroll
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages.length]);

    const getUniqueMessageId = useCallback(() => nextMessageIdRef.current++, []);
    
    const addTypingMessageId = useCallback((id: number) => {
        if (!isUnmountedRef.current) setTypingMessageIds(prev => [...prev, id]);
    }, []);

    const removeTypingMessageId = useCallback((id: number) => {
        if (!isUnmountedRef.current) setTypingMessageIds(prev => prev.filter(msgId => msgId !== id));
    }, []);

    // Parse @mentions from a message
    const parseMention = useCallback((text: string): 'User' | 'Alice' | 'Charlie' | null => {
        const lowerText = text.toLowerCase();
        if (lowerText.includes('@user')) return 'User';
        if (lowerText.includes('@alice')) return 'Alice';
        if (lowerText.includes('@charlie')) return 'Charlie';
        return null;
    }, []);

    // Generate Alice's response
    const generateAliceResponse = useCallback(async (
        context: string,
        isFirstResponse: boolean = false,
        mustMentionUser: boolean = false
    ): Promise<Message | null> => {
        if (isUnmountedRef.current || !aliceAgent) return null;

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
            let mentionInstruction = "";
            if (mustMentionUser) {
                mentionInstruction = "\n\nIMPORTANT: You MUST end your response by asking @User a question to keep them engaged.";
            } else if (!isFirstResponse) {
                mentionInstruction = "\n\nAt the end, choose ONE person to address with a question: either @User or @Charlie. Pick randomly.";
            }

            const prompt = `${aliceAgent.systemPrompt}

PROBLEM: ${currentQuestion?.question || "No problem provided"}
${scratchboardContent?.trim() ? `\nUser's scratchboard work:\n"""\n${scratchboardContent.trim()}\n"""` : ""}

${context}

As Alice (good at concepts but makes arithmetic errors), ${isFirstResponse 
    ? "give your answer to this problem. Show your reasoning with CORRECT concepts but make arithmetic calculation errors. Be confident. Keep it to 2-3 sentences."
    : "respond naturally to what was said. React and share your thoughts with arithmetic errors but correct concepts."
}${mentionInstruction}

Remember: Use single $ for math like $x^2$. No markdown formatting. Stay confident - never admit errors.`;

            const response = await aiService.generateResponse([
                { id: 1, sender: "user", text: prompt, timestamp: new Date().toISOString() }
            ]);

            if (isUnmountedRef.current) return null;

            const finalMessage: Message = {
                id: placeholderId,
                sender: "ai",
                agentId: aliceAgent.id,
                text: response,
                timestamp: new Date().toISOString(),
            };

            setMessages(prev => prev.map(msg => msg.id === placeholderId ? finalMessage : msg));
            removeTypingMessageId(placeholderId);
            onNewMessage(finalMessage);

            return finalMessage;
        } catch (error) {
            console.error("Error generating Alice's response:", error);
            removeTypingMessageId(placeholderId);
            setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
            return null;
        }
    }, [aliceAgent, currentQuestion, scratchboardContent, getUniqueMessageId, addTypingMessageId, removeTypingMessageId, onNewMessage]);

    // Generate Charlie's response
    const generateCharlieResponse = useCallback(async (
        context: string,
        isFirstResponse: boolean = false,
        mustMentionUser: boolean = false
    ): Promise<Message | null> => {
        if (isUnmountedRef.current || !charlieAgent) return null;

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
            let mentionInstruction = "";
            if (mustMentionUser) {
                mentionInstruction = "\n\nIMPORTANT: You MUST end your response by asking @User a question to keep them engaged.";
            } else if (!isFirstResponse) {
                mentionInstruction = "\n\nAt the end, choose ONE person to address with a question: either @User or @Alice. Pick randomly.";
            }

            const prompt = `${charlieAgent.systemPrompt}

PROBLEM: ${currentQuestion?.question || "No problem provided"}
${scratchboardContent?.trim() ? `\nUser's scratchboard work:\n"""\n${scratchboardContent.trim()}\n"""` : ""}

${context}

As Charlie (good at arithmetic but makes conceptual errors), ${isFirstResponse 
    ? "give your answer to this problem. Show your reasoning with WRONG concepts/approach but CORRECT arithmetic. Be confident. Keep it to 2-3 sentences."
    : "respond naturally to what was said. React and share your thoughts with correct arithmetic but conceptual errors."
}${mentionInstruction}

Remember: Use single $ for math like $x^2$. No markdown formatting. Stay confident - never admit errors.`;

            const response = await aiService.generateResponse([
                { id: 1, sender: "user", text: prompt, timestamp: new Date().toISOString() }
            ]);

            if (isUnmountedRef.current) return null;

            const finalMessage: Message = {
                id: placeholderId,
                sender: "ai",
                agentId: charlieAgent.id,
                text: response,
                timestamp: new Date().toISOString(),
            };

            setMessages(prev => prev.map(msg => msg.id === placeholderId ? finalMessage : msg));
            removeTypingMessageId(placeholderId);
            onNewMessage(finalMessage);

            return finalMessage;
        } catch (error) {
            console.error("Error generating Charlie's response:", error);
            removeTypingMessageId(placeholderId);
            setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
            return null;
        }
    }, [charlieAgent, currentQuestion, scratchboardContent, getUniqueMessageId, addTypingMessageId, removeTypingMessageId, onNewMessage]);

    // Handle the chain of responses after an agent message
    const handleAgentMention = useCallback(async (agentMessage: Message, isFromSecondAgent: boolean = false) => {
        const mention = parseMention(agentMessage.text);
        const respondingAgent = agentMessage.agentId === "arithmetic" ? "Alice" : "Charlie";
        
        console.log(`🔍 ${respondingAgent} mentioned: ${mention || 'nobody'}`);

        if (mention === 'User') {
            // Bot mentioned user - enable input, other bot stays silent
            console.log("👤 User was mentioned - enabling input");
            setIsQuestioningEnabled(true);
            agentResponseInProgressRef.current = false;
        } else if (mention === 'Alice' && respondingAgent === 'Charlie') {
            // Charlie mentioned Alice - Alice must respond and mention User
            console.log("🍎 Alice was mentioned by Charlie - Alice responds, must mention User");
            await new Promise(resolve => setTimeout(resolve, 1500));
            const aliceMsg = await generateAliceResponse(
                `Charlie just said: "${agentMessage.text}"`,
                false,
                true // Must mention user
            );
            if (aliceMsg) {
                setIsQuestioningEnabled(true);
                agentResponseInProgressRef.current = false;
            }
        } else if (mention === 'Charlie' && respondingAgent === 'Alice') {
            // Alice mentioned Charlie - Charlie must respond and mention User
            console.log("🔵 Charlie was mentioned by Alice - Charlie responds, must mention User");
            await new Promise(resolve => setTimeout(resolve, 1500));
            const charlieMsg = await generateCharlieResponse(
                `Alice just said: "${agentMessage.text}"`,
                false,
                true // Must mention user
            );
            if (charlieMsg) {
                setIsQuestioningEnabled(true);
                agentResponseInProgressRef.current = false;
            }
        } else {
            // No valid mention or self-mention - default to enabling user input
            console.log("💬 No actionable mention - enabling user input");
            setIsQuestioningEnabled(true);
            agentResponseInProgressRef.current = false;
        }
    }, [parseMention, setIsQuestioningEnabled, generateAliceResponse, generateCharlieResponse]);

    // Initial response sequence: both agents give their answers
    const triggerInitialSequence = useCallback(async () => {
        if (agentResponseInProgressRef.current || !aliceAgent || !charlieAgent) return;
        
        agentResponseInProgressRef.current = true;
        setIsQuestioningEnabled(false);

        const userAnswer = initialMessages[initialMessages.length - 1]?.text || "No answer";
        
        // Randomly pick first responder
        const firstIsAlice = Math.random() < 0.5;
        console.log(`🎲 First responder: ${firstIsAlice ? 'Alice' : 'Charlie'}`);

        try {
            // First agent responds
            const firstContext = `The user said: "${userAnswer}"`;
            let firstMsg: Message | null;
            
            if (firstIsAlice) {
                firstMsg = await generateAliceResponse(firstContext, true);
            } else {
                firstMsg = await generateCharlieResponse(firstContext, true);
            }

            if (!firstMsg || isUnmountedRef.current) return;

            // Wait a bit
            await new Promise(resolve => setTimeout(resolve, 2000));
            if (isUnmountedRef.current) return;

            // Second agent responds, addressing the first and the user
            const secondContext = `The user said: "${userAnswer}"\n${firstIsAlice ? 'Alice' : 'Charlie'} responded: "${firstMsg.text}"`;
            let secondMsg: Message | null;

            if (firstIsAlice) {
                secondMsg = await generateCharlieResponse(secondContext, false);
            } else {
                secondMsg = await generateAliceResponse(secondContext, false);
            }

            if (!secondMsg || isUnmountedRef.current) return;

            // Handle the mention chain from the second agent's response
            await handleAgentMention(secondMsg, true);

        } catch (error) {
            console.error("Error in initial sequence:", error);
            agentResponseInProgressRef.current = false;
            setIsQuestioningEnabled(true);
        }
    }, [aliceAgent, charlieAgent, initialMessages, setIsQuestioningEnabled, generateAliceResponse, generateCharlieResponse, handleAgentMention]);

    // Trigger initial response
    useEffect(() => {
        if (triggerInitialResponse && 
            !hasInitialResponseStarted.current && 
            agents.length >= 2 && 
            initialMessages.length > 0) {
            
            hasInitialResponseStarted.current = true;
            console.log("🚀 Starting GROUP scenario initial response sequence");
            
            setTimeout(() => {
                triggerInitialSequence();
            }, 1000);
        }
    }, [triggerInitialResponse, agents, initialMessages, triggerInitialSequence]);

    // Handle user sending a message
    const handleSendMessage = useCallback(async () => {
        if (!input.trim()) return;

        const userMessage: Message = {
            id: getUniqueMessageId(),
            sender: "user",
            text: input.trim(),
            timestamp: new Date().toISOString(),
        };

        setInput("");
        setMessages(prev => [...prev, userMessage]);
        onNewMessage(userMessage);
        setIsQuestioningEnabled(false);
        agentResponseInProgressRef.current = true;

        // Check if user mentioned a specific agent
        const mention = parseMention(userMessage.text);
        
        await new Promise(resolve => setTimeout(resolve, 1500));

        try {
            if (mention === 'Alice') {
                console.log("👤 User mentioned Alice specifically");
                const aliceMsg = await generateAliceResponse(
                    `The user said to you: "${userMessage.text}"`,
                    false
                );
                if (aliceMsg) await handleAgentMention(aliceMsg);
            } else if (mention === 'Charlie') {
                console.log("👤 User mentioned Charlie specifically");
                const charlieMsg = await generateCharlieResponse(
                    `The user said to you: "${userMessage.text}"`,
                    false
                );
                if (charlieMsg) await handleAgentMention(charlieMsg);
            } else {
                // No specific mention - random agent responds
                const respondIsAlice = Math.random() < 0.5;
                console.log(`💬 No specific mention - ${respondIsAlice ? 'Alice' : 'Charlie'} responds`);
                
                if (respondIsAlice) {
                    const aliceMsg = await generateAliceResponse(
                        `The user said: "${userMessage.text}"`,
                        false
                    );
                    if (aliceMsg) await handleAgentMention(aliceMsg);
                } else {
                    const charlieMsg = await generateCharlieResponse(
                        `The user said: "${userMessage.text}"`,
                        false
                    );
                    if (charlieMsg) await handleAgentMention(charlieMsg);
                }
            }
        } catch (error) {
            console.error("Error handling user message:", error);
            agentResponseInProgressRef.current = false;
            setIsQuestioningEnabled(true);
        }
    }, [input, getUniqueMessageId, onNewMessage, setIsQuestioningEnabled, parseMention, generateAliceResponse, generateCharlieResponse, handleAgentMention]);

    // Get display info for a message
    const getAgentDisplayInfo = (msg: Message) => {
        if (msg.sender === "user") {
            return { name: "You", avatar: "user.png" };
        }
        const agent = agents.find(a => a.id === msg.agentId);
        return { 
            name: agent?.name || "AI", 
            avatar: agent?.avatar || "user.png" 
        };
    };

    return (
        <div className="h-full w-1/2 pl-2 flex flex-col bg-black bg-opacity-50 backdrop-blur rounded-lg border border-gray-700 overflow-hidden">
            <div 
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto p-4 space-y-4"
                style={{ minHeight: 0 }}
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
                                className={`max-w-[85%] rounded-lg p-3 ${
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
                                        text={formatMessageForDisplay(msg.text || "")}
                                        speed={10}
                                        onTypingComplete={removeTypingMessageId}
                                        skip={false}
                                        formatMath={true}
                                    />
                                ) : (
                                    <MessageWithHighlights text={msg.text || ""} />
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
            <div className="mt-3 p-4 flex items-start gap-2">
                <textarea
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendMessage();
                        }
                    }}
                    placeholder={isQuestioningEnabled ? "Type your message... (use @Alice or @Charlie to address them)" : "Wait for agents to finish..."}
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
    );
};

export default GroupScenarioChat;
