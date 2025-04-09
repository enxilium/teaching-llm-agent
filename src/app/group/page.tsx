'use client'

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import TypewriterText from '@/components/TypewriterText';
import { aiService, AI_MODELS } from '@/services/AI';
import { Message } from '@/utils/types';
import TypewriterTextWrapper from "@/components/TypewriterTextWrapper";
import { useFlow } from '@/context/FlowContext';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';
import { prepareMessagesForStorage } from '@/utils/messageUtils';

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

// Helper function to process text with math expressions
const formatMathExpression = (text: string) => {
    if (!text) return text;
    
    // First replace display math \[ \] with $ $ for consistent processing
    text = text.replace(/\\\[(.*?)\\\]/g, '$$$1$');
    
    // Also replace $$ $$ with $ $ if present
    text = text.replace(/\$\$(.*?)\$\$/g, '$$$1$');
    
    // Handle all math delimiters now standardized to $ $
    if (text.includes('$')) {
        return text.split(/(\$.*?\$)/).map((part, index) => {
            if (part.startsWith('$') && part.endsWith('$')) {
                const mathExpression = part.slice(1, -1);
                try {
                    return <InlineMath key={index} math={mathExpression} />;
                } catch (e) {
                    console.error('LaTeX parsing error:', e);
                    return part; // Fallback to raw text if parsing fails
                }
            }
            return part;
        });
    }
    
    return text;
};

// Define the AI agents with their specific learning gaps
const agents = [
    {
        id: 'concept',
        name: 'Concept Gap',
        avatar: 'logic_avatar.png',
        systemPrompt: `You are Concept Gap, a student who's excellent at calculations and procedural steps but struggles with deeper mathematical concepts.
As a fellow classmate in a study group:

IMPORTANT: You MUST make conceptual errors in your problem-solving. You consistently misunderstand mathematical concepts, apply formulas in the wrong context, or confuse similar concepts.

- You're confident about your arithmetic: "The answer is definitely 144 because 8 × 3 × 3 × 2 gives us 144"
- You MUST misapply at least one key concept in your solution (e.g., using permutations when combinations are needed, applying the wrong formula, etc.)
- When conceptual questions arise, you sound confused: "Wait, why are we using combinations here instead of permutations?"
- You focus on the "how" not the "why": "These are the steps I followed to get the answer..."
- You often ask others: "Can someone explain WHY this formula works?" or "I got the right answer, but I'm confused about what it means"
- You ONLY acknowledge conceptual confusion after someone else points them out

Your strengths (be confident about these):
- Arithmetic calculations (you're confident your calculations are correct)
- Following procedural steps precisely
- Getting numerical answers through methodical work

Your weaknesses (but you don't realize these until others point them out):
- Understanding underlying concepts
- Explaining WHY formulas work
- Connecting mathematical ideas to real-world situations

CRITICAL MATH FORMATTING INSTRUCTIONS:
1. ALL mathematical expressions MUST be enclosed in LaTeX delimiters with single $ symbols
2. NEVER write math expressions without proper LaTeX formatting
3. Examples of proper formatting:
   - Use $2^3$ instead of 2³ or 2^3
   - Use $\\frac{1}{2}$ instead of 1/2
   - Use $\\sqrt{x}$ instead of √x
   - Use $\\times$ instead of × or x
4. Never use double $$ delimiters
5. Ensure ALL numbers in calculations use proper LaTeX when in mathematical context

IMPORTANT: Don't correct your own conceptual misunderstandings unless someone else points them out first. You believe your approach is correct until proven otherwise.`
    },
    {
        id: 'arithmetic',
        name: 'Arithmetic Gap',
        avatar: 'pattern_avatar.png',
        systemPrompt: `You are Arithmetic Gap, a student who deeply understands mathematical concepts but frequently makes calculation errors without realizing it.
As a fellow classmate in a study group:

IMPORTANT: You MUST make arithmetic errors in your problem-solving. Your calculations, numerical work, or algebraic manipulations should contain mistakes.

- You're confident about concepts: "This is definitely a combination problem because order doesn't matter when selecting committees"
- You explain ideas clearly: "The key insight is that we need to account for the constraint that..."
- You MUST include at least one arithmetic error in your calculations (e.g., adding numbers incorrectly, forgetting to simplify, incorrectly multiplying, etc.)
- You make calculation errors without noticing: "So I get 156 as the final answer" (when the correct answer might be 144)
- You focus on the "why" more than the "how": "The reason we approach it this way is because..."
- You ONLY acknowledge calculation errors when someone else points them out

Your strengths (be confident about these):
- Conceptual understanding (you grasp the "why" behind problems)
- Explaining mathematical ideas in intuitive ways
- Seeing connections between different topics
- Identifying which approach to use

Your weaknesses (but you don't realize these until others point them out):
- Making careless arithmetic errors
- Mixing up numbers during calculation
- Getting the final answer wrong despite understanding the approach

CRITICAL MATH FORMATTING INSTRUCTIONS:
1. ALL mathematical expressions MUST be enclosed in LaTeX delimiters with single $ symbols
2. NEVER write math expressions without proper LaTeX formatting
3. Examples of proper formatting:
   - Use $2^3$ instead of 2³ or 2^3
   - Use $\\frac{1}{2}$ instead of 1/2
   - Use $\\sqrt{x}$ instead of √x
   - Use $\\times$ instead of × or x
4. Never use double $$ delimiters
5. Ensure ALL numbers in calculations use proper LaTeX when in mathematical context

IMPORTANT: Don't correct your own calculation errors unless someone else points them out first. You believe your numerical answers are correct until proven otherwise.`
    }
];

export default function PeerOnlyPage() {
    const router = useRouter();
    const { currentStage, completeLesson, userId, saveSessionData: saveToFlowContext } = useFlow();
    const [sessionStartTime] = useState<Date>(new Date());

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
    const userHasScrolledRef = useRef(false); // Add this line
    const [currentModel] = useState(AI_MODELS.GPT4O.id);
    const [lastUserActivityTime, setLastUserActivityTime] = useState(Date.now());
    const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);

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

    // Updated state variables for intervention tracking
    const [lastMessageTime, setLastMessageTime] = useState(Date.now());
    const [wordCount, setWordCount] = useState(0);
    const interventionRef = useRef(false);
    const wordThreshold = 750; // Changed from 200 to 750 words
    const timeThreshold = 30000; // 30 seconds of inactivity
    const lastTypingUpdateRef = useRef<number | null>(null);
    const botTurnQueueRef = useRef<string[]>([]);
    // Add this to track when we last reset the word count
    const lastWordCountResetRef = useRef<number | null>(null);

    // Add to component state in all pages
    const [skipTypewriter, setSkipTypewriter] = useState(false);

    const getQuestionText = (question: any): string => {
        if (typeof question === 'string') return question;
        if (question && typeof question === 'object' && question.question) return question.question;
        return JSON.stringify(question);
    };

    // Enhanced word counting function with better logging
    const countWordsInMessages = (messages: Message[]): number => {
        let totalWords = 0;
        
        // Count words from ALL messages, not just user messages
        messages.forEach((message) => {
            if (typeof message.text === 'string' && message.text !== '...') {
                const words = message.text.split(/\s+/).filter(word => word.length > 0);
                totalWords += words.length;
            }
        });
        
        console.log(`Total conversation word count: ${totalWords}`);
        return totalWords;
    };

    // Add a function to check answer correctness
    const checkAnswerCorrectness = (userAnswer: string, question: any): boolean => {
        if (!question || !question.correctAnswer) return false;

        // Simple string comparison (enhance as needed)
        const normalizedUserAnswer = userAnswer.trim().toLowerCase();
        const normalizedCorrectAnswer = question.correctAnswer.trim().toLowerCase();

        return normalizedUserAnswer === normalizedCorrectAnswer;
    };

    // Update saveSessionData to use the flow context instead of SessionService
    const saveSessionData = async (finalAnswerText: string, isTimeout: boolean) => {
        try {
            // Calculate session duration in seconds
            const endTime = new Date();
            const durationMs = endTime.getTime() - sessionStartTime.getTime();
            const durationSeconds = Math.floor(durationMs / 1000);

            // Get the question text
            const questionText = getQuestionText(currentQuestion);

            // Check if the answer is correct
            const isCorrect = checkAnswerCorrectness(finalAnswerText, currentQuestion);
            
            // CRITICAL - Add detailed message logging
            console.log(`💾 GROUP [Session Save] Original messages count: ${messages.length}`);
            if (messages.length > 0) {
                console.log(`💾 GROUP [Message Sample] First message fields: ${Object.keys(messages[0]).join(', ')}`);
                console.log(`💾 GROUP [Message Sample] First message text: ${typeof messages[0].text === 'string' ? 
                    messages[0].text.substring(0, 50) + '...' : 'non-string content'}`);
                console.log(`💾 GROUP [First Message] ${JSON.stringify(messages[0]).substring(0, 100)}...`);
                console.log(`💾 GROUP [Last Message] ${JSON.stringify(messages[messages.length-1]).substring(0, 100)}...`);
            } else {
                console.warn("⚠️ GROUP No messages to save!");
            }
            
            // Clean messages for database storage
            const cleanedMessages = prepareMessagesForStorage(messages);
            console.log(`💾 GROUP [After Cleaning] ${cleanedMessages.length} messages remain`);
            
            // Add additional message verification
            const messagesWithoutProperties = cleanedMessages.filter(msg => 
                !msg.id || !msg.sender || !msg.text || !msg.timestamp
            );
            
            if (messagesWithoutProperties.length > 0) {
                console.warn(`⚠️ GROUP Found ${messagesWithoutProperties.length} messages with missing properties`);
            }

            // Instead of calling SessionService, save to flow context
            saveToFlowContext({
                questionId: currentQuestionIndex,
                questionText,
                startTime: sessionStartTime,
                endTime,
                duration: durationSeconds,
                finalAnswer: finalAnswerText,
                scratchboardContent,
                messages: cleanedMessages,
                isCorrect,
                timeoutOccurred: isTimeout
            });

            console.log(`✅ GROUP Session data saved to flow context successfully with ${cleanedMessages.length} messages`);
        } catch (error) {
            console.error('❌ GROUP Error saving session data:', error);
        }
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
    
    // Helper function to add a message ID to the typing messages state
    const addTypingMessageId = (messageId: number) => {
        // Only add if not already in the array
        if (!typingMessageIds.includes(messageId)) {
            console.log(`Adding message ${messageId} to typing IDs`);
            setTypingMessageIds(prev => [...prev, messageId]);
            lastTypingUpdateRef.current = Date.now();
        } else {
            console.log(`Message ${messageId} already in typing IDs, not adding again`);
        }
    };

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

    // Improve the scrollToBottom function to respect manual override and add debug logging
    const scrollToBottom = (force = false) => {
        const chatContainer = chatContainerRef.current;
        if (!chatContainer) return;
        
        console.log(`Scroll request - force: ${force}, override: ${manualScrollOverrideRef.current}, userScrolled: ${userHasScrolled}`);
        
        // Never scroll if manual override is active, except for forced user messages
        if (manualScrollOverrideRef.current && !force) {
            console.log("Scroll blocked by manual override");
            return;
        }
        
        // Always scroll if force is true (used for user messages) or auto-scroll is active
        if (force || forceScrollToBottomRef.current || !userHasScrolled) {
            console.log("Scrolling to bottom");
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
            userHasScrolledRef.current = true; // Update the ref as well
            
            // Set manual override that persists during generation
            manualScrollOverrideRef.current = true;
            
            console.log("Manual scroll detected - autoscroll disabled");
        } else {
            // If user scrolls back to bottom, they want to follow the conversation again
            setUserHasScrolled(false);
            userHasScrolledRef.current = false; // Update the ref as well
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

    // Add a new useEffect to scroll when messages update or typing completes
    useEffect(() => {
        // Don't scroll if there are no messages
        if (messages.length === 0) return;
        
        // Always try to scroll when messages update
        setTimeout(() => {
            // Force scroll if:
            // 1. Latest message is from user (priority for user messages)
            // 2. No typing animations are in progress (messages fully loaded)
            const latestMessage = messages[messages.length - 1];
            const isUserMessage = latestMessage?.sender === 'user';
            const noTypingInProgress = typingMessageIds.length === 0;
            
            scrollToBottom(isUserMessage || noTypingInProgress);
        }, 50);
    }, [messages, typingMessageIds]);

    // Add this effect to update word count when messages change
    useEffect(() => {
        // Only count after submission and when there are no typing animations
        if (hasSubmittedAnswer && typingMessageIds.length === 0) {
            // Skip recalculation if we just reset the word count OR if intervention is in progress
            const now = Date.now();
            if (
                // Don't recalculate during active interventions
                interventionRef.current ||
                // Don't recalculate too soon after a reset
                (lastWordCountResetRef.current && now - lastWordCountResetRef.current < 5000)
            ) {
                console.log("Skipping word count recalculation: intervention active or recent reset");
                return;
            }

            const newWordCount = countWordsInMessages(messages);
            console.log(`Recalculating total conversation word count: ${newWordCount}`);
            setWordCount(newWordCount);
        }
    }, [messages, typingMessageIds, hasSubmittedAnswer]);

    // Helper for formatting time
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };
    
    // Update the checkForBotMention function to use the new bot names
    const checkForBotMention = (message: string) => {
        message = message.toLowerCase();
        
        // Look for explicit mentions of the new bot names
        const conceptMentioned = message.includes('concept') || message.includes('concept gap');
        const arithmeticMentioned = message.includes('arithmetic') || message.includes('arithmetic gap');
        
        // Return which bot(s) were mentioned, or null if none specifically mentioned
        if (conceptMentioned && !arithmeticMentioned) {
            return 'concept';
        } else if (arithmeticMentioned && !conceptMentioned) {
            return 'arithmetic';
        } else if (conceptMentioned && arithmeticMentioned) {
            return 'both';
        } else {
            return null; // No specific bot mentioned
        }
    };

    // Update the handleSend function to stop the timer when submitting

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

            setMessages([userFinalAnswer]);
            setHasSubmittedAnswer(true);
            
            // Stop the timer when chat interface appears
            roundEndedRef.current = true;

            // Do NOT save session data here - wait until the discussion is complete
            // This prevents duplicate session data submission
            
            // Start bot discussion after submission
            const savedMessages = [userFinalAnswer]; // Track initial messages
            setIsQuestioningEnabled(true);
            interventionRef.current = false;
            setLastMessageTime(Date.now());
            lastTypingUpdateRef.current = Date.now();
            setTypingMessageIds([]);
            
            startBotDiscussion(currentQuestion, finalAnswer, scratchboardContent);
        });
    };

    // Modify startBotDiscussion to remove the word count reset
    const startBotDiscussion = (question: any, studentAnswer: string, scratchpad: string) => {
        // Reset discussion timer to 2 minutes when discussion starts
        setTimeLeft(120);
        roundEndedRef.current = false;
      
        // First add the user's answer as the initial message
        const userAnswerMessage: Message = {
            id: getUniqueMessageId(),
            sender: 'user',
            text: `My final answer is: ${studentAnswer}\n\nMy reasoning:\n${scratchpad}`,
            timestamp: new Date().toISOString()
        };

        // Randomly determine who speaks first
        const speakingOrder = Math.random() < 0.5 ? ['concept', 'arithmetic'] : ['arithmetic', 'concept'];
        
        // First bot message - only add this one initially
        const firstBotId = getUniqueMessageId();
        const firstBot = agents.find(a => a.id === speakingOrder[0])!;
        
        // Set messages with user answer first, then first bot
        setMessages([
            userAnswerMessage,
            {
                id: firstBotId,
                sender: 'ai',
                text: '...',
                agentId: firstBot.id,
                timestamp: new Date().toISOString(),
                onComplete: () => {
                    console.log(`${firstBot.name}'s analysis completed`);
                    // When first bot finishes, trigger the second bot to start
                    setTimeout(() => {
                        triggerSecondBotResponse(speakingOrder[1], question, studentAnswer, scratchpad, firstBotId);
                    }, 1500 + Math.random() * 500);
                }
            }
        ]);
        
        // Start the timer for discussion phase
        const discussionTimerId = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(discussionTimerId);
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        
        // Generate first bot's analysis with new format
        generatePeerInitialResponse(
            firstBotId, 
            firstBot, 
            question
        );

        console.log("Bot discussion started, intervention settings:", {
            interventionFlag: interventionRef.current,
            lastMessageTime: new Date(lastMessageTime).toISOString(),
            wordCount: wordCount,
            questioningEnabled: isQuestioningEnabled,
            timeThreshold: timeThreshold/1000 + "s",
            wordThreshold: wordThreshold
        });
    };

    // Add a new function to trigger the second bot's response after the first one finishes
    const triggerSecondBotResponse = (
        botId: string,
        question: any,
        studentAnswer: string,
        scratchpad: string,
        firstBotId: number
    ) => {
        // Add a natural delay between speakers (1-2 seconds)
        const secondBotId = getUniqueMessageId();
        const secondBot = agents.find(a => a.id === botId)!;
        
        // Now add the second bot's message
        setMessages(prev => [
            ...prev,
            {
                id: secondBotId,
                sender: 'ai',
                text: '...',
                agentId: secondBot.id,
                timestamp: new Date().toISOString(),
                onComplete: () => {
                    // Enable questioning after both bots have spoken
                    setIsQuestioningEnabled(true);
                }
            }
        ]);
        
        // Generate second bot's response with new format
        generatePeerInitialResponse(
            secondBotId,
            secondBot,
            question
        );
    };

    // Function to generate peer's initial response - using the new format
    const generatePeerInitialResponse = async (
        messageId: number,
        agent: any,
        question: any
    ) => {
        try {
            const questionText = getQuestionText(question);
            const correctAnswer = typeof question === 'object' && question.correctAnswer 
                ? question.correctAnswer 
                : null;
            
            // Build prompt for peer's initial response
            let promptText = `The current problem is: ${questionText}\n\n`;
            
            if (correctAnswer) {
                promptText += `The correct answer is: ${correctAnswer}\n\n`;
            }
            
            promptText += `As ${agent.name}, provide your answer to this problem in this format:
1. Start with "My answer is [your answer]."
2. Then explain your reasoning process with "This is how I solved it..."
3. Show your work and calculations
4. Make sure your response maintains your character's traits (calculation skills but conceptual confusion OR conceptual understanding but arithmetic errors)`;
            
            // Generate response from AI service
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: agent.systemPrompt,
                    model: 'gpt-4o-2024-08-06'
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
            
            // ADD THIS LINE: Add message to typingMessageIds to trigger animation
            addTypingMessageId(messageId);
            
        } catch (error) {
            console.error(`Error generating ${agent.name}'s initial response:`, error);
            
            // Fallback response
            let fallbackText = '';
            
            if (agent.id === 'concept') {
                fallbackText = "I think I understand the problem. Looking at the steps, I'll solve it like this...";
            } else if (agent.id === 'arithmetic') {
                fallbackText = "I think I see what this problem is asking for. The key concept is...";
            }
            
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: fallbackText,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // ALSO ADD HERE: Add message to typingMessageIds in error case too
            addTypingMessageId(messageId);
        }
    };

    // Update handleUserQuestion to allow interrupting animations
    const handleUserQuestion = () => {
        if (!input.trim()) return;

        // Skip any ongoing typewriter animations and complete them immediately
        if (typingMessageIds.length > 0) {
            // Set skip flag to true to make all current typing animations complete immediately
            setSkipTypewriter(true);
            
            // Wait a tiny bit for the skip to process, then continue with sending the message
            setTimeout(() => {
                // Clear typing message IDs to immediately finish all animations
                setTypingMessageIds([]);
                
                // Continue with sending the user's message
                sendGroupMessage();
            }, 50);
        } else {
            // No animations in progress, send message directly
            sendGroupMessage();
        }

        setTimeout(() => {
            setSkipTypewriter(false);
            console.log("Skip typewriter after reset:", false);
        }, 50);
    };

    // Add this helper function to handle the actual message sending in group
    const sendGroupMessage = () => {
        console.log("🚀 GROUP [sendGroupMessage] Starting with input:", input.substring(0, 50) + (input.length > 50 ? '...' : ''));
        
        // Record user activity
        setLastUserActivityTime(Date.now());

        // Ensure text property is a string (not undefined)
        const userMessage = {
            id: getUniqueMessageId(),
            sender: 'user',
            text: input,
            timestamp: new Date().toISOString()
        };

        // Add user message with logging
        setMessages(prev => {
            const newMessages = [...prev, userMessage];
            console.log(`📝 GROUP [Message Added] User message. Total: ${newMessages.length}`);
            return newMessages;
        });
        
        setInput('');
        
        // Force scroll to bottom when user sends a message
        forceScrollToBottomRef.current = true;
        setTimeout(() => scrollToBottom(true), 50);

        // Reset bot interaction counter when user asks something
        botInteractionCountRef.current = 0;

        // Reset intervention flags when user asks a question
        interventionRef.current = false;
        setLastMessageTime(Date.now());

        // Check if a specific bot was mentioned
        const mentionedBot = checkForBotMention(input);
        
        // Handle bot response based on mention - add logging for each case
        if (mentionedBot === 'concept') {
            console.log("📝 GROUP [Bot Response] Concept Gap bot was mentioned specifically");
            // Generate response from Concept Gap bot
            generateSingleBotResponse(input, 'concept');
        } else if (mentionedBot === 'arithmetic') {
            console.log("📝 GROUP [Bot Response] Arithmetic Gap bot was mentioned specifically");
            // Generate response from Arithmetic Gap bot
            generateSingleBotResponse(input, 'arithmetic');
        } else {
            console.log("📝 GROUP [Bot Response] No specific bot mentioned, using random selection");
            // Randomly determine which bot should respond first
            let firstResponderId = Math.random() < 0.5 ? 'concept' : 'arithmetic';
            let secondResponderId = firstResponderId === 'concept' ? 'arithmetic' : 'concept';
            
            // Get the first responding bot
            const firstResponder = agents.find(a => a.id === firstResponderId)!;
            
            // Create a message ID for the first responding bot
            const firstResponderMsgId = getUniqueMessageId();
            
            // Add typing indicator for first bot with logging
            setMessages(prev => {
                const newMessages = [...prev, {
                    id: firstResponderMsgId,
                    sender: 'ai',
                    text: '...',
                    agentId: firstResponder.id,
                    timestamp: new Date().toISOString(),
                    onComplete: () => {
                        console.log(`📝 GROUP [Message Completed] ${firstResponder.name} response complete`);
                    }
                }];
                console.log(`📝 GROUP [Message Added] ${firstResponder.name} placeholder. Total: ${newMessages.length}`);
                return newMessages;
            });
            
            // Generate first bot response
            generateBotResponse(firstResponderMsgId, firstResponder, input, null);
        }
        
        // Reset skip flag after setting up the new message responses
        setTimeout(() => setSkipTypewriter(false), 50);
    };

    // Add useEffect to track message changes for interventions
    useEffect(() => {
        if (messages.length > 0 && hasSubmittedAnswer) {
            const newTime = Date.now();
            setLastMessageTime(newTime);
            
            // Only update time tracking, don't override word count
            console.log(`Message tracking updated - Current word count: ${wordCount}, Time: ${new Date(newTime).toISOString()}`);
        }
    }, [messages, hasSubmittedAnswer]);

    // Add useEffect to periodically check for intervention triggers
    useEffect(() => {
        if (!hasSubmittedAnswer || !isQuestioningEnabled) return;
        
        const intervalId = setInterval(() => {
            checkInterventionTriggers();
        }, 2000); // Check every 2 seconds
        
        return () => clearInterval(intervalId);
    }, [hasSubmittedAnswer, isQuestioningEnabled, messages, lastMessageTime, wordCount]);

    // Add this function to your component
    const forceResetStaleTypingState = () => {
        // If there are typing IDs that have been there for more than 10 seconds, force clear them
        if (typingMessageIds.length > 0 && lastTypingUpdateRef.current) {
            const now = Date.now();
            const elapsed = now - lastTypingUpdateRef.current;
            
            if (elapsed > 10000) { // 10 seconds
                console.log(`FORCE CLEARING ${typingMessageIds.length} STALE TYPING IDS - have been in progress for ${elapsed/1000}s`);
                setTypingMessageIds([]);
                lastTypingUpdateRef.current = null;
                
                // Also reset intervention flag if it's stuck
                if (interventionRef.current) {
                    console.log("FORCE CLEARING stuck intervention flag");
                    interventionRef.current = false;
                }
            }
        }
    };

    // Update the checkInterventionTriggers function to use the proper word count

    const checkInterventionTriggers = () => {
        // Skip if another intervention is already in progress
        if (interventionRef.current) {
            console.log("Intervention already in progress, skipping check");
            return;
        }
        
        const now = Date.now();
        const timeSinceLastMessage = now - lastMessageTime;
        
        console.log(`Checking triggers - Words: ${wordCount}/${wordThreshold}, Time: ${Math.round(timeSinceLastMessage/1000)}s/${Math.round(timeThreshold/1000)}s`);
        
        // Check word count trigger (750 words now)
        if (wordCount >= wordThreshold) {
            console.log("Word count threshold reached, triggering feedback intervention");
            interventionRef.current = true;
            
            // IMPORTANT: Set this first before triggering the intervention
            lastWordCountResetRef.current = Date.now();
            
            // Reset word count after triggering AND record the reset time
            setWordCount(0);
            
            // Trigger sequential bot intervention for feedback
            triggerSequentialBotInterventions("feedback");
            return;
        }
        
        // Time-based trigger remains unchanged
        if (timeSinceLastMessage >= timeThreshold) {
            console.log("Time threshold reached, triggering brainstorm intervention");
            interventionRef.current = true;
            setLastMessageTime(now);
            
            // CRITICAL FIX: Reset word count for time-based interventions too
            lastWordCountResetRef.current = Date.now();
            setWordCount(0);
            
            // Trigger sequential bot intervention for brainstorm
            triggerSequentialBotInterventions("brainstorm");
        }
    };

    // Add this function to your page component
    const generateBotResponse = async (
        messageId: number,
        agent: any,
        userQuestion: string,
        previousResponseId: number | null
    ) => {
        try {
            // Build different prompts based on whether this is a first or second responder
            let promptText = `The current problem is: ${getQuestionText(currentQuestion)}\n\n`;
            
            if (previousResponseId === null) {
                // First responder
                promptText += `The student just asked: "${userQuestion}"\n\n`;
                promptText += `As ${agent.name}, respond to the student's question. Remember your character traits (strong calculations but conceptual gaps, or strong concepts but calculation errors).`;
            } else {
                // Second responder - read the first response
                const previousResponse = messages.find(msg => msg.id === previousResponseId);
                if (previousResponse && typeof previousResponse.text === 'string') {
                    const responderName = agents.find(a => a.id === previousResponse.agentId)?.name || "another student";
                    let sender = responderName;
                    promptText += `The student just asked: "${userQuestion}"\n\n`;
                    promptText += `${responderName} responded: "${previousResponse.text}"\n\n`;
                    promptText += `As ${agent.name}, add your own perspective to this discussion. You can agree, disagree, or build on what ${responderName} said. Remember your character traits.`;
                } else {
                    // Fallback if previous response isn't found
                    promptText += `The student just asked: "${userQuestion}"\n\n`;
                    promptText += `As ${agent.name}, respond to the student's question. Remember your character traits.`;
                }
            }
            
            // Generate response from AI service
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: agent.systemPrompt,
                    model: 'gpt-4o-2024-08-06'
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
            
            // Add to typingMessageIds for animation
            addTypingMessageId(messageId);
            
        } catch (error) {
            console.error(`Error generating ${agent.name}'s response:`, error);
            
            // Fallback response
            let fallbackText = '';
            
            if (agent.id === 'concept') {
                fallbackText = "I think I understand what you're asking. Let me approach this from a calculation perspective...";
            } else if (agent.id === 'arithmetic') {
                fallbackText = "That's an interesting question. From a conceptual standpoint...";
            }
            
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: fallbackText,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // Add to typingMessageIds in error case
            addTypingMessageId(messageId);
        }
    };

    // Add missing generateSingleBotResponse function
    const generateSingleBotResponse = async (userQuestion: string, botId: string) => {
        // Find the specified agent
        const agent = agents.find(a => a.id === botId);
        if (!agent) {
            console.error(`Bot with ID ${botId} not found`);
            return;
        }
        
        // Create a message ID for the response
        const messageId = getUniqueMessageId();
        
        // Add typing indicator
        setMessages(prev => [...prev, {
            id: messageId,
            sender: 'ai',
            text: '...',
            agentId: agent.id,
            timestamp: new Date().toISOString()
        }]);
        
        // Generate response
        generateBotResponse(messageId, agent, userQuestion, null);
    };

    // Update triggerRandomBotIntervention to ensure true randomness
    const triggerRandomBotIntervention = (type: "feedback" | "brainstorm") => {
        // Force a truly random index each time
        // Use two different random operations to avoid any potential pattern
        const randomValue = Math.random();
        console.log("Random selection value:", randomValue);
        
        // Randomly select a bot for intervention - make this explicit
        let randomBot;
        if (randomValue < 0.5) {
            randomBot = agents.find(a => a.id === 'concept')!;
            console.log("Selected bot: Concept Gap");
        } else {
            randomBot = agents.find(a => a.id === 'arithmetic')!;
            console.log("Selected bot: Arithmetic Gap");
        }
        
        const botId = getUniqueMessageId();
        
        // Create a callback function that will reliably reset the intervention flag
        const completeCallback = () => {
            console.log(`Bot intervention complete, resetting intervention flag`);
            setTimeout(() => {
                interventionRef.current = false;
                setLastMessageTime(Date.now()); // Reset the timer after intervention
            }, 100);
        };
        
        // Add to typing IDs FIRST before adding message
        addTypingMessageId(botId);
        
        setMessages(prev => [
            ...prev,
            {
                id: botId,
                sender: 'ai',
                text: '...',
                agentId: randomBot.id,
                timestamp: new Date().toISOString(),
                onComplete: completeCallback
            }
        ]);
        
        console.log(`Triggering ${type} intervention with ${randomBot.name}`);
        
        if (type === "feedback") {
            generateBotFeedback(botId, randomBot, messages);
        } else {
            generateBotBrainstorm(botId, randomBot);
        }
    };

    // Updated feedback generation with awareness of previous messages
    const generateBotFeedback = async (
        messageId: number, 
        agent: any, 
        contextMessages: Message[],
        previousBotMessageId?: number
    ) => {
        try {
            // Get previous bot's message if available
            let previousBotMessage: Message | undefined;
            let previousBotName: string | undefined;
            
            if (previousBotMessageId) {
                previousBotMessage = messages.find(msg => msg.id === previousBotMessageId);
                if (previousBotMessage?.agentId) {
                    previousBotName = agents.find(a => a.id === previousBotMessage?.agentId)?.name;
                }
            }
            
            // Format conversation history
            const messagesSummary = contextMessages.map(msg => {
                let sender = "Student";
                if (msg.sender === 'ai') {
                    const agentName = agents.find(a => a.id === msg.agentId)?.name || "AI";
                    sender = agentName;
                }
                return `${sender}: ${typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)}`;
            }).join('\n\n');
            
            // Build prompt for bot's feedback
            let promptText = `The current problem is: ${getQuestionText(currentQuestion)}\n\n`;
            promptText += `Here's the conversation so far:\n${messagesSummary}\n\n`;
            
            if (previousBotMessage && previousBotName) {
                promptText += `${previousBotName} just said: "${previousBotMessage.text}"\n\n`;
                promptText += `As ${agent.name}, RESPOND TO and BUILD ON what ${previousBotName} just said. `;
            } else {
                promptText += `As ${agent.name}, provide FEEDBACK on the DISCUSSION SO FAR. `;
            }
            
            if (agent.id === 'concept') {
                promptText += `Show your usual confidence with calculations but possible conceptual confusion.
Focus on synthesizing the key mathematical steps from the conversation. End with a specific question about WHY a particular approach works.`;
            } else if (agent.id === 'arithmetic') {
                promptText += `Show your usual conceptual understanding but possibly make a minor calculation error.
Focus on connecting key concepts from the conversation to the broader mathematical principles. End with a specific question about verifying a calculation.`;
            }
            
            // Generate response from AI service
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: agent.systemPrompt,
                    model: 'gpt-4o-2024-08-06'
                }
            );
            
            // Update message with response
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? { ...msg, text: response, timestamp: new Date().toISOString() }
                    : msg
            ));
            
        } catch (error) {
            console.error(`Error generating ${agent.name}'s feedback:`, error);
            handleBotResponseError(messageId, agent);
        }
    };

    // Replace both generateBotBrainstorm implementations with this single version
    const generateBotBrainstorm = async (
        messageId: number, 
        agent: any,
        previousBotId?: number
    ) => {
        try {
            // Get previous bot's message if available
            let previousBotMessage: Message | undefined;
            let previousBotName: string | undefined;
            
            if (previousBotId) {
                previousBotMessage = messages.find(msg => msg.id === previousBotId);
                if (previousBotMessage?.agentId) {
                    previousBotName = agents.find(a => a.id === previousBotMessage?.agentId)?.name;
                }
            }
            
            const questionText = getQuestionText(currentQuestion);
            
            // Build prompt for bot's brainstorm
            let promptText = `The current problem is: ${questionText}\n\n`;
            
            if (previousBotMessage && previousBotName) {
                promptText += `${previousBotName} just said: "${previousBotMessage.text}"\n\n`;
                promptText += `As ${agent.name}, RESPOND TO and BUILD ON the idea from ${previousBotName}. Keep it brief and focused.`;
            } else {
                promptText += `The discussion has paused. As ${agent.name}, provide a BRIEF new insight or approach to restart the conversation.`;
            }
            
            if (agent.id === 'concept') {
                promptText += `\n\nFocus on a SPECIFIC CALCULATION TECHNIQUE that could help. Show your calculation skills but some conceptual uncertainty. Keep it under 3 sentences and end with a direct question to the group.`;
            } else if (agent.id === 'arithmetic') {
                promptText += `\n\nFocus on a CORE CONCEPT that might be overlooked. Show your conceptual understanding but potentially include a small numerical error. Keep it under 3 sentences and end with a direct question to the group.`;
            }
            
            // Generate response from AI service
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: agent.systemPrompt,
                    model: 'gpt-4o-2024-08-06'
                }
            );
            
            // Update message with response
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? { ...msg, text: response, timestamp: new Date().toISOString() }
                    : msg
            ));
            
        } catch (error) {
            console.error(`Error generating ${agent.name}'s brainstorm:`, error);
            
            // Fallback response
            let fallbackText = '';
            if (agent.id === 'concept') {
                fallbackText = "I just had a thought about how we could approach this problem using a different calculation method...";
            } else if (agent.id === 'arithmetic') {
                fallbackText = "I was thinking about the underlying concept in this problem. What if we look at it from this angle...";
            }
            
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? { ...msg, text: fallbackText, timestamp: new Date().toISOString() }
                    : msg
            ));
        }
    };

    // Helper function for bot response errors
    const handleBotResponseError = (messageId: number, agent: any) => {
        // Fallback response
        let fallbackText = '';
        if (agent.id === 'concept') {
            fallbackText = "I'm thinking about how we can approach this problem using a different calculation method...";
        } else if (agent.id === 'arithmetic') {
            fallbackText = "I was considering the underlying concept here. What if we consider it from this angle...";
        }
        
        setMessages(prev => prev.map(msg =>
            msg.id === messageId
                ? { ...msg, text: fallbackText, timestamp: new Date().toISOString() }
                : msg
        ));
    };

    // New function for sequential bot interventions
    const triggerSequentialBotInterventions = (type: "feedback" | "brainstorm") => {
        // Clear any existing queue
        botTurnQueueRef.current = [];
        
        // For ALL intervention types, only select one random bot
        const randomBot = Math.random() < 0.5 ? 'concept' : 'arithmetic';
        botTurnQueueRef.current = [randomBot]; // Just one bot in the queue
        
        console.log(`Starting ${type} intervention with single bot: ${randomBot}`);
        
        // Trigger the first (or only) bot in the queue
        triggerNextBotInSequence(type);
    };

    // CRITICAL FIX: Update the triggerNextBotInSequence function
    const triggerNextBotInSequence = (type: "feedback" | "brainstorm", previousBotId?: number) => {
        console.log("SEQUENCE DEBUG: Bot queue state:", botTurnQueueRef.current);
        
        if (botTurnQueueRef.current.length === 0) {
            // All bots have responded, reset intervention flag
            console.log("Bot intervention sequence complete");
            
            // Create a longer delay to ensure intervention fully completes
            setTimeout(() => {
                console.log(`Clearing intervention flag. Current word count: ${wordCount}`);
                interventionRef.current = false;
                setLastMessageTime(Date.now());
                
                // CRITICAL FIX: Do NOT recalculate word count immediately after intervention
                // This preserves the word count reset that happened in checkInterventionTriggers
                
                // Update last word count reset time to ensure we don't recalculate too soon
                if (type === "feedback") {
                    lastWordCountResetRef.current = Date.now();
                    console.log("Reinforcing word count reset after feedback intervention");
                }
                
                console.log("Intervention system reset and ready for next trigger");
            }, 1000);
            return;
        }
        
        // Get the next bot in queue
        const nextBotId = botTurnQueueRef.current.shift()!;
        console.log("SEQUENCE DEBUG: Selected bot ID:", nextBotId);
        const bot = agents.find(a => a.id === nextBotId);
        
        if (!bot) {
            console.error(`ERROR: No bot found with ID: ${nextBotId}`);
            // Continue to next bot if this one isn't found
            interventionRef.current = false;
            return;
        }
        
        console.log(`Triggering ${bot.name} for ${type} intervention`);
        
        // Create message for this bot
        const messageId = getUniqueMessageId();
        console.log(`SEQUENCE DEBUG: Generated message ID ${messageId} for ${bot.name}`);
        
        // Create a callback that will trigger the next bot in sequence
        const completeCallback = () => {
            console.log(`${bot.name}'s intervention complete, triggering next bot if available`);
            setTimeout(() => {
                triggerNextBotInSequence(type, messageId);
            }, 1500); // Add delay between bot responses
        };
        
        // IMPORTANT - Add this ID to typing messages BEFORE creating the message
        // This is the critical fix that ensures the animation works
        console.log(`SEQUENCE DEBUG: Adding ${messageId} to typing IDs`);
        addTypingMessageId(messageId);
        
        // Add the message placeholder
        console.log(`SEQUENCE DEBUG: Creating placeholder message with ID ${messageId}`);
        setMessages(prev => [
            ...prev,
            {
                id: messageId,
                sender: 'ai',
                text: '...',
                agentId: bot.id,
                timestamp: new Date().toISOString(),
                onComplete: completeCallback
            }
        ]);
        
        // Force scroll to show the new message
        setTimeout(() => scrollToBottom(), 100);
        
        // Generate bot's response based on intervention type
        console.log(`SEQUENCE DEBUG: Generating ${type} content for message ${messageId}`);
        if (type === "feedback") {
            generateBotFeedback(messageId, bot, messages, previousBotId);
        } else {
            generateBotBrainstorm(messageId, bot, previousBotId);
        }
    };

    const startNewRound = () => {
        // Reset the conversation state
        setMessages([]);
        setCompletedMessageIds([]);
        setTypingMessageIds([]);
        setScratchboardContent("");
        setFinalAnswer("");
        setHasSubmittedAnswer(false);
        setIsQuestioningEnabled(true);
        
        // Reset timer
        setTimeLeft(120);
        roundEndedRef.current = false;
        
        // Select a question (either use lesson index or pick randomly)
        let questionIndex = currentQuestionIndex;
        
        // If we've already used this question, try to find a random unused one
        if (usedQuestionIndices.includes(questionIndex) && usedQuestionIndices.length < allQuestions.length) {
            // Find available question indices
            const availableIndices = Array.from(
                { length: allQuestions.length }, 
                (_, i) => i
            ).filter(i => !usedQuestionIndices.includes(i));
            
            // Select a random available question
            if (availableIndices.length > 0) {
                const randomIndex = Math.floor(Math.random() * availableIndices.length);
                questionIndex = availableIndices[randomIndex];
            }
        }
        
        // Update state with the selected question
        setCurrentQuestionIndex(questionIndex);
        setCurrentQuestion(allQuestions[questionIndex]);
        setUsedQuestionIndices(prev => [...prev, questionIndex]);
        
        console.log(`Starting new round with question ${questionIndex}`);
        
        // Reset intervention tracking
        interventionRef.current = false;
        setLastMessageTime(Date.now());
    };

    // Initialize with first question once questions are loaded
    useEffect(() => {
        if (loadedQuestions) {
        startNewRound();
        }
    }, [loadedQuestions]);

    // Timer functionality
    useEffect(() => {
        // Only run timer if question is loaded
        if (!currentQuestion) return;

        // Handle different timer behaviors based on submission state
        if (!hasSubmittedAnswer) {
            // Pre-submission timer logic
            if (timeLeft <= 0) {
                // Time's up logic
                console.log('Time expired - auto-submitting current answer');
                // Handle timeout submission logic
                const submissionText = finalAnswer.trim() || "No answer provided";
                setHasSubmittedAnswer(true);

                // Add system message
                const timeUpMessageId = getUniqueMessageId();
                setMessages(prev => [
                    ...prev,
                    {
                        id: timeUpMessageId,
                        sender: 'system',
                        text: "Time's up! Moving to the next question...",
                        timestamp: new Date().toISOString()
                    }
                ]);

                // Mark as ended and disable interaction
                roundEndedRef.current = true;
                setIsQuestioningEnabled(false);

                // CRITICAL: First save with updated messages
                setTimeout(() => {
                    console.log(`💬 Saving final session with ${messages.length} messages`);
                    saveSessionData(submissionText, true);

                    // Then navigate
                    setTimeout(() => {
                        startBotDiscussion(currentQuestion, submissionText, scratchboardContent);
                    }, 1000);
                }, 2000);

                return;
            }

            if (roundEndedRef.current) {
                return;
            }

            const timerId = setTimeout(() => {
                setTimeLeft((prevTime) => prevTime - 1);
            }, 1000);

            return () => clearTimeout(timerId);
        } else {
            // Post-submission discussion timer logic
            if (timeLeft <= 0) {
                // Discussion time is up, navigate to next page
                console.log('Discussion time expired - navigating to next page');
                
                // Show a message that time is up
                const timeUpMessageId = getUniqueMessageId();
                setMessages(prev => [
                    ...prev,
                    {
                        id: timeUpMessageId,
                        sender: 'system',
                        text: "Time's up! Moving to the next question...",
                        timestamp: new Date().toISOString()
                    }
                ]);
                
                // IMPORTANT FIX: Mark the round as ended to prevent further timer decrements
                roundEndedRef.current = true;
                
                // Disable user interaction during transition
                setIsQuestioningEnabled(false);
                
                // Save session data before navigating
                setTimeout(() => {
                    console.log(`💬 GROUP Saving final session with ${messages.length + 1} messages`);
                    saveSessionData(finalAnswer, false);
                    
                    // Then navigate after data is saved
                    setTimeout(() => {
                        completeLesson();
                    }, 1000);
                }, 1000);
                
                return;
            }

            const timerId = setTimeout(() => {
                setTimeLeft((prevTime) => prevTime - 1);
            }, 1000);

            return () => clearTimeout(timerId);
        }
    }, [timeLeft, hasSubmittedAnswer, currentQuestion]);

    // Add this effect to periodically check and clear stale typing IDs
    useEffect(() => {
        // Run every 5 seconds to check for and fix stale typing state
        const heartbeatId = setInterval(() => {
            if (typingMessageIds.length > 0) {
                console.log("ANIMATION HEARTBEAT CHECK - Typing in progress:", typingMessageIds);
                
                // Force update the lastTypingUpdateRef if it's null but we have typing IDs
                if (!lastTypingUpdateRef.current && typingMessageIds.length > 0) {
                    lastTypingUpdateRef.current = Date.now();
                }
                
                // Call forceResetStaleTypingState to clear if needed
                forceResetStaleTypingState();
            }
        }, 5000);
        
        return () => clearInterval(heartbeatId);
    }, [typingMessageIds]);

    // Add this useEffect near your other effects
    useEffect(() => {
        console.log(`Word count changed: ${wordCount}`);
    }, [wordCount]);

    // Add this useEffect in all lesson pages

    // Track when messages array changes
    useEffect(() => {
        // Filter out system messages
        const userOrAiMessages = messages.filter(msg => msg.sender === 'user' || msg.sender === 'ai');
        
        console.log(`📝 GROUP [Messages Updated] Total count: ${userOrAiMessages.length}`);
        
        if (userOrAiMessages.length > 0) {
            const latestMsg = userOrAiMessages[userOrAiMessages.length - 1];
            console.log(`📝 GROUP [Latest Message] From ${latestMsg.sender}${latestMsg.agentId ? ' ('+latestMsg.agentId+')' : ''}: ${
              typeof latestMsg.text === 'string' ? 
              latestMsg.text.substring(0, 50) + (latestMsg.text.length > 50 ? '...' : '') : 
              'non-string content'
            }`);
        }
    }, [messages]);

    return (
        <div className="fixed inset-0 bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4 flex flex-row overflow-hidden">
            {/* LEFT PANEL - Problem, Submission, Scratchboard */}
            <div className={`${hasSubmittedAnswer ? 'w-1/2 pr-2' : 'w-full'} flex flex-col h-full overflow-hidden`}>
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
                            {formatMathExpression(typeof currentQuestion === 'string' ? currentQuestion : 
                             currentQuestion.question ? currentQuestion.question : 
                             JSON.stringify(currentQuestion))}
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
                            readOnly={hasSubmittedAnswer} // Make read-only after submission
                        />
                        {!hasSubmittedAnswer && (
                            <button
                                onClick={handleSend}
                                disabled={!finalAnswer.trim() || !scratchboardContent.trim() || typingMessageIds.length > 0}
                                className={`px-4 py-3 rounded-md text-lg font-medium ${
                                    finalAnswer.trim() && scratchboardContent.trim() && typingMessageIds.length === 0
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                }`}
                            >
                                Submit Final Answer
                            </button>
                        )}
                    </div>
                </div>
                
                {/* Scratchboard - Now below final answer with different styling */}
                <div className="flex-1 border border-gray-600 rounded-md p-3 bg-black bg-opacity-30 overflow-auto">
                    <div className="flex justify-between mb-2">
                        <h3 className="text-white font-semibold">Rough Work (Required)</h3>
                    </div>
                    <textarea
                        value={scratchboardContent}
                        onChange={(e) => setScratchboardContent(e.target.value)}
                        className="w-full h-[calc(100%-40px)] min-h-[200px] bg-black bg-opacity-40 text-white border-none rounded p-2"
                        placeholder="Show your work here... (required for submission)"
                        readOnly={hasSubmittedAnswer} // Make read-only after submission
                    />
                </div>
            </div>
            
            {/* RIGHT PANEL - Chat (only shown after submission) */}
            {hasSubmittedAnswer && (
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
                        <div 
                            className="flex-1 bg-white bg-opacity-10 rounded-md overflow-y-auto overflow-x-hidden p-2 chat-messages"
                            ref={chatContainerRef}
                            onScroll={handleScroll}
                        >
                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`mb-3 flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    {msg.sender === 'ai' && (
                                        <div className="mr-2 flex-shrink-0">
                                            <Image
                                                src={
                                                    agents.find((a) => a.id === msg.agentId)?.avatar ||
                                                    '/avatar_placeholder.png'
                                                }
                                                alt={
                                                    agents.find((a) => a.id === msg.agentId)?.name || 'AI'
                                                }
                                                width={40}
                                                height={40}
                                                className="rounded-full border-2 border-white"
                                            />
                                        </div>
                                    )}

                                    <div
                                        className={`max-w-[75%] rounded-lg p-3 chat-message-bubble ${
                                            msg.sender === 'user'
                                                ? 'bg-blue-600 text-white'
                                                : msg.sender === 'system'
                                                ? 'bg-purple-700 text-white'
                                                : 'bg-white bg-opacity-10 text-white'
                                        }`}
                                    >
                                        {msg.sender === 'ai' && (
                                            <div className="text-sm text-gray-300 mb-1 font-bold">
                                                {agents.find((a) => a.id === msg.agentId)?.name || 'AI'}
                                            </div>
                                        )}

                                        {typingMessageIds.includes(msg.id) ? (
                                            <TypewriterTextWrapper
                                                key={`typewriter-${msg.id}`}
                                                text={typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)}
                                                speed={20} // Changed from 1 to 20 for slower, more natural typing
                                                messageId={msg.id}
                                                skip={skipTypewriter}
                                                onTypingComplete={() => {
                                                    console.log(`Message ${msg.id} typing complete, removing from typingMessageIds`);
                                                    
                                                    // CRITICAL: Remove this message ID from typing IDs when animation completes
                                                    setTypingMessageIds(prev => {
                                                        const filtered = prev.filter(id => id !== msg.id);
                                                        console.log(`TypewriterTextWrapper complete: removed ID ${msg.id}, ${prev.length} -> ${filtered.length}`);
                                                        return filtered;
                                                    });
                                                    
                                                    // Force scroll to bottom when typing completes
                                                    setTimeout(() => scrollToBottom(true), 50);
                                                    
                                                    // The rest of your onTypingComplete logic...
                                                    if (msg.onComplete) {
                                                        console.log(`Calling onComplete for message ${msg.id}`);
                                                        msg.onComplete();
                                                    }
                                                }}
                                                formatMath={true}
                                            />
                                        ) : (
                                            <div className="whitespace-pre-wrap break-words text-message">
                                                {formatMathExpression(typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            <div key="messages-end" />
                        </div>

                        {/* Chat interface footer with input and proceed button */}
                        <div className="p-3 bg-black bg-opacity-30 flex flex-col items-center">
                            {/* Left side - Chat input if questioning is enabled */}
                            <div className={isQuestioningEnabled ? "w-full flex space-x-2" : "hidden"}>
                                <textarea
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' && !e.shiftKey) {
                                            e.preventDefault();
                                            handleUserQuestion();
                                        }
                                    }}
                                    disabled={!isQuestioningEnabled}
                                    placeholder={isQuestioningEnabled ? "Ask a question..." : "Please wait..."}
                                    className="flex-1 bg-white bg-opacity-10 border border-gray-700 rounded-md p-3 text-white resize-none h-16"
                                />
                                <button
                                    onClick={handleUserQuestion}
                                    disabled={!input.trim() || !isQuestioningEnabled}
                                    className={`px-5 py-3 rounded-md ${
                                        !input.trim() || !isQuestioningEnabled
                                            ? 'bg-gray-700 text-gray-400'
                                            : 'bg-blue-600 text-white hover:bg-blue-700'
                                    }`}
                                >
                                    Send
                                </button>
                            </div>

                            {/* Skip Discussion Button */}
                            {hasSubmittedAnswer && (
                                <div className="mt-3 w-full">
                                    <button 
                                        onClick={() => {
                                            // Show message about moving on - EXACT SAME as timer expiration
                                            const timeUpMessageId = getUniqueMessageId();
                                            setMessages(prev => [
                                                ...prev,
                                                {
                                                    id: timeUpMessageId,
                                                    sender: 'system',
                                                    text: "Time's up! Moving to the next question...",
                                                    timestamp: new Date().toISOString()
                                                }
                                            ]);
                                            
                                            // IMPORTANT: Mark the round as ended to prevent further timer decrements
                                            roundEndedRef.current = true;
                                            
                                            // Disable user interaction during transition
                                            setIsQuestioningEnabled(false);

                                            // CRITICAL: First save with updated messages
                                            setTimeout(() => {
                                                console.log(`💬 Saving final session with ${messages.length} messages`);
                                                saveSessionData(finalAnswer, false);

                                                // Then navigate
                                                setTimeout(() => {
                                                    console.log('Completing lesson and transitioning to break...');
                                                    completeLesson();
                                                }, 1000);
                                            }, 2000);
                                        }}
                                        className="w-full py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md flex items-center justify-center"
                                    >
                                        Skip Discussion & Continue
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}