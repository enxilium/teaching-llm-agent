import React, { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { Message } from "@/utils/types";
import { Agent } from "@/lib/agents";
import { aiService } from "@/services/AI";
import TypewriterTextWrapper from "./TypewriterTextWrapper";
import { formatMessageForDisplay } from "@/lib/utils";
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
    scratchboardContent?: string;
}

/**
 * MULTI SCENARIO CHAT FLOW:
 * 1. User submits answer
 * 2. Alice gives her answer (with arithmetic errors)
 * 3. Charlie gives his answer (with conceptual errors)
 * 4. Bob (teacher) analyzes all 3 solutions, provides feedback, and asks follow-up to someone
 * 5. If Bob asks Alice/Charlie: they respond, then Bob picks someone new
 * 6. If Bob asks User: user responds, then Bob picks someone new
 * 7. Alice/Charlie do NOT @mention User - only Bob handles user engagement
 * 8. User can always send a message to participate
 */
const MultiScenarioChat: React.FC<MultiScenarioChatProps> = ({
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
    const bobAgent = agents.find(a => a.id === "bob");
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

    // Parse @mentions from a message (for Bob's messages)
    const parseMention = useCallback((text: string): 'User' | 'Alice' | 'Charlie' | null => {
        const lowerText = text.toLowerCase();
        if (lowerText.includes('@user')) return 'User';
        if (lowerText.includes('@alice')) return 'Alice';
        if (lowerText.includes('@charlie')) return 'Charlie';
        return null;
    }, []);

    // Get random participant for Bob to address
    const getRandomParticipant = useCallback((): 'User' | 'Alice' | 'Charlie' => {
        const participants: ('User' | 'Alice' | 'Charlie')[] = ['User', 'Alice', 'Charlie'];
        return participants[Math.floor(Math.random() * participants.length)];
    }, []);

    // Generate Alice's response (student with arithmetic errors)
    const generateAliceResponse = useCallback(async (
        context: string,
        isInitialAnswer: boolean = false
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
            const prompt = `${aliceAgent.systemPrompt}

PROBLEM: ${currentQuestion?.question || "No problem provided"}
${scratchboardContent?.trim() ? `\nUser's scratchboard work:\n"""\n${scratchboardContent.trim()}\n"""` : ""}

${context}

As Alice (good at concepts but makes arithmetic errors), ${isInitialAnswer
    ? "give your answer to this problem. Show your reasoning with CORRECT concepts but make arithmetic calculation errors. Be confident. Keep it to 2-3 sentences."
    : "respond to what was said. Share your thoughts briefly, agreeing if the logic sounds right (even if your calculation differs). Keep it to 1-2 sentences."
}

IMPORTANT: Do NOT use @mentions. Bob (the teacher) handles the conversation flow. Just give your answer/response.
Remember: Use single $ for math like $x^2$. No markdown formatting. Stay confident - never admit errors. If someone else has similar concepts, agree with them!`;

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

    // Generate Charlie's response (student with conceptual errors)
    const generateCharlieResponse = useCallback(async (
        context: string,
        isInitialAnswer: boolean = false
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
            const prompt = `${charlieAgent.systemPrompt}

PROBLEM: ${currentQuestion?.question || "No problem provided"}
${scratchboardContent?.trim() ? `\nUser's scratchboard work:\n"""\n${scratchboardContent.trim()}\n"""` : ""}

${context}

As Charlie (good at arithmetic but makes conceptual errors), ${isInitialAnswer
    ? "give your answer to this problem. Show your reasoning with WRONG concepts/approach but CORRECT arithmetic. Be confident. Keep it to 2-3 sentences."
    : "respond to what was said. Share your thoughts briefly, agreeing if the arithmetic sounds right (even if your concept differs). Keep it to 1-2 sentences."
}

IMPORTANT: Do NOT use @mentions. Bob (the teacher) handles the conversation flow. Just give your answer/response.
Remember: Use single $ for math like $x^2$. No markdown formatting. Stay confident - never admit errors. If someone else has similar arithmetic, agree with them!`;

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

    // Generate Bob's response (teacher)
    const generateBobResponse = useCallback(async (
        context: string,
        isInitialFeedback: boolean = false,
    ): Promise<Message | null> => {
        if (isUnmountedRef.current || !bobAgent) return null;

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
            // Bob ALWAYS addresses the User in this new flow
            const targetParticipant = 'User';
            
            const prompt = `${bobAgent.systemPrompt}

PROBLEM: ${currentQuestion?.question || "No problem provided"}
CORRECT ANSWER: ${currentQuestion?.answer || currentQuestion?.correctAnswer || "Not available"}
${scratchboardContent?.trim() ? `\nUser's scratchboard work:\n"""\n${scratchboardContent.trim()}\n"""` : ""}

${context}

As Bob the teacher, ${isInitialFeedback
    ? `provide feedback on all three answers you just heard (User's, Alice's, and Charlie's). Compare them to the correct answer above. Be encouraging but point out specific errors. Then ask @${targetParticipant} a follow-up question to continue the discussion.`
    : `acknowledge what was just said, provide brief feedback, then ask @${targetParticipant} a follow-up question to continue the discussion.`
}

IMPORTANT: You MUST include exactly one @mention at the end (@User) to direct who should respond next. Do NOT ask Alice or Charlie.
Remember: Use single $ for math like $x^2$. No markdown formatting (no **bold** or *italics*).`;

            const response = await aiService.generateResponse([
                { id: 1, sender: "user", text: prompt, timestamp: new Date().toISOString() }
            ]);

            if (isUnmountedRef.current) return null;

            // Ensure Bob's response has a @mention
            let finalText = response;
            if (!parseMention(response)) {
                finalText = `${response}\n\n@${targetParticipant}, what do you think about this?`;
                console.log(`⚠️ Added missing @mention for ${targetParticipant}`);
            }

            const finalMessage: Message = {
                id: placeholderId,
                sender: "ai",
                agentId: bobAgent.id,
                text: finalText,
                timestamp: new Date().toISOString(),
            };

            setMessages(prev => prev.map(msg => msg.id === placeholderId ? finalMessage : msg));
            removeTypingMessageId(placeholderId);
            onNewMessage(finalMessage);

            return finalMessage;
        } catch (error) {
            console.error("Error generating Bob's response:", error);
            removeTypingMessageId(placeholderId);
            setMessages(prev => prev.filter(msg => msg.id !== placeholderId));
            return null;
        }
    }, [bobAgent, currentQuestion, scratchboardContent, getUniqueMessageId, addTypingMessageId, removeTypingMessageId, onNewMessage, parseMention]);

    // Handle Bob's mention - trigger the appropriate responder
    const handleBobMention = useCallback(async (bobMessage: Message) => {
        // Bob should primarily accept User interaction now
        console.log(`🎓 Bob spoke. Enabling User input.`);
        setIsQuestioningEnabled(true);
        agentResponseInProgressRef.current = false;
    }, [setIsQuestioningEnabled]);

    // Initial response sequence: User → Alice → Charlie → Bob
    const triggerInitialSequence = useCallback(async () => {
        if (agentResponseInProgressRef.current || !bobAgent || !aliceAgent || !charlieAgent) {
            console.log("⚠️ Cannot start initial sequence - missing agents or already in progress");
            return;
        }

        agentResponseInProgressRef.current = true;
        setIsQuestioningEnabled(false);

        const userAnswer = initialMessages[initialMessages.length - 1]?.text || "No answer";
        console.log("🚀 Starting MULTI scenario initial sequence");
        console.log(`📝 User's answer: "${userAnswer}"`);

        try {
            // Alice responds first
            console.log("🍎 Generating Alice's initial answer...");
            const aliceMsg = await generateAliceResponse(`The user said: "${userAnswer}"`, true);
            if (!aliceMsg || isUnmountedRef.current) return;

            // Wait, then Charlie responds
            await new Promise(resolve => setTimeout(resolve, 2000));
            if (isUnmountedRef.current) return;

            console.log("🔵 Generating Charlie's initial answer...");
            const charlieMsg = await generateCharlieResponse(
                `The user said: "${userAnswer}"\nAlice said: "${aliceMsg.text}"`,
                true
            );
            if (!charlieMsg || isUnmountedRef.current) return;

            // Wait, then Bob provides feedback and asks follow-up
            await new Promise(resolve => setTimeout(resolve, 2000));
            if (isUnmountedRef.current) return;

            console.log("🎓 Generating Bob's initial feedback...");
            const bobMsg = await generateBobResponse(
                `User's answer: "${userAnswer}"\nAlice's answer: "${aliceMsg.text}"\nCharlie's answer: "${charlieMsg.text}"`,
                true
            );
            if (!bobMsg || isUnmountedRef.current) return;

            // Enable user input - Bob will have tagged User
            setIsQuestioningEnabled(true);
            agentResponseInProgressRef.current = false;

        } catch (error) {
            console.error("Error in initial sequence:", error);
            agentResponseInProgressRef.current = false;
            setIsQuestioningEnabled(true);
        }
    }, [bobAgent, aliceAgent, charlieAgent, initialMessages, setIsQuestioningEnabled, generateAliceResponse, generateCharlieResponse, generateBobResponse]);

    // Trigger initial response
    useEffect(() => {
        if (triggerInitialResponse &&
            !hasInitialResponseStarted.current &&
            agents.length >= 3 &&
            initialMessages.length > 0) {

            hasInitialResponseStarted.current = true;
            console.log("🚀 Triggering MULTI scenario initial response sequence");

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

        // Bob always responds to user messages in multi scenario
        await new Promise(resolve => setTimeout(resolve, 1500));

        try {
            console.log("🎓 User spoke - Bob responding...");
            const bobMsg = await generateBobResponse(
                `The user just said: "${userMessage.text}"`,
                false
            );
            
            // Re-enable input after Bob responds
            if (bobMsg) {
                setIsQuestioningEnabled(true);
                agentResponseInProgressRef.current = false;
            } else {
                 setIsQuestioningEnabled(true);
                agentResponseInProgressRef.current = false;
            }
        } catch (error) {
            console.error("Error handling user message:", error);
            agentResponseInProgressRef.current = false;
            setIsQuestioningEnabled(true);
        }
    }, [input, getUniqueMessageId, onNewMessage, setIsQuestioningEnabled, generateBobResponse]);

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
                    placeholder={isQuestioningEnabled ? "Type your response..." : "Wait for the discussion..."}
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

export default MultiScenarioChat;
