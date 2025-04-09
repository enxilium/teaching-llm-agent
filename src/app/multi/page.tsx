'use client'

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useFlow } from '@/context/FlowContext';
import Image from 'next/image';
import { Message } from '@/utils/types';
import TypewriterTextWrapper from '@/components/TypewriterTextWrapper';
import { aiService, AI_MODELS } from '@/services/AI';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';
import { prepareMessagesForStorage } from '@/utils/messageUtils';

// Helper function to shuffle an array in place (Fisher-Yates algorithm)
const shuffleArray = <T extends any>(array: T[]): T[] => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};

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
        id: 'tutor',
        name: 'Tutor',
        avatar: 'tutor_avatar.svg',
        systemPrompt: `You are a Tutor, an experienced and encouraging math teacher guiding a classroom discussion.
When evaluating student solutions, first address the student's answer directly:
1. Begin by clearly stating whether their answer is correct or not
2. Point out what they did correctly in their approach
3. Gently identify any mistakes or misconceptions
4. Provide a brief explanation of the correct solution approach
5. End with a thoughtful question to check understanding

When responding to students with learning gaps, you MUST identify:
- For Arithmetic Gap: The SPECIFIC arithmetic error they made (e.g., miscalculation, wrong operation)
- For Concept Gap: The SPECIFIC conceptual misunderstanding they demonstrated (e.g., using wrong formula type)

Your goal is to facilitate learning through guided discovery and peer interaction.

CRITICAL MATH FORMATTING INSTRUCTIONS:
1. ALL mathematical expressions MUST be enclosed in LaTeX delimiters with single $ symbols
2. NEVER write math expressions without proper LaTeX formatting
3. Examples of proper formatting:
   - Use $2^3$ instead of 2³ or 2^3
   - Use $\\frac{1}{2}$ instead of 1/2
   - Use $\\sqrt{x}$ instead of √x
   - Use $\\times$ instead of × or x
   - Use $5 \\cdot 3$ for multiplication instead of 5*3
4. Never use double $$ delimiters
5. Ensure ALL numbers in calculations use proper LaTeX when in mathematical context
6. Format operators properly: $+$, $-$, $\\div$`
    },
    {
        id: 'concept',
        name: 'Concept Gap',
        avatar: 'logic_avatar.png',
        systemPrompt: `You are Concept Gap, a student who's excellent at calculations and procedural steps but struggles with deeper mathematical concepts.
Respond naturally as if you're in a regular classroom chat with peers.

IMPORTANT: You MUST make conceptual errors in your problem-solving. You consistently misunderstand mathematical concepts, apply formulas in the wrong context, or confuse similar concepts.

- You're very confident in your calculations and procedural steps
- Your numerical work is almost always correct, but your conceptual understanding is flawed
- You MUST misapply at least one key concept in your solution (e.g., using permutations when combinations are needed, applying the wrong probability rule, etc.)
- You get confused about WHY certain formulas or methods work, not just HOW to use them
- You occasionally ask classmates to explain the "why" behind mathematical concepts
- When others point out conceptual mistakes, you're grateful for the explanation
- You enjoy helping others with step-by-step solutions

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
        systemPrompt: `You are Arithmetic Gap, a student who deeply understands mathematical theory but makes calculation mistakes.
Respond naturally as if you're in a regular classroom chat with peers.

IMPORTANT: You MUST make arithmetic errors in your problem-solving. Your calculations, numerical work, or algebraic manipulations should contain mistakes.

- You're great at explaining the underlying concepts and approaches to problems
- Your conceptual understanding is excellent, but your numerical work is flawed
- You MUST include at least one arithmetic error in your calculations (e.g., adding numbers incorrectly, forgetting to simplify, incorrectly multiplying, etc.)
- You enjoy discussing the deeper meaning behind mathematical methods
- You can spot conceptual misunderstandings in other students' work
- When others point out calculation errors, you appreciate them catching your mistake
- You focus more on the big picture than getting calculations right

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

export default function MultiPage() {
    const router = useRouter();
    const { currentStage, completeLesson, lessonQuestionIndex, userId, saveSessionData: saveToFlowContext } = useFlow();
    const [sessionStartTime] = useState<Date>(new Date());

    // State for messages, user input, and UI controls
    const [messages, setMessages] = useState<Message[]>([]);
    const [completedMessageIds, setCompletedMessageIds] = useState<number[]>([]);
    const [scratchboardContent, setScratchboardContent] = useState("");
    const [input, setInput] = useState("");
    const [finalAnswer, setFinalAnswer] = useState("");
    const [typingMessageIds, setTypingMessageIds] = useState<number[]>([]);
    const [isQuestioningEnabled, setIsQuestioningEnabled] = useState(false);
    const [evaluationComplete, setEvaluationComplete] = useState(false);
    const [botThinking, setBotThinking] = useState(false);
    const [userHasScrolled, setUserHasScrolled] = useState(false);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const [currentModel] = useState(AI_MODELS.GPT4O.id);
    const [lastUserActivityTime, setLastUserActivityTime] = useState(Date.now());
    const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
    const [skipTypewriter, setSkipTypewriter] = useState(false);
    const [submissionTime, setSubmissionTime] = useState<Date | null>(null);

    // Questions from JSON
    const [allQuestions, setAllQuestions] = useState<any[]>([]);
    const [loadedQuestions, setLoadedQuestions] = useState(false);

    // Timer state
    const [timeLeft, setTimeLeft] = useState(120);
    const roundEndedRef = useRef(false);

    // Question tracking
    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [usedQuestionIndices, setUsedQuestionIndices] = useState<number[]>([]);
    const [currentQuestion, setCurrentQuestion] = useState<any>(null);

    // Message ID handling
    const nextMessageIdRef = useRef(3);
    const botInteractionCountRef = useRef(0);

    // Scroll control refs
    const forceScrollToBottomRef = useRef(false);
    const manualScrollOverrideRef = useRef(false);
    const lastManualScrollTimeRef = useRef(0);
    const userHasScrolledRef = useRef(false);

    // New state variables and refs for intervention
    const [lastMessageTime, setLastMessageTime] = useState(Date.now());
    const [wordCount, setWordCount] = useState(0);
    const interventionRef = useRef(false);
    const wordThreshold = 750; // Increased to 750 words like in group page
    const timeThreshold = 30000; // 30 seconds of inactivity
    const lastTypingUpdateRef = useRef<number | null>(null);
    const lastWordCountResetRef = useRef<number | null>(null);

    // Peer messages tracking ref
    const peerMessagesRef = useRef<{ agentId: string, text: string }[]>([]);

    // Helper function to get question text
    const getQuestionText = (question: any): string => {
        if (typeof question === 'string') return question;
        if (question && typeof question === 'object' && question.question) return question.question;
        return JSON.stringify(question);
    };

    // Helper for generating unique message IDs
    const getUniqueMessageId = () => {
        const id = nextMessageIdRef.current;
        nextMessageIdRef.current += 1;
        return id;
    };

    // Helper for ensuring no typing is in progress
    const ensureNoTypingInProgress = (callback: () => void, maxDelay = 10000) => {
        const startTime = Date.now();

        const tryCallback = () => {
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

            console.log('No typing in progress, proceeding with action');
                callback();
        };

        tryCallback();
    };

    // Scrolling functions
    const scrollToBottom = (force = false) => {
        const chatContainer = chatContainerRef.current;
        if (!chatContainer) return;

        if (manualScrollOverrideRef.current && !force) {
            return;
        }

        if (force || forceScrollToBottomRef.current || !userHasScrolledRef.current) {
            chatContainer.scrollTop = chatContainer.scrollHeight;
            forceScrollToBottomRef.current = false;
        }
    };

    const handleScroll = () => {
        const chatContainer = chatContainerRef.current;
        if (!chatContainer) return;

        const isProgrammaticScroll = Date.now() - lastManualScrollTimeRef.current < 50;

        if (isProgrammaticScroll) {
            return;
        }

        const isNearBottom = Math.abs(
            (chatContainer.scrollHeight - chatContainer.scrollTop) - chatContainer.clientHeight
        ) < 150;

        if (!isNearBottom) {
            setUserHasScrolled(true);
            userHasScrolledRef.current = true;
            manualScrollOverrideRef.current = true;
        } else {
            setUserHasScrolled(false);
            userHasScrolledRef.current = false;
            manualScrollOverrideRef.current = false;
        }
    };

    // Helper for formatting time
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
    };

    // Check if a specific bot is mentioned in the message
    const checkForBotMention = (message: string) => {
        message = message.toLowerCase();

        if (message.includes('tutor') || message.includes('teacher')) return 'tutor';
        if (message.includes('concept') || message.includes('concept gap')) return 'concept';
        if (message.includes('arithmetic') || message.includes('arithmetic gap')) return 'arithmetic';
        return null;
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
                const questions: any[] = Object.values(data).flat() as any[];

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

    // Use lessonQuestionIndex to determine which question to display
    useEffect(() => {
        if (loadedQuestions && allQuestions.length > 0) {
            // If lessonQuestionIndex is provided and valid, use it
            if (typeof lessonQuestionIndex === 'number' &&
                lessonQuestionIndex >= 0 &&
                lessonQuestionIndex < allQuestions.length) {
                setCurrentQuestion(allQuestions[lessonQuestionIndex]);
                setCurrentQuestionIndex(lessonQuestionIndex);
            } else {
                // Otherwise use the currentQuestionIndex state
                setCurrentQuestion(allQuestions[currentQuestionIndex]);
            }
        }
    }, [loadedQuestions, allQuestions, lessonQuestionIndex, currentQuestionIndex]);

    // Auto-scroll when messages change
    useEffect(() => {
        const latestMessage = messages[messages.length - 1];
        if (latestMessage && latestMessage.sender === 'user') {
            manualScrollOverrideRef.current = false;
            const scrollTime = Date.now();
            lastManualScrollTimeRef.current = scrollTime;
            forceScrollToBottomRef.current = true;
            setTimeout(() => scrollToBottom(true), 50);
        }
    }, [messages.length]);

    // Timer effect
    useEffect(() => {
        if (!currentQuestion) return;

        if (timeLeft <= 0) {
            if (!hasSubmittedAnswer) {
                // Handle pre-submission timeout
                autoSubmitTimeoutAnswer();
            } else {
                // Discussion phase timeout - navigate to next page
                console.log('Discussion time expired - navigating to next page');
                
                // IMPORTANT FIX: Mark the round as ended to prevent further timer decrements
                roundEndedRef.current = true;
                
                // Disable user interaction during transition
                setIsQuestioningEnabled(false);
                
                // Add message about moving on
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
                
                // Add a longer delay before navigating to ensure state updates are complete
                setTimeout(() => {
                    console.log('Completing lesson and transitioning to break...');
                    completeLesson();
                }, 3000); // Increased from 2000 to 3000ms
            }
            return;
        }

        if (roundEndedRef.current) return;

        const timerId = setTimeout(() => {
            setTimeLeft((prevTime) => prevTime - 1);
        }, 1000);

        return () => clearTimeout(timerId);
    }, [timeLeft, hasSubmittedAnswer, currentQuestion]);

    // Add useEffect to periodically check for intervention triggers
    useEffect(() => {
        if (!hasSubmittedAnswer || !isQuestioningEnabled) return;

        const intervalId = setInterval(checkInterventionTriggers, 5000);
        return () => clearInterval(intervalId);
    }, [hasSubmittedAnswer, isQuestioningEnabled, messages, wordCount, lastMessageTime]);

    // Update message tracking effects
    useEffect(() => {
        if (messages.length > 0) {
            // Only update the last message time, don't touch word count here
            setLastMessageTime(Date.now());
            
            // Log message change but don't recalculate word count
            console.log(`Message change detected - word count will be managed by the dedicated effect`);
        }
    }, [messages]);

    // Fix the word count effect to prevent premature recalculation
    useEffect(() => {
        // Only count after submission and when there are no typing animations
        if (hasSubmittedAnswer && typingMessageIds.length === 0) {
            // Skip recalculation if we just reset the word count OR if intervention is in progress
            const now = Date.now();
            if (
                // IMPORTANT: Don't recalculate during active interventions
                interventionRef.current ||
                // CRITICAL FIX: Increase timeout to ensure word count stays at 0 longer
                (lastWordCountResetRef.current && now - lastWordCountResetRef.current < 10000)
            ) {
                console.log("Skipping word count recalculation: intervention active or recent reset");
                return;
            }

            const newWordCount = countWordsInMessages(messages);
            console.log(`Recalculating total conversation word count: ${newWordCount}`);
            setWordCount(newWordCount);
        }
    }, [messages, typingMessageIds, hasSubmittedAnswer]);

    // Add a function to check answer correctness
    const checkAnswerCorrectness = (userAnswer: string, question: any): boolean => {
        if (!question || !question.correctAnswer) return false;

        // Simple string comparison (enhance as needed)
        const normalizedUserAnswer = userAnswer.trim().toLowerCase();
        const normalizedCorrectAnswer = question.correctAnswer.trim().toLowerCase();

        return normalizedUserAnswer === normalizedCorrectAnswer;
    };

    // Add this function to count words in all messages
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

    // Fix checkInterventionTriggers to include more logging and safety
    const checkInterventionTriggers = () => {
        // Skip if another intervention is already in progress
        if (interventionRef.current) {
            console.log("Intervention already in progress, skipping check");
            return;
        }
        
        const now = Date.now();
        const timeSinceLastMessage = now - lastMessageTime;
        
        console.log(`Checking triggers - Words: ${wordCount}/${wordThreshold}, Time: ${Math.round(timeSinceLastMessage/1000)}s/${Math.round(timeThreshold/1000)}s`);
        
        // Check word count trigger with enhanced logging
        if (wordCount >= wordThreshold) {
            console.log(`CONFIRMED: Word count ${wordCount} >= threshold ${wordThreshold}, triggering intervention`);
            interventionRef.current = true;
            
            // CRITICAL FIX: Reset word count IMMEDIATELY
            setWordCount(0);
            
            // Set timestamp AFTER reset
            lastWordCountResetRef.current = Date.now();
            
            console.log("Word count explicitly set to 0 with timestamp");
            
            // Trigger agent feedback
            triggerAgentFeedback();
            return;
        }
        
        // Time-based trigger with similar fixes
        if (timeSinceLastMessage >= timeThreshold) {
            console.log(`Time threshold reached: ${Math.round(timeSinceLastMessage/1000)}s >= ${Math.round(timeThreshold/1000)}s`);
            interventionRef.current = true;
            setLastMessageTime(now);
            
            // Same strategy for time-based interventions
            setWordCount(0);
            lastWordCountResetRef.current = Date.now();
            
            triggerAgentBrainstorm();
        }
    };

    // Modified saveSessionData function (keep everything else the same)
    const saveSessionData = async (finalAnswerText: string, isTimeout: boolean) => {
        try {
            // Calculate session duration in seconds using submission time
            const endTime = submissionTime || new Date();
            const durationMs = endTime.getTime() - sessionStartTime.getTime();
            const durationSeconds = Math.floor(durationMs / 1000);

            // Get the question text
            const questionText = getQuestionText(currentQuestion);

            // Check if the answer is correct
            const isCorrect = checkAnswerCorrectness(finalAnswerText, currentQuestion);

            // Log raw messages before cleaning
            console.log(`💾 MULTI [Session Save] Original messages count: ${messages.length}`);

            // Clean messages for database storage
            const cleanedMessages = prepareMessagesForStorage(messages);
            
            console.log(`💾 MULTI [Session Save] Saving ${messages.length} messages (${cleanedMessages.length} after cleaning)`);
            
            // Add additional message verification
            const messagesWithoutProperties = cleanedMessages.filter(msg => 
                !msg.id || !msg.sender || !msg.text || !msg.timestamp
            );
            
            if (messagesWithoutProperties.length > 0) {
                console.warn(`⚠️ MULTI Found ${messagesWithoutProperties.length} messages with missing properties`);
            }
            
            // Save to flow context instead of calling SessionService directly
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

            console.log(`✅ MULTI [Session Save] Data saved to flow context successfully with ${cleanedMessages.length} messages`);
        } catch (error) {
            console.error(`❌ MULTI [Session Save] Error saving session data:`, error);
        }
    };

    // Handle submission of answer
    const handleSend = () => {
        if (!finalAnswer.trim() || !scratchboardContent.trim()) return;

        setLastUserActivityTime(Date.now());

        // Record submission time
        const now = new Date();
        setSubmissionTime(now);

        ensureNoTypingInProgress(() => {
            const userFinalAnswer: Message = {
                id: getUniqueMessageId(),
                sender: 'user',
                text: `My final answer is: ${finalAnswer}\n\nMy reasoning:\n${scratchboardContent}`,
                timestamp: new Date().toISOString()
            };

            setMessages([userFinalAnswer]); // Start with just the user's answer
            setHasSubmittedAnswer(true); // Mark answer as submitted

            // Stop the timer when chat interface appears
            roundEndedRef.current = true;

            // Disable questioning initially - it will be enabled after the AI discussion sequence
            setIsQuestioningEnabled(false);

            // Save session data before starting discussion
            saveSessionData(finalAnswer, false);

            // Start classroom discussion after submission
            startClassroomDiscussion(currentQuestion, finalAnswer, scratchboardContent);
        });
    };

    // Function to auto-submit when timer expires
    const autoSubmitTimeoutAnswer = () => {
        console.log('Auto-submitting answer due to timeout');

        // Immediately set flags to prevent further edits
        setIsQuestioningEnabled(false);
        roundEndedRef.current = true;
        setHasSubmittedAnswer(true);

        // Use current values, even if empty
        const submissionText = finalAnswer.trim() || "No answer provided";

        // Create a user message with the timeout info
        const userTimeoutMessage: Message = {
            id: getUniqueMessageId(),
            sender: 'user',
            text: `My partial answer: ${submissionText}\n\nMy work so far:\n${scratchboardContent}`,
            timestamp: new Date().toISOString()
        };

        // Add message and start classroom discussion directly
        setMessages([userTimeoutMessage]);

        // Do NOT save session data here - wait until the discussion is complete
        // This prevents duplicate session data submission

        // Use the same flow as normal submission
        startClassroomDiscussion(currentQuestion, submissionText, scratchboardContent);
    };

    // Modify startClassroomDiscussion for improved flow
    const startClassroomDiscussion = (question: any, studentAnswer: string, scratchpad: string) => {
        // Reset peer messages tracking at the start of a new discussion
        peerMessagesRef.current = [];

        // Reset discussion timer to 2 minutes
        setTimeLeft(120);
        roundEndedRef.current = false;
        
        // Create user answer message
        const userAnswerMessage: Message = {
            id: getUniqueMessageId(),
            sender: 'user',
            text: `My final answer is: ${studentAnswer}\n\nMy reasoning:\n${scratchpad}`,
            timestamp: new Date().toISOString()
        };

        // Start with peers in random order, then Tutor
        const peerAgents = agents.filter(a => a.id !== 'tutor');
        const randomizedPeers = [...peerAgents];
        shuffleArray(randomizedPeers);
        
        // First, let peer students respond
        let responders = [...randomizedPeers];
        
        // Start with the first peer
        const firstPeer = responders[0];
        const firstPeerId = getUniqueMessageId();
        
        // Set messages with user answer first, then first responder
        setMessages([
            userAnswerMessage,
            {
                id: firstPeerId,
                sender: 'ai',
                text: '...',
                agentId: firstPeer.id,
                timestamp: new Date().toISOString(),
                onComplete: () => {
                    // After first peer responds, trigger second peer
                    if (responders.length > 1) {
                        setTimeout(() => {
                            // Chain to second peer response
                            const secondPeer = responders[1];
                            const secondPeerId = getUniqueMessageId();
                            
                            // Add second peer's message
                            setMessages(prev => [
                                ...prev,
                                {
                                    id: secondPeerId,
                                    sender: 'ai',
                                    text: '...',
                                    agentId: secondPeer.id,
                                    timestamp: new Date().toISOString(),
                                    onComplete: () => {
                                        // After second peer, trigger tutor who analyzes all solutions
                                        setTimeout(() => {
                                            const tutorId = getUniqueMessageId();
                                            
                                            // Use the ref instead of trying to filter from messages state
                                            const peerMessages = [...peerMessagesRef.current];
                                            
                                            console.log("Captured peer messages for tutor from ref:", peerMessages);
                                            
                                            setMessages(prev => [
                                                ...prev,
                                                {
                                                    id: tutorId,
                                                    sender: 'ai',
                                                    text: '...',
                                                    agentId: 'tutor',
                                                    timestamp: new Date().toISOString(),
                                                    onComplete: () => {
                                                        console.log("Tutor analysis complete, enabling user interaction");
                                                        setIsQuestioningEnabled(true);
                                                        setBotThinking(false);
                                                    }
                                                }
                                            ]);
                                            
                                            // Pass the captured peer messages from ref to the analysis function
                                            setTimeout(() => {
                                                generateTutorAnalysis(tutorId, question, studentAnswer, scratchpad, peerMessages);
                                            }, 1000);
                                        }, 1500);
                                    }
                                }
                            ]);
                            
                            // Generate second peer's response
                            generatePeerInitialResponse(secondPeerId, secondPeer, question);
                        }, 1500);
                    }
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
        
        // Generate first peer's response
        generatePeerInitialResponse(firstPeerId, firstPeer, question);
    };

    // Function to trigger next responder in the discussion
    const triggerNextResponder = (
        responders: any[], 
        index: number, 
        question: any, 
        studentAnswer: string, 
        scratchpad: string,
        previousMsgId: number
    ) => {
        if (index >= responders.length) {
            // All agents have responded, enable questioning
            setIsQuestioningEnabled(true);
            return;
        }

        // Get the next responder
        const responder = responders[index];
        const responderId = getUniqueMessageId();

        // Add message placeholder
        setMessages(prev => [
            ...prev,
            {
                id: responderId,
                sender: 'ai',
                text: '...',
                agentId: responder.id,
                timestamp: new Date().toISOString(),
                onComplete: () => {
                    // Continue chain after this agent completes
                    if (index < responders.length - 1) {
                        setTimeout(() => {
                            triggerNextResponder(responders, index + 1, question, studentAnswer, scratchpad, responderId);
                        }, 1500);
                    } else {
                        // Enable questioning if this is the last agent
                        setIsQuestioningEnabled(true);
                    }
                }
            }
        ]);

        // Generate this agent's response
        if (responder.id === 'tutor') {
            generateTeacherInitialResponse(responderId, question, studentAnswer, scratchpad);
        } else {
            generatePeerInitialResponse(responderId, responder, question);
        }
    };

    // Function to generate peer's initial response - using the new format
    const generatePeerInitialResponse = async (
        messageId: number,
        agent: any,
        question: any
    ) => {
        try {
            const questionText = getQuestionText(question);
            const correctAnswer = typeof currentQuestion === 'object' && currentQuestion.correctAnswer 
                ? currentQuestion.correctAnswer 
                : 'not provided';

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
                    model: currentModel
                }
            );

            // After generating the response, also store it in our ref
            peerMessagesRef.current.push({
                agentId: agent.id,
                text: response
            });
            
            console.log(`Added peer message to ref - ${agent.id}. Total: ${peerMessagesRef.current.length}`);

            // Replace typing indicator with actual response
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: response,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));

            // Add message to typingMessageIds
            setTypingMessageIds(prev => [...prev, messageId]);

        } catch (error) {
            console.error(`Error generating ${agent.name}'s initial response:`, error);

            // Fallback response
            let fallbackText = '';

            if (agent.id === 'concept') {
                fallbackText = "My answer is [answer]. This is how I solved it: I followed the steps carefully and made sure to calculate each part correctly...";
            } else if (agent.id === 'arithmetic') {
                fallbackText = "My answer is [answer]. This is how I solved it: Looking at the conceptual framework, I identified the key relationship between...";
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

            // Add message to typingMessageIds in error case
            setTypingMessageIds(prev => [...prev, messageId]);
        }
    };

    // Function to generate teacher's initial response - using the new format
    const generateTeacherInitialResponse = async (
        messageId: number,
        question: any,
        studentAnswer: string,
        scratchpad: string
    ) => {
        try {
            const questionText = getQuestionText(question);
            const correctAnswer = typeof currentQuestion === 'object' && currentQuestion.correctAnswer 
                ? currentQuestion.correctAnswer 
                : 'not provided';

            // Get the peer messages that have been sent so far
            const peerMessages = messages.filter(m => 
                m.agentId && m.agentId !== 'tutor' && 
                typeof m.text === 'string' && 
                m.text !== '...'
            );

            // Build prompt for teacher's response
            let promptText = `The current problem is: ${questionText}\n\n`;
            promptText += `The correct answer is: ${correctAnswer}\n\n`;
            promptText += `The student's answer was: ${studentAnswer}\n\n`;
            promptText += `The student's work: ${scratchpad}\n\n`;

            // Include peer responses if any
            if (peerMessages.length > 0) {
                promptText += "Other students' responses:\n";
                peerMessages.forEach(msg => {
                    const peerName = agents.find(a => a.id === msg.agentId)?.name || 'Student';
                    promptText += `${peerName}: ${msg.text}\n\n`;
                });
            }

            promptText += `As the teacher (Tutor), provide your response in this format:
1. Start with "The correct answer is [correct answer]."
2. Explain the proper solution approach in a clear, step-by-step manner
3. If there are peer responses, provide brief 1-line feedback to each student's approach
4. End with a question like "Any questions or confusions about this problem?" to encourage further discussion`;

            // Generate response from AI service
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: agents.find(a => a.id === 'tutor')?.systemPrompt || '',
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

        } catch (error) {
            console.error("Error generating teacher's initial response:", error);

            // Fallback response
            const fallbackText = `The correct answer is [correct answer]. Let me explain how to solve this step by step... [Error generating complete response]. Any questions or confusions about this problem?`;

            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: fallbackText,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
        }
    };

    // Update the generateTutorAnalysis function to better handle peer messages
    const generateTutorAnalysis = async (
        messageId: number,
        question: any,
        studentAnswer: string,
        scratchpad: string,
        peerMessages: { agentId: string, text: string }[]
    ) => {
        const questionText = getQuestionText(question);
        const correctAnswer = question?.answer || question?.correctAnswer || "not provided";

        try {
            // Build prompt for tutor's analysis
            let promptText = `The current problem is: ${questionText}\n\n`;
            promptText += `The correct answer is: ${correctAnswer}\n\n`;
            
            // First analyze the student's answer (keep this part first)
            promptText += `The student's answer was: ${studentAnswer}\n\n`;
            promptText += `The student's work: ${scratchpad}\n\n`;
            
            // Then include peer responses
            if (peerMessages && peerMessages.length > 0) {
                promptText += "The other students' responses:\n";
                peerMessages.forEach(msg => {
                    const peerName = agents.find(a => a.id === msg.agentId)?.name || 'Student';
                    promptText += `${peerName}: ${msg.text}\n\n`;
                });
            }
            
            promptText += `As an experienced and encouraging math teacher, provide feedback in a friendly, conversational tone. Structure your response in a natural way with several paragraphs:

Begin with your assessment of the student's answer, acknowledging what they did well while gently identifying any misconceptions.

In your next paragraph, address Arithmetic Gap's approach. You MUST identify the specific arithmetic error they made in their calculations, while acknowledging their conceptual strengths. Be specific about what calculation was performed incorrectly.

Then, discuss Concept Gap's solution. You MUST identify the specific conceptual misunderstanding or error they made in their approach, while acknowledging their procedural skills. Be specific about which concept they misunderstood or misapplied.

End with a thought-provoking question that encourages deeper understanding of the key concepts in this problem.

Your response should flow naturally like a real classroom conversation, not as a rigid evaluation.`;

            // Generate response from AI service
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: agents.find(a => a.id === 'tutor')?.systemPrompt || '',
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
            
            // Add to typing state for typewriter effect
            setTypingMessageIds(prev => [...prev, messageId]);

        } catch (error) {
            console.error("Error generating tutor analysis:", error);
            
            // Simple error fallback
            const fallbackText = `I see your answer is "${studentAnswer}". The correct answer is ${correctAnswer}. Looking at your work and comparing it with other approaches, I'd like to offer some insights on how you might think about this problem differently.`;
            
            // Update message with fallback
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: fallbackText,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // Add to typing IDs even in error case
            setTypingMessageIds(prev => [...prev, messageId]);
        }
    };

    // Update the handleUserQuestion to separate interruption from sending
    const handleUserQuestion = () => {
        if (!input.trim()) return;

        // Skip any ongoing typewriter animations by clearing the typing IDs
        if (typingMessageIds.length > 0) {
            console.log("User interrupted typewriter animation by sending a message");
            setTypingMessageIds([]);
        }

        // Create user message
        const userMessageId = getUniqueMessageId();
        const userMessage = {
            id: userMessageId,
            sender: 'user',
            text: input,
            timestamp: new Date().toISOString()
        };

        // Add to messages
        setMessages(prev => [...prev, userMessage]);
        setInput(''); // Clear input field

        // Force scroll to bottom
        forceScrollToBottomRef.current = true;
        setTimeout(() => scrollToBottom(true), 50);

        // Check if a specific bot was mentioned
        const mentionedBot = checkForBotMention(input);
        
        if (mentionedBot) {
            generateSingleBotResponse(input, mentionedBot);
        } else {
            generateSequentialResponse(input);
        }

        // Reset intervention flags
        interventionRef.current = false;
        setLastMessageTime(Date.now());
        setBotThinking(false);
    };

    // Function for when a specific bot is mentioned
    const generateSingleBotResponse = async (userQuestion: string, mentionedBot: string) => {
        // Find the specified agent
        const agent = agents.find(a => a.id === mentionedBot);
        if (!agent) return;

        console.log(`Generating response from ${agent.name}`);
        setBotThinking(true);

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

        try {
            // Format the question text
            const questionText = getQuestionText(currentQuestion);

            // Generate prompt based on which agent was mentioned
            let promptText = `The current problem is: ${questionText}\n\n`;
            promptText += `A student asked you directly: "${userQuestion}"\n\n`;

            if (mentionedBot === 'tutor') {
                promptText += `As the teacher (Tutor), respond as follows:
1. First, explicitly identify what the student is asking about
2. DIRECTLY address their specific question - do not go off on tangents 
3. Provide a clear, focused explanation that precisely answers their exact question
4. Be thorough but stay focused on exactly what they asked
5. Don't introduce unrelated concepts

Your answer should be laser-focused on answering exactly what they asked and nothing more.`;
            } else if (mentionedBot === 'concept') {
                // Concept Gap prompt unchanged
                promptText += `As Concept Gap, respond to the student's question.

Focus on calculation approaches and step-by-step arithmetic. You may express confusion about deeper concepts while being confident in your numerical work.`;
            } else if (mentionedBot === 'arithmetic') {
                // Arithmetic Gap prompt unchanged
                promptText += `As Arithmetic Gap, respond to the student's question.

Focus on conceptual understanding and mathematical principles. You may make small calculation errors while being confident in your conceptual explanations.`;
            }

            // Generate response
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: agent.systemPrompt,
                    model: currentModel
                }
            );

            // Replace typing indicator with actual response
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: typeof response === 'string' ? response : JSON.stringify(response),
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));

            // Add to typing state for typewriter effect
            setTypingMessageIds(prev => [...prev, messageId]);

        } catch (error) {
            console.error(`Error generating ${agent.name}'s response:`, error);

            // Provide character-appropriate fallback
            let fallbackText = '';

            if (mentionedBot === 'tutor') {
                fallbackText = "You're asking specifically about [key aspect of question]. Let me address that directly...";
            } else if (mentionedBot === 'concept') {
                fallbackText = "I think I can help with the calculation part of that. Let me work through the steps... though I'm not fully clear on why this conceptual approach is better.";
            } else if (mentionedBot === 'arithmetic') {
                fallbackText = "From a conceptual standpoint, this problem is about understanding the relationship between the constraints. The key insight is... though I might have made a small error in my arithmetic.";
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
        } finally {
            setBotThinking(false);
        }
    };

    // Enhance sequential responses for more dynamic conversation
    const generateSequentialResponse = (userQuestion: string) => {
        // CRITICAL FIX: Randomly select ONE agent from all three instead of always starting with Tutor
        const allAgents = [...agents]; // This includes tutor, concept, and arithmetic
        const randomIndex = Math.floor(Math.random() * allAgents.length);
        const selectedAgent = allAgents[randomIndex];
        
        console.log(`Random agent selected to respond: ${selectedAgent.name}`);
        
        // Create message ID for the selected agent
        const responseId = getUniqueMessageId();
        
        // Add message placeholder for just one agent
        setMessages(prev => [
            ...prev,
            {
                id: responseId,
                sender: 'ai',
                text: '...',
                agentId: selectedAgent.id,
                timestamp: new Date().toISOString(),
                // No onComplete handler that would trigger additional responses
            }
        ]);
        
        // Generate response based on which agent was selected
        if (selectedAgent.id === 'tutor') {
            generateTeacherQuestionResponse(responseId, userQuestion);
        } else {
            // For student agents (concept or arithmetic)
            generateStudentQuestionResponse(responseId, selectedAgent.id, userQuestion, null);
        }
    };

    // Add function for the second peer to respond in a conversation
    const generateStudentFollowupResponse = async (
        messageId: number,
        studentId: string,
        userQuestion: string,
        teacherResponseId: number,
        firstPeerResponseId: number
    ) => {
        try {
            // Get the student agent
            const studentAgent = agents.find(a => a.id === studentId);
            if (!studentAgent) return;

            // Get previous messages for context
            const teacherResponse = messages.find(m => m.id === teacherResponseId);
            const firstPeerResponse = messages.find(m => m.id === firstPeerResponseId);

            const teacherText = teacherResponse && teacherResponse.text !== '...' 
                ? teacherResponse.text 
                : "Let's think about this question...";

            const firstPeerText = firstPeerResponse && firstPeerResponse.text !== '...'
                ? firstPeerResponse.text
                : "I think the approach is...";

            const firstPeerId = firstPeerResponse?.agentId || (studentId === 'concept' ? 'arithmetic' : 'concept');
            const firstPeerName = agents.find(a => a.id === firstPeerId)?.name || 'another student';

            // Format the question text
            const questionText = getQuestionText(currentQuestion);

            // Add this line before using correctAnswer:
            const correctAnswer = typeof currentQuestion === 'object' && currentQuestion.correctAnswer 
                ? currentQuestion.correctAnswer 
                : 'not provided';

            let promptText = `The current problem is: ${questionText}\n\n`;
            promptText += `A student asked: "${userQuestion}"\n\n`;
            promptText += `The teacher (Tutor) responded: "${teacherText}"\n\n`;
            promptText += `${firstPeerName} then said: "${firstPeerText}"\n\n`;

            if (studentId === 'concept') {
                promptText += `As Concept Gap, add to the ongoing discussion by responding to both the teacher's explanation AND what ${firstPeerName} said.

Your response should:
1. Focus on any CALCULATION aspects related to the question
2. Show your numerical approach to relevant parts of the problem
3. Express some confusion about a conceptual aspect if appropriate
4. Agree or disagree with specific points made by ${firstPeerName}
5. Be conversational and natural as part of a classroom discussion

You should sound like a student who's confident about arithmetic but sometimes misunderstands the deeper concepts.`;
            } else {
                promptText += `As Arithmetic Gap, add to the ongoing discussion by responding to both the teacher's explanation AND what ${firstPeerName} said.

Your response should:
1. Focus on the CONCEPTUAL aspects related to the question
2. Explain the underlying principles or approach to the problem
3. Make a small arithmetic error somewhere if you provide calculations
4. Agree or disagree with specific points made by ${firstPeerName}
5. Be conversational and natural as part of a classroom discussion

You should sound like a student who deeply understands mathematical concepts but sometimes makes arithmetic errors.`;
            }

            // Generate student's response
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: studentAgent.systemPrompt,
                    model: currentModel
                }
            );

            // Replace typing indicator with actual response
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: typeof response === 'string' ? response : JSON.stringify(response),
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));

            // Add to typing state for typewriter effect
            setTypingMessageIds(prev => [...prev, messageId]);

        } catch (error) {
            console.error(`Error generating ${studentId}'s followup response:`, error);

            // Define fallback responses based on student type
            let fallbackText = '';
            if (studentId === 'concept') {
                fallbackText = "I see what both of you are saying about the problem. I think I can add to this by working through the steps numerically. For this type of problem, we'd use this formula... though I'm not fully clear on why this specific approach is better.";
            } else {
                fallbackText = "Building on what was just said, I think there's an important principle here about how these constraints work mathematically. The key insight is... though I might be making a calculation error in working it out.";
            }

            // Replace typing indicator with fallback response
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: fallbackText,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));

            // Add to typing state for typewriter effect
            setTypingMessageIds(prev => [...prev, messageId]);
        }
    };

    // Function for generating teacher responses to questions
    const generateTeacherQuestionResponse = async (messageId: number, userQuestion: string) => {
        try {
            // Format the question text
            const questionText = getQuestionText(currentQuestion);

            // Generate teacher's response
            const response = await aiService.generateResponse(
                [
                    { 
                        id: 1, 
                        sender: 'user', 
                        text: `The current problem we're working on is: ${questionText}` 
                    },
                    { 
                        id: 2, 
                        sender: 'user', 
                        text: `A student asked this specific question: "${userQuestion}"

As the teacher (Tutor), respond as follows:
1. First, explicitly identify what the student is asking about
2. DIRECTLY address their specific question - do not go off on tangents
3. Provide a clear, focused explanation that precisely answers their exact question
4. Be thorough but stay focused on exactly what they asked
5. Don't introduce unrelated concepts

Your answer should be laser-focused on answering exactly what they asked and nothing more.`
                    }
                ],
                {
                    systemPrompt: agents[0].systemPrompt,
                    model: currentModel
                }
            );

            // Replace typing indicator with actual response
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: typeof response === 'string' ? response : JSON.stringify(response),
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));

            // Add to typing state for typewriter effect
            setTypingMessageIds(prev => [...prev, messageId]);

        } catch (error) {
            console.error(`Error generating teacher's response:`, error);
            // Provide fallback
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: "I see you're asking about [specific aspect]. Let me address that directly...",
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
        }
    };

    // Function for generating student responses to questions
    const generateStudentQuestionResponse = async (
        messageId: number, 
        studentId: string, 
        userQuestion: string,
        teacherResponseId: number | null
    ) => {
        try {
            // Get the student agent
            const studentAgent = agents.find(a => a.id === studentId);
            if (!studentAgent) return;

            // Get teacher's response if available (now optional)
            let teacherText = "";
            if (teacherResponseId) {
                const teacherResponse = messages.find(m => m.id === teacherResponseId);
                if (teacherResponse && teacherResponse.text !== '...' && typeof teacherResponse.text === 'string') {
                    teacherText = teacherResponse.text;
                }
            }

            // Format the question text
            const questionText = getQuestionText(currentQuestion);

            // Build prompt with or without teacher context
            let promptText = `The current problem is: ${questionText}\n\n`;
            promptText += `A student asked: "${userQuestion}"\n\n`;
            
            // Only include teacher's response if it exists
            if (teacherText) {
                promptText += `The teacher (Tutor) responded: "${teacherText}"\n\n`;
            }

            if (studentId === 'concept') {
                promptText += `As Concept Gap, respond directly to the student's question in a classroom setting.

Your response should:
1. Focus on calculation approaches and step-by-step arithmetic
2. Show your numerical approach with specific calculations
3. Be confident about your arithmetic working
4. Express some confusion about deeper conceptual aspects if relevant
5. Be conversational and natural as part of a classroom discussion`;
            } else {
                promptText += `As Arithmetic Gap, respond directly to the student's question in a classroom setting.

Your response should:
1. Focus on explaining the underlying concepts and principles
2. Clearly articulate the mathematical reasoning involved
3. Be confident about your conceptual understanding
4. Include a minor arithmetic error somewhere in your calculations
5. Be conversational and natural as part of a classroom discussion`;
            }

            // Generate student's response
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: studentAgent.systemPrompt,
                    model: currentModel
                }
            );

            // Replace typing indicator with actual response
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: typeof response === 'string' ? response : JSON.stringify(response),
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));

            // Add to typing state for typewriter effect
            setTypingMessageIds(prev => [...prev, messageId]);

        } catch (error) {
            console.error(`Error generating ${studentId}'s response:`, error);

            // Define fallback responses based on student type
            let fallbackText = '';
            if (studentId === 'concept') {
                fallbackText = "I think what the teacher is explaining makes sense for the calculation part. If we apply the formula step-by-step, we can solve this - though I'm not entirely sure why this specific approach works compared to other methods.";
            } else {
                fallbackText = "From a conceptual perspective, this problem is about understanding the constraints and how they affect the mathematical structure. The key insight is recognizing the pattern, though I might have made an arithmetic error somewhere in my calculations.";
            }

            // Replace typing indicator with fallback response
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: fallbackText,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));

            // Add to typing state for typewriter effect
            setTypingMessageIds(prev => [...prev, messageId]);
        }
    };

    // Update the triggerAgentFeedback function to always use the tutor
    const triggerAgentFeedback = () => {
        // Always use tutor for word count interventions
        const tutorAgent = agents.find(a => a.id === 'tutor')!;
        const feedbackId = getUniqueMessageId();
        
        // Add the tutor's feedback message
        setMessages(prev => [
            ...prev,
            {
                id: feedbackId,
                sender: 'ai',
                text: '...',
                agentId: tutorAgent.id,
                timestamp: new Date().toISOString(),
                onComplete: () => {
                    setTimeout(() => {
                        console.log(`Feedback intervention complete. Current word count: ${wordCount}`);
                        setWordCount(0);
                        lastWordCountResetRef.current = Date.now();
                        interventionRef.current = false;
                        console.log("Tutor feedback complete, system ready for next threshold check");
                        setIsQuestioningEnabled(true);
                        setBotThinking(false);
                    }, 1500);
                }
            }
        ]);
        
        // Generate the feedback content from the tutor
        generateTutorFeedback(feedbackId, tutorAgent);
    };

    // Add a new function for tutor-specific feedback
    const generateTutorFeedback = async (messageId: number, agent: any) => {
        try {
            // Format conversation history
            const messagesSummary = messages.slice(-10).map(msg => {
                const sender = msg.sender === 'user' ? 'Student' : 
                               (msg.agentId ? agents.find(a => a.id === msg.agentId)?.name : 'System');
                return `${sender}: ${typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)}`;
            }).join('\n\n');
            
            // Build prompt for tutor's feedback (different from peer feedback)
            let promptText = `The current problem is: ${getQuestionText(currentQuestion)}\n\n`;
            promptText += `Here's the recent conversation:\n${messagesSummary}\n\n`;
            
            promptText += `As the Tutor, provide guidance to refocus the discussion. The conversation has become quite lengthy.

1. Summarize 1-2 key points from the discussion so far
2. Identify any areas where students may be going off-track
3. Suggest a specific direction to make progress on the problem
4. Ask a focused question to guide students toward understanding

Keep your response brief and targeted toward the most important concept that will help students make progress.`;
            
            // Generate response from tutor
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: agent.systemPrompt,
                    model: currentModel
                }
            );
            
            // Update message
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: response,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // Add to typing IDs
            setTypingMessageIds(prev => [...prev, messageId]);
        } catch (error) {
            console.error(`Error generating tutor's word count intervention:`, error);
            
            // Fallback response for tutor
            const fallbackText = "I notice our discussion has covered a lot of ground. Let's refocus on the key aspects of this problem. What specifically are we trying to determine, and what approach would be most efficient?";
            
            // Update message with fallback
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: fallbackText,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // Add to typing IDs
            setTypingMessageIds(prev => [...prev, messageId]);
        }
    };

    // Update the triggerAgentBrainstorm function to explicitly use only peer agents
    const triggerAgentBrainstorm = () => {
        // Always choose from peer agents (not Tutor) for time-based interventions
        const peerAgents = agents.filter(a => a.id !== 'tutor');
        const randomPeerIndex = Math.floor(Math.random() * peerAgents.length);
        const randomPeerAgent = peerAgents[randomPeerIndex];
        
        const brainstormId = getUniqueMessageId();
        
        // Add the peer agent's brainstorm message
        setMessages(prev => [
            ...prev,
            {
                id: brainstormId,
                sender: 'ai',
                text: '...',
                agentId: randomPeerAgent.id,
                timestamp: new Date().toISOString(),
                onComplete: () => {
                    setTimeout(() => {
                        setWordCount(0);
                        lastWordCountResetRef.current = Date.now();
                        interventionRef.current = false;
                        console.log("Peer brainstorm complete, word count reset, intervention flag cleared");
                        setIsQuestioningEnabled(true);
                        setBotThinking(false);
                    }, 1000);
                }
            }
        ]);
        
        // Generate the brainstorm content from the selected peer
        generateAgentBrainstorm(brainstormId, randomPeerAgent);
    };

    // Add function to generate agent brainstorm content (time-based intervention)
    const generateAgentBrainstorm = async (messageId: number, agent: any) => {
        try {
            const questionText = getQuestionText(currentQuestion);
            
            // Build prompt for agent's brainstorm - SHORT AND FOCUSED ON NEW IDEAS
            let promptText = `The current problem is: ${questionText}\n\n`;
            promptText += `The discussion has paused. As ${agent.name}, briefly introduce ONE new insight to restart the conversation.

Keep your response to 3-4 sentences maximum and end with a specific question to engage others.

Be true to your character - ${agent.id === 'concept' ? 'confident in calculations but sometimes confused about deeper concepts' : 'strong on conceptual understanding but prone to arithmetic errors'}.`;
            
            // Generate response
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: agent.systemPrompt,
                    model: currentModel
                }
            );
            
            // Update message
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: response,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // Add to typing IDs
            setTypingMessageIds(prev => [...prev, messageId]);
        } catch (error) {
            console.error(`Error generating ${agent.name}'s brainstorm:`, error);
            
            // Fallback responses based on agent type
            let fallbackText = '';
            if (agent.id === 'concept') {
                fallbackText = "I was thinking about this problem, and I realized we could calculate it using this formula... What do you think about trying this approach?";
            } else {
                fallbackText = "I was reflecting on the conceptual aspects of this problem, and I think the key insight is... Would that change how we approach this?";
            }
            
            // Update message with fallback
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: fallbackText,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // Add to typing IDs
            setTypingMessageIds(prev => [...prev, messageId]);
        }
    };

    // Add this dedicated input handler function
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        // ONLY update the input value, don't trigger any sending
        setInput(e.target.value);
    };

    // Add a safety "reset" function to fix stuck states
    const resetStuckStates = () => {
        console.log("Emergency reset of stuck UI states");
        setBotThinking(false);
        setIsQuestioningEnabled(true);
        setTypingMessageIds([]);
    };

    // Add a failsafe timeout to clear typing states
    useEffect(() => {
        // Add a global safety timer to clear stuck typing indicators
        if (typingMessageIds.length > 0) {
            const safetyTimer = setTimeout(() => {
                console.log("Safety timeout: clearing typing indicators");
                setTypingMessageIds([]);
                setBotThinking(false);
                setIsQuestioningEnabled(true);
            }, 30000); // 30 second maximum for any typing animation
            
            return () => clearTimeout(safetyTimer);
        }
    }, [typingMessageIds]);

    // Add this effect to force isQuestioningEnabled to true after answer submission
    useEffect(() => {
        if (hasSubmittedAnswer && !isQuestioningEnabled) {
            // Ensure questioning is enabled after a short delay
            const enableTimer = setTimeout(() => {
                console.log("Forcing questioning to be enabled");
                setIsQuestioningEnabled(true);
                setBotThinking(false); // Also reset the thinking state
            }, 5000); // 5 second backup timer
            
            return () => clearTimeout(enableTimer);
        }
    }, [hasSubmittedAnswer, isQuestioningEnabled]);

    // Update handleTimeExpired to save session data and complete lesson
    const handleTimeExpired = async () => {
        if (hasSubmittedAnswer) return;
        
        const now = new Date();
        setSubmissionTime(now);
        setHasSubmittedAnswer(true);
        
        // Save session data with timeout flag
        await saveSessionData(finalAnswer || "No answer provided", true);
        
        // Complete the lesson
        completeLesson();
    };

    return (
        <div className="chat-page-container bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4">
            {!hasSubmittedAnswer ? (
                // Before submission view - full width layout
                <div className="flex flex-col h-full w-full">
                    {/* Problem Display with Timer */}
                    {currentQuestion && (
                        <div className="bg-white bg-opacity-20 p-4 rounded-md mb-4 border-2 border-purple-400 flex-shrink-0">
                            <div className="flex justify-between items-start mb-2">
                                <h2 className="text-xl text-white font-semibold">Problem:</h2>
                                <div className="bg-purple-900 bg-opacity-50 rounded-lg px-3 py-1 text-white">
                                    Time: {formatTime(timeLeft)}
                                </div>
                            </div>
                            <p className="text-white text-lg">
                                {formatMathExpression(getQuestionText(currentQuestion))}
                            </p>
                        </div>
                    )}

                    {/* Final Answer Input */}
                    <div className="bg-white bg-opacity-15 rounded-md p-4 mb-4 border-2 border-blue-400 shadow-lg flex-shrink-0">
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
                                // Only disable if truly empty - not based on typing status
                                disabled={!finalAnswer.trim() || !scratchboardContent.trim()}
                                className={`px-4 py-3 rounded-md text-lg font-medium ${
                                    finalAnswer.trim() && scratchboardContent.trim()
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                        : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                }`}
                            >
                                Submit Final Answer
                            </button>
                        </div>
                    </div>

                    {/* Scratchboard - make this scrollable */}
                    <div className="flex-1 border border-gray-600 rounded-md p-3 bg-black bg-opacity-30 overflow-hidden flex flex-col">
                        <div className="flex justify-between mb-2 flex-shrink-0">
                            <h3 className="text-white font-semibold">Rough Work (Scratchpad)</h3>
                        </div>
                        <textarea
                            value={scratchboardContent}
                            onChange={(e) => setScratchboardContent(e.target.value)}
                            className="w-full flex-1 min-h-[200px] bg-black bg-opacity-40 text-white border-none rounded p-2"
                            placeholder="Show your work here... (calculations, reasoning, etc.)"
                        />
                    </div>
                </div>
            ) : (
                <div className="flex h-full w-full">
                    {/* Left panel - Problem Display */}
                    <div className="w-1/2 pr-2 flex flex-col h-full">
                        {/* Problem Display with Timer */}
                        {currentQuestion && (
                            <div className="bg-white bg-opacity-20 p-4 rounded-md mb-4 border-2 border-purple-400 flex-shrink-0">
                                <div className="flex justify-between items-start mb-2">
                                    <h2 className="text-xl text-white font-semibold">Problem:</h2>
                                    <div className="bg-purple-900 bg-opacity-50 rounded-lg px-3 py-1 text-white">
                                        Time: {formatTime(timeLeft)}
                                    </div>
                                </div>
                                <p className="text-white text-lg">
                                    {formatMathExpression(getQuestionText(currentQuestion))}
                                </p>
                            </div>
                        )}

                        {/* Student Answer & Work Area (read-only after submission) */}
                        <div className="bg-white bg-opacity-15 p-4 rounded-md mb-4 border-2 border-blue-400 flex-shrink-0">
                            <h3 className="text-lg text-white font-semibold mb-2">Your Answer & Work</h3>
                            <div className="bg-black bg-opacity-30 p-3 rounded-md mb-3">
                                <p className="text-white"><strong>Your Answer:</strong> {finalAnswer}</p>
                            </div>
                            <div className="bg-black bg-opacity-30 p-3 rounded-md overflow-auto max-h-[300px]">
                                <p className="text-white whitespace-pre-wrap"><strong>Your Work:</strong> {scratchboardContent}</p>
                            </div>
                        </div>
                    </div>

                    {/* Right panel - Chat Interface */}
                    <div className="w-1/2 pl-2 flex flex-col h-full">
                        <div className="flex-1 bg-white bg-opacity-10 rounded-md flex flex-col overflow-hidden">
                            {/* Agent info for multi mode */}
                            <div className="bg-black bg-opacity-30 p-2">
                                <div className="flex space-x-3">
                                    {agents.map(agent => (
                                        <div key={agent.id} className="flex items-center space-x-1">
                                            <div className="w-8 h-8 rounded-full overflow-hidden bg-purple-800 flex items-center justify-center">
                                                <Image 
                                                    src={`/${agent.avatar}`} 
                                                    alt={agent.name} 
                                                    width={32} 
                                                    height={32}
                                                />
                                            </div>
                                            <span className="text-white text-sm">{agent.name}</span>
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
                                                <div className="w-8 h-8 rounded-full overflow-hidden bg-purple-800 flex items-center justify-center">
                                                    <Image 
                                                        src={`/${agents.find(a => a.id === msg.agentId)?.avatar || 'tutor_avatar.svg'}`}
                                                        alt={agents.find(a => a.id === msg.agentId)?.name || 'AI'}
                                                        width={32}
                                                        height={32}
                                                    />
                                                </div>
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
                                                    key={`typewriter-message-${msg.id}`}
                                                    text={typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)}
                                                    speed={20}
                                                    messageId={msg.id}
                                                    skip={skipTypewriter}
                                                    onTypingProgress={() => {
                                                        if (!userHasScrolled) {
                                                            scrollToBottom();
                                                        }
                                                    }}
                                                    onTypingComplete={() => {
                                                        setTypingMessageIds(prev => prev.filter(id => id !== msg.id));
                                                        if (!userHasScrolled) {
                                                            scrollToBottom();
                                                        }
                                                        if (msg.onComplete) {
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
                                {/* Chat input if questioning is enabled */}
                                <div className="w-full flex space-x-2 mb-2">
                                    <textarea
                                        value={input}
                                        onChange={handleInputChange}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' && !e.shiftKey) {
                                                e.preventDefault();
                                                if (input.trim() && isQuestioningEnabled && !botThinking) {
                                                    handleUserQuestion();
                                                }
                                            }
                                        }}
                                        disabled={!isQuestioningEnabled || botThinking}
                                        placeholder={
                                            botThinking 
                                            ? "Thinking..." 
                                            : isQuestioningEnabled 
                                                ? "Ask a question..." 
                                                : "Please wait..."
                                        }
                                        className="flex-1 bg-white bg-opacity-10 border border-gray-700 rounded-md p-3 text-white resize-none h-16"
                                    />
                                    <button
                                        onClick={handleUserQuestion}
                                        disabled={!input.trim() || !isQuestioningEnabled || botThinking}
                                        className={`px-5 rounded-md ${
                                            !input.trim() || !isQuestioningEnabled || botThinking
                                                ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                                : 'bg-blue-600 text-white hover:bg-blue-700'
                                        }`}
                                    >
                                        Send
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Emergency Reset Button */}
            {process.env.NODE_ENV === 'development' && (
                <button 
                    onClick={resetStuckStates}
                    className="fixed bottom-5 right-5 bg-red-600 text-white p-2 rounded text-xs"
                >
                    Reset UI
                </button>
            )}
        </div>
    );
}