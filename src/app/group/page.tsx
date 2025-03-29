'use client'

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import TypewriterText from '@/components/TypewriterText';
import { aiService, AI_MODELS } from '@/services/AI';
import { Message } from '@/utils/types';
import TypewriterTextWrapper from "@/components/TypewriterTextWrapper";
import { useFlow } from '@/context/FlowContext';

// Add these interfaces at the top of your file
interface Question {
  id?: string | number;
  question?: string;
  answer?: string;
  correctAnswer?: string;
  options?: Record<string, string>;
  [key: string]: any; // For any other properties
}

interface AIResponse {
  text?: string;
  content?: string;
  [key: string]: any; // For any other unexpected properties
}

export default function PeerOnlyPage() {
    const router = useRouter();
    const { currentStage, completeLesson } = useFlow();

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
    const [allQuestions, setAllQuestions] = useState<Question[]>([]);
    const [loadedQuestions, setLoadedQuestions] = useState(false);

    // Timer state
    const [timeLeft, setTimeLeft] = useState(120);
    const roundEndedRef = useRef(false);

    // Question tracking
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [usedQuestionIndices, setUsedQuestionIndices] = useState<number[]>([]);
    const [currentQuestion, setCurrentQuestion] = useState<string | Question>("");

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

    const getQuestionText = (question: any): string => {
        if (typeof question === 'string') return question;
        if (question && typeof question === 'object' && question.question) return question.question;
        return JSON.stringify(question);
    };

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
                const questions: Question[] = Object.values(data).flat() as Question[];
                
                setAllQuestions(questions);
                setLoadedQuestions(true);
                console.log("Loaded questions:", questions);
            } catch (error) {
                console.error("Error loading questions:", error);
                // Use fallback questions if we can't load from JSON
                setAllQuestions([
                    {
                        id: 1,
                        question: "In how many ways can four couples be seated at a round table if the men and women want to sit alternately?",
                        answer: "144"
                    },
                    {
                        id: 2,
                        question: "In how many different ways can five people be seated at a circular table?",
                        answer: "24"
                    },
                    {
                        id: 3,
                        question: "A shopping mall has a straight row of 5 flagpoles at its main entrance plaza. It has 3 identical green flags and 2 identical yellow flags. How many distinct arrangements of flags on the flagpoles are possible?",
                        answer: "10"
                    }
                ]);
                setLoadedQuestions(true);
            }
        };
        
        fetchQuestions();
    }, []);

    // Add this flow stage check effect after your other state declarations
    useEffect(() => {
        if (currentStage !== 'lesson') {
            console.warn(`Warning: User accessed group page in incorrect stage: ${currentStage}`);
            
            // Instead of immediate redirect, check localStorage directly as a fallback
            const storedStage = localStorage.getItem('currentStage');
            
            // Update localStorage if needed to match the current page
            if (storedStage !== 'lesson') {
                console.log('Updating localStorage to match current page (lesson)');
                localStorage.setItem('currentStage', 'lesson');
            }
        }
    }, [currentStage]);

    // Add this at the top of your component with other state declarations
    const nextMessageIdRef = useRef(3); // Start at 3 to match your initial state
    const botInteractionCountRef = useRef(0);
    const maxBotInteractions = 2; // Limit automatic interactions

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
        message = message.toLowerCase();
        
        // Look for explicit mentions
        const logicMentioned = message.includes('logic') || message.includes('logic bot');
        const patternMentioned = message.includes('pattern') || message.includes('pattern bot');
        
        // Return which bot(s) were mentioned, or null if none specifically mentioned
        if (logicMentioned && !patternMentioned) {
            return 'logic';
        } else if (patternMentioned && !logicMentioned) {
            return 'pattern';
        } else if (logicMentioned && patternMentioned) {
            return 'both';
        } else {
            return null; // No specific bot mentioned
        }
    };

    // Update the handleSend function to generate bot answers first
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

            // Generate bot answers first, then official solution
            generateBotFinalAnswers(currentQuestion);
        });
    };

    // Update autoSubmitTimeoutAnswer to also generate bot answers first
    const autoSubmitTimeoutAnswer = () => {
        console.log("Auto-submitting answer due to timeout");
        
        // Disable further questioning
        setIsQuestioningEnabled(false);
        roundEndedRef.current = true;
        
        // Only auto-submit if user has written something in the scratchboard
        if (scratchboardContent.trim()) {
            // Use a default final answer text if user hasn't entered one
            const submissionText = finalAnswer.trim() || "Time expired - Automatic submission";
            
            ensureNoTypingInProgress(() => {
                const userFinalAnswer: Message = {
                    id: getUniqueMessageId(),
                    sender: 'user',
                    text: `My final answer is: ${submissionText}\n\nMy reasoning:\n${scratchboardContent}`,
                    timestamp: new Date().toISOString()
                };

                setMessages(prev => [...prev, userFinalAnswer]);
                setFinalAnswer('');

                // Generate bot answers first, then official solution
                generateBotFinalAnswers(currentQuestion);
            });
        } else {
            // If scratchboard is empty, still show bot answers and official solution
            generateBotFinalAnswers(currentQuestion);
        }
    };

    const generateBotFinalAnswers = (question: string | Question) => {
        console.log("Generating bot final answers");
        
        // Generate Logic Bot's answer first
        const logicMessageId = getUniqueMessageId();
        
        // Add Logic Bot's message with typing indicator
        setMessages(prev => [...prev, {
            id: logicMessageId,
            sender: 'ai',
            text: '...',
            agentId: 'logic',
            timestamp: new Date().toISOString(),
            onComplete: () => {
                console.log("Logic Bot's answer completed, now showing Pattern Bot's answer");
                
                // Wait a short time before showing Pattern Bot's answer
                setTimeout(() => {
                    // Generate Pattern Bot's answer
                    const patternMessageId = getUniqueMessageId();
                    
                    // Add Pattern Bot's message with typing indicator
                    setMessages(prev => [...prev, {
                        id: patternMessageId,
                        sender: 'ai',
                        text: '...',
                        agentId: 'pattern',
                        timestamp: new Date().toISOString(),
                        onComplete: () => {
                            console.log("Pattern Bot's answer completed, now showing official solution");
                            
                            // Wait a short time before showing the official solution
                            setTimeout(() => {
                                generateOfficialSolution(question);
                            }, 1500);
                        }
                    }]);
                    
                    // Generate Pattern Bot's answer content
                    generateSingleBotAnswer(patternMessageId, agents[1], question);
                }, 1500);
            }
        }]);
        
        // Generate Logic Bot's answer content
        generateSingleBotAnswer(logicMessageId, agents[0], question);
    };

    // Update the generateSingleBotAnswer function to properly handle different response types
    // and ensure it has the full problem context
    const generateSingleBotAnswer = async (messageId: number, agent: any, question: string | Question) => {
        try {
            // Format the question text properly
            const questionText = typeof question === 'string' 
                ? question 
                : question?.question 
                    ? question.question 
                    : JSON.stringify(question);
            
            console.log(`Generating ${agent.name}'s final answer for question: ${questionText}`);
            
            // Generate bot's final answer with explicit problem context
            const response: string | AIResponse = await aiService.generateResponse(
                [
                    { 
                        id: 1, 
                        sender: 'user', 
                        text: `The problem we're working on is: ${questionText}
                        
As ${agent.name}, provide your own final answer to this problem.
Include your reasoning and solution process.
Keep your answer conversational and natural, as if you're sharing your solution with a peer.
Start with "My answer is..." and then explain how you solved it.

Make sure to clearly state the numerical or final result of your calculation.`
                    }
                ],
                {
                    systemPrompt: agent.systemPrompt,
                    model: currentModel
                }
            );
            
            // Properly handle different response types
            let stringResponse;
            if (typeof response === 'string') {
                stringResponse = response;
            } else if (response && typeof response === 'object') {
                // Use type assertion to help TypeScript understand this is an AIResponse
                const responseObj = response as AIResponse;
                
                // Check if the object has a text property
                if (typeof responseObj.text === 'string') {
                    stringResponse = responseObj.text;
                } else if (typeof responseObj.content === 'string') {
                    stringResponse = responseObj.content;
                } else {
                    // Last resort - try to stringify the object but with a clear message
                    try {
                        stringResponse = JSON.stringify(response);
                        // If it's just an empty object or unhelpful stringification, provide a better message
                        if (stringResponse === '{}' || stringResponse === '[object Object]') {
                            stringResponse = `I've calculated the solution to this problem through careful analysis of the pattern.`;
                        }
                    } catch (e) {
                        stringResponse = `I've found the answer through a step-by-step process.`;
                    }
                }
            } else {
                // Fallback for null, undefined, or other types
                stringResponse = `I've worked through this problem and found the solution.`;
            }
            
            // Make sure response starts with "My answer is"
            const formattedResponse = stringResponse.startsWith("My answer is") 
                ? stringResponse 
                : `My answer is: ${stringResponse}`;
            
            // Replace typing indicator with actual response
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: formattedResponse,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // Add to typing state for typewriter effect
            setTypingMessageIds(prev => [...prev, messageId]);
            
        } catch (error) {
            console.error(`Error generating ${agent.name}'s final answer:`, error);
            
            // Provide a fallback message if generation fails
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: `I think I've solved this problem, but I'm having trouble sharing my answer right now.`,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // Remove from typing state to prevent hanging
            setTypingMessageIds(prev => prev.filter(id => id !== messageId));
            setCompletedMessageIds(prev => [...prev, messageId]);
        }
    };

    // Completely replace the generateOfficialSolution function to use the answer from questions.json
    const generateOfficialSolution = async (question: string | Question) => {
        console.log("Generating official solution");
        
        // Add system message about the official solution
        const timeoutMessageId = getUniqueMessageId();
        setMessages(prev => [...prev, {
            id: timeoutMessageId,
            sender: 'system',
            text: 'Here is the official correct answer:',
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
            // Get the official answer directly from the question object
            let officialAnswer = "";
            
            // Format the question text for comparison
            const questionText = typeof question === 'string' 
                ? question 
                : question?.question 
                    ? question.question 
                    : JSON.stringify(question);
            
            console.log("Looking for answer to:", questionText);
            
            // First check if currentQuestion has an answer property
            if (typeof currentQuestion === 'object' && currentQuestion !== null) {
                // Use as to tell TypeScript this is a Question type with answer property
                const questionObj = currentQuestion as Question;
                if (questionObj.answer) {
                    officialAnswer = questionObj.answer;
                    console.log("Found answer in current question object:", officialAnswer);
                }
            }
            
            // If no answer found in currentQuestion, search in allQuestions
            if (!officialAnswer) {
                for (const q of allQuestions) {
                    if (typeof q === 'object' && q !== null) {
                        const qText = q.question || "";
                        
                        if (qText === questionText && q.answer) {
                            officialAnswer = q.answer;
                            console.log("Found answer in allQuestions:", officialAnswer);
                            break;
                        }
                    }
                }
            }
            
            // If still no answer found, provide a fallback
            if (!officialAnswer) {
                console.warn("No answer found in questions.json for:", questionText);
                officialAnswer = "The official answer could not be retrieved.";
            }
            
            // Replace typing indicator with official answer
            setMessages(prev => prev.map(msg =>
                msg.id === solutionMessageId
                    ? {
                        ...msg,
                        text: officialAnswer,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // Add to typing state for animation
            setTypingMessageIds(prev => [...prev, solutionMessageId]);
            
            // Set evaluation as complete to enable the "Proceed" button
            setEvaluationComplete(true);
            
        } catch (error) {
            console.error("Error providing official solution:", error);
            
            // Provide a fallback message
            setMessages(prev => prev.map(msg =>
                msg.id === solutionMessageId
                    ? {
                        ...msg,
                        text: "Sorry, I couldn't retrieve the official solution. Please proceed to the next part of the lesson.",
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

        // Reset bot interaction counter when user asks something
        botInteractionCountRef.current = 0;

        // Check if a specific bot was mentioned
        const mentionedBot = checkForBotMention(userMessage.text || "");
        
        // Generate AI responses based on which bot was mentioned
        generateAIResponse(userMessage.text || "", mentionedBot);
    };

    // Add this function after handleUserQuestion
    const triggerBotInteraction = async (currentResponder: string) => {
        // Check if we've reached the maximum number of automatic interactions
        if (botInteractionCountRef.current >= maxBotInteractions) {
            console.log("Maximum bot interactions reached, waiting for user input");
            return;
        }

        // Increment the interaction counter
        botInteractionCountRef.current += 1;

        if (roundEndedRef.current || typingMessageIds.length > 0 || !isQuestioningEnabled) {
            return; // Don't trigger new interactions if round ended or typing in progress
        }

        // Determine which bot should respond next (the opposite one)
        const nextResponder = currentResponder === 'logic' ? 'pattern' : 'logic';
        const nextAgent = agents.find(a => a.id === nextResponder);
        const currentAgent = agents.find(a => a.id === currentResponder);
        
        if (!nextAgent || !currentAgent) return;
        
        // Get the last few messages for context (up to 5)
        const recentMessages = messages.slice(-5);
        
        // Only proceed if the most recent message is from a bot (not the user)
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage || lastMessage.sender !== 'ai') return;
        
        console.log(`Triggering ${nextAgent.name} to respond to ${currentAgent.name}`);
        
        // Add small delay to make the interaction feel natural
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Skip if conditions have changed during the delay
        if (roundEndedRef.current || typingMessageIds.length > 0 || !isQuestioningEnabled) {
            return;
        }
        
        // Format the question text properly
        const questionText = typeof currentQuestion === 'string' 
            ? currentQuestion 
            : currentQuestion?.question 
                ? currentQuestion.question 
                : JSON.stringify(currentQuestion);

        try {
            // Show typing indicator
            const tempMessageId = getUniqueMessageId();
            setMessages(prev => [...prev, {
                id: tempMessageId,
                sender: 'ai',
                text: '...',
                agentId: nextResponder,
                timestamp: new Date().toISOString()
            }]);

            // Generate context-aware response
            const messagesForAI = [
                { 
                    id: 1, 
                    sender: 'user', 
                    text: `The problem we're working on is: ${questionText}` 
                }
            ];
            
            // Add recent conversation context
            recentMessages.forEach((msg, index) => {
                messagesForAI.push({
                    id: index + 2,
                    sender: msg.sender === 'ai' ? 'assistant' : 'user',
                    text: msg.sender === 'ai' 
                        ? `${agents.find(a => a.id === msg.agentId)?.name || 'AI'}: ${msg.text}` 
                        : `Student: ${msg.text}`
                });
            });
            
            // Add instruction for the bot to respond to the conversation
            messagesForAI.push({
                id: messagesForAI.length + 1,
                sender: 'user',
                text: `As ${nextAgent.name}, continue this conversation. Add your perspective on the problem or ask a question about the approach. 
                Be helpful and conversational, like a classmate trying to solve the problem together. 
                Don't just repeat what's been said, but add new insights or ask clarifying questions.`
            });

            const response = await aiService.generateResponse(
                messagesForAI,
                {
                    systemPrompt: nextAgent.systemPrompt,
                    model: currentModel
                }
            );

            // Handle different response types
            let stringResponse;
            if (typeof response === 'string') {
                stringResponse = response;
            } else if (response && typeof response === 'object') {
                const responseObj = response as AIResponse;
                stringResponse = responseObj.text || responseObj.content || "I have some thoughts about this approach.";
            } else {
                stringResponse = "I'm thinking about this problem from a different angle.";
            }

            // Replace typing indicator with actual message
            setMessages(prev => prev.map(msg =>
                msg.id === tempMessageId
                    ? {
                        ...msg,
                        text: stringResponse,
                        timestamp: new Date().toISOString(),
                        onComplete: () => {
                            // Schedule the other bot to respond if time permits
                            setTimeout(() => {
                                if (!roundEndedRef.current && isQuestioningEnabled) {
                                    triggerBotInteraction(nextResponder);
                                }
                            }, 10000 + Math.random() * 10000); // Longer delay: 10-20 seconds
                        }
                    }
                    : msg
            ));

            // Add to typing state
            setTypingMessageIds(prev => [...prev, tempMessageId]);
        } catch (error) {
            console.error("Error generating bot interaction:", error);
        }
    };

    // Update the AI response generation to properly handle the problem context
    const generateAIResponse = async (userMessage: string, mentionedBot: string | null) => {
        // Don't generate responses if time's up
        if (roundEndedRef.current) return;

        // Determine which bot(s) should respond
        let selectedAgentIndex: number;
        
        if (mentionedBot === 'logic') {
            // Only Logic Bot should respond
            selectedAgentIndex = 0;
        } else if (mentionedBot === 'pattern') {
            // Only Pattern Bot should respond
            selectedAgentIndex = 1;
        } else {
            // Either no specific bot was mentioned, or both were mentioned
            // For 'both', we'll start with a random one, then the other will respond as follow-up
            selectedAgentIndex = Math.random() < 0.5 ? 0 : 1;
        }
        
        const selectedAgent = agents[selectedAgentIndex];

        console.log(`Generating response from ${selectedAgent.name}`);
        setBotThinking(true);

        // Format the question text properly
        const questionText = typeof currentQuestion === 'string' 
            ? currentQuestion 
            : currentQuestion?.question 
                ? currentQuestion.question 
                : JSON.stringify(currentQuestion);

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

            // Generate AI response with proper problem context
            const response: string | AIResponse = await aiService.generateResponse(
                [
                    { 
                        id: 1, 
                        sender: 'user', 
                        text: `The current problem we're working on is: ${questionText}` 
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

            // Handle different response types
            let stringResponse;
            if (typeof response === 'string') {
                stringResponse = response;
            } else if (response && typeof response === 'object') {
                // Use type assertion to help TypeScript understand this is an AIResponse
                const responseObj = response as AIResponse;
                
                // Check if the object has a text property
                if (typeof responseObj.text === 'string') {
                    stringResponse = responseObj.text;
                } else if (typeof responseObj.content === 'string') {
                    stringResponse = responseObj.content;
                } else {
                    // Last resort - stringify
                    try {
                        stringResponse = JSON.stringify(response);
                        if (stringResponse === '{}' || stringResponse === '[object Object]') {
                            stringResponse = `I have some thoughts about this problem.`;
                        }
                    } catch (e) {
                        stringResponse = `Let's analyze this step by step.`;
                    }
                }
            } else {
                stringResponse = `I'm thinking about your question.`;
            }

            // Replace typing indicator with actual message
            setMessages(prev => prev.map(msg =>
                msg.id === tempMessageId
                    ? {
                        ...msg,
                        text: stringResponse,
                        timestamp: new Date().toISOString(),
                        onComplete: () => {
                            // Trigger the other bot to respond
                            setTimeout(() => {
                                if (!roundEndedRef.current && isQuestioningEnabled) {
                                    triggerBotInteraction(selectedAgent.id);
                                }
                            }, 1000);
                        }
                    }
                    : msg
            ));

            // Add to typing state
            setTypingMessageIds(prev => [...prev, tempMessageId]);
            
            // Rest of the function remains the same...
        } catch (error) {
            // Error handling remains the same...
        } finally {
            setBotThinking(false);
        }
    };

    // Update startNewRound to initiate bot interaction after problem presentation
    const startNewRound = async () => {
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

        // Reset bot interaction counter
        botInteractionCountRef.current = 0;

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

            // Add initial messages
            const messageId1 = getUniqueMessageId();
            const messageId2 = getUniqueMessageId();

            setMessages([
                {
                    id: messageId1,
                    sender: "ai",
                    text: "Let's work on this new problem together. I'll help you understand the concepts.",
                    agentId: "logic",
                    onComplete: () => {
                        // Don't trigger yet, let second message complete first
                    }
                },
                {
                    id: messageId2,
                    sender: "ai",
                    text: "I'm excited to explore different approaches to this problem. Let me know if you want to discuss patterns or visualizations.",
                    agentId: "pattern",
                    onComplete: () => {
                        // Both intro messages are now complete, start automatic interaction
                        setTimeout(() => {
                            if (!roundEndedRef.current && isQuestioningEnabled) {
                                triggerBotInteraction('pattern'); // Start with Logic Bot responding to Pattern Bot
                            }
                        }, 2000);
                    }
                }
            ]);

            setTypingMessageIds([messageId1, messageId2]);

            // Reset timer and enable questioning
            setTimeLeft(120);
            setIsQuestioningEnabled(true);
            roundEndedRef.current = false;

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

    return (
        <div className="h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4 flex flex-row overflow-hidden">
            {/* LEFT PANEL - Problem, Submission, Scratchboard */}
            <div className="w-1/2 pr-2 flex flex-col h-full overflow-hidden">
                {/* Problem Display with Timer inside */}
                {currentQuestion && (
                    <div className="bg-white bg-opacity-20 p-4 rounded-md mb-4 border-2 border-purple-400">
                        <div className="flex justify-between items-start mb-2">
                            <h2 className="text-xl text-white font-semibold">Problem:</h2>
                            <div className="bg-purple-900 bg-opacity-50 rounded-lg px-3 py-1 text-white">
                                Time: {formatTime(timeLeft)}
                            </div>
                        </div>
                        <p className="text-white text-lg">
                            {typeof currentQuestion === 'string' ? currentQuestion : 
                             currentQuestion.question ? currentQuestion.question : 
                             JSON.stringify(currentQuestion)}
                        </p>
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
                                        text={typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)}
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
                                    <div className="whitespace-pre-wrap">
                                        {typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)}
                                    </div>
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
                                    placeholder="Ask about the problem (mention Logic Bot or Pattern Bot specifically if needed)..."
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
                                    onClick={completeLesson} // Directly call completeLesson instead of handleNextQuestion
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md"
                                >
                                    Proceed
                                </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}