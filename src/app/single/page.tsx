'use client'

import { useState, useEffect, useRef } from 'react';
import { useFlow } from '@/context/FlowContext';
import Image from 'next/image';
import { Message } from '@/utils/types';
import TypewriterTextWrapper from '@/components/TypewriterTextWrapper';
import { aiService, AI_MODELS } from '@/services/AI';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';
import { useRouter } from 'next/navigation';
import { prepareMessagesForStorage } from '@/utils/messageUtils';

// Define the question type to include multiple choice options
interface Question {
    id: number;
    question: string;
    options?: string[] | Record<string, string>; // Support both array and object formats
    answer: string;
    correctAnswer?: string;
}

// Interface for agent prompts loaded from JSON
interface Agent {
  id: string;
  name: string;
  avatar: string;
  systemPrompt: string;
}

// Helper functions that don't use React hooks (safe to be outside the component)
// Ensure proper question text helper function 
const getQuestionText = (question: any): string => {
    if (typeof question === 'string') return question;
    if (question && typeof question === 'object' && question.question) return question.question;
    return JSON.stringify(question);
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

// Helper function to format time as MM:SS
const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
};

// Create a variable to store loaded agent prompt
let bobPrompt = ""; // This will be populated from JSON

export default function SinglePage() {
    const router = useRouter();
    const { completeLesson, lessonQuestionIndex, currentStage, userId, saveSessionData: saveToFlowContext, lessonType, hitId } = useFlow();
    
    // Debug line to see what's happening
    console.log("SINGLE PAGE - Current stage:", currentStage, "Question index:", lessonQuestionIndex);
    
    // --- STATE MANAGEMENT ---
    const [messages, setMessages] = useState<Message[]>([]);
    const [completedMessageIds, setCompletedMessageIds] = useState<number[]>([]);
    const [scratchboardContent, setScratchboardContent] = useState('');
    const [input, setInput] = useState('');
    const [finalAnswer, setFinalAnswer] = useState('');
    const [selectedOption, setSelectedOption] = useState<string>('');
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
    const [nextMessageId, setNextMessageId] = useState(3);
    const [typingMessageIds, setTypingMessageIds] = useState<number[]>([]);
    const [isQuestioningEnabled, setIsQuestioningEnabled] = useState(false);
    const [botThinking, setBotThinking] = useState(false);
    const [timeElapsed, setTimeElapsed] = useState(0); // Time counting up before submission
    const [timeLeft, setTimeLeft] = useState(90);    // Time counting down after discussion starts
    const [evaluationComplete, setEvaluationComplete] = useState(false);
    const [userHasScrolled, setUserHasScrolled] = useState(false);
    const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
    const [currentModel] = useState(AI_MODELS.GPT4O.id);
    const [sessionStartTime] = useState<Date>(new Date());
    const [submissionTime, setSubmissionTime] = useState<Date | null>(null);
    const [lastMessageTime, setLastMessageTime] = useState(Date.now());
    const [wordCount, setWordCount] = useState(0);
    const [skipTypewriter, setSkipTypewriter] = useState(false);
    const [canSubmit, setCanSubmit] = useState(false); // Add state for tracking if submit button can be enabled
    const [promptLoaded, setPromptLoaded] = useState(false); // Add state for tracking prompt loading
    
    const interventionRef = useRef(false);
    const wordThreshold = 750; // Match the 750 word threshold from group page
    const timeThreshold = 30000; // 30 seconds
    const lastWordCountResetRef = useRef<number | null>(null);
    const roundEndedRef = useRef(false);
    const canSubmitRef = useRef(false); // Add ref for stable submit button state tracking
    
    // --- REFS ---
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const nextMessageIdRef = useRef(3);
    // Add a messageStateRef to track message state outside of React rendering
    const messageStateRef = useRef<Message[]>([]);
    
    // Update the setMessages function to also update the ref
    const updateMessages = (newMessages: Message[] | ((prev: Message[]) => Message[])) => {
        // First apply the update to the state
        setMessages(prev => {
            const nextMessages = typeof newMessages === 'function' 
                ? newMessages(prev) 
                : newMessages;
            
            // Then update our ref
            messageStateRef.current = nextMessages;
            
            // Return for the actual state update
            return nextMessages;
        });
    };

    // Add this effect to track message changes and update the ref
    useEffect(() => {
        // Update messageStateRef whenever messages change
        messageStateRef.current = messages;
        console.log(`Messages updated: now has ${messages.length} messages (ref updated)`);
        
        if (messages.length > 0) {
            const lastMsg = messages[messages.length - 1];
            console.log(`Last message - sender: ${lastMsg.sender}, text preview: ${typeof lastMsg.text === 'string' ? lastMsg.text.substring(0, 30) + '...' : 'non-string'}`);
        }
    }, [messages]);
    
    // Load Bob's prompt from JSON
    useEffect(() => {
        const loadPrompt = async () => {
            try {
                const response = await fetch('/prompts/single.json');
                if (!response.ok) {
                    throw new Error('Failed to fetch agent prompts');
                }
                
                const data = await response.json();
                if (data.agents && Array.isArray(data.agents) && data.agents.length > 0) {
                    // Find Bob's prompt
                    const bob = data.agents.find((agent: Agent) => agent.id === 'bob');
                    if (bob && bob.systemPrompt) {
                        bobPrompt = bob.systemPrompt;
                        console.log('Loaded Bob prompt from JSON');
                        setPromptLoaded(true);
                    } else {
                        throw new Error('Bob prompt not found in JSON');
                    }
                } else {
                    throw new Error('Invalid prompts data format');
                }
            } catch (error) {
                console.error("Error loading Bob prompt:", error);
                // Provide fallback prompt if loading fails
                bobPrompt = "You are a supportive math tutor. Guide the student toward understanding.";
                setPromptLoaded(true);
            }
        };
        
        loadPrompt();
    }, []);
    
    // --- HELPER FUNCTIONS THAT USE HOOKS (must be inside component) ---
    // Function to handle scroll events in the chat container
    const handleScroll = () => {
        if (!chatContainerRef.current) return;
        
        const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
        const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
        
        if (!isAtBottom && !userHasScrolled) {
            setUserHasScrolled(true);
        } else if (isAtBottom && userHasScrolled) {
            setUserHasScrolled(false);
        }
    };
    
    // Function to scroll chat to the bottom
    const scrollToBottom = () => {
        if (chatContainerRef.current) {
            const { scrollHeight } = chatContainerRef.current;
            chatContainerRef.current.scrollTop = scrollHeight;
        }
    };
    
    // Fix message ID generation to avoid duplicate keys
    const getUniqueMessageId = () => {
        const id = nextMessageIdRef.current;
        nextMessageIdRef.current += 1;
        
        // Also update the state for display purposes, but don't rely on it for generating IDs
        setNextMessageId(nextMessageIdRef.current);
        
        return id;
    };
    
    // Add this helper function to match multi page
    const ensureNoTypingInProgress = (callback: () => void, maxDelay = 10000) => {
        const startTime = Date.now();

        const tryCallback = () => {
            // Safety timeout to prevent infinite waiting
            if (Date.now() - startTime > maxDelay) {
                console.log('Max delay reached, forcing callback');
                callback();
                return;
            }

            if (typingMessageIds.length > 0) {
                console.log('Typing in progress, waiting...');
                setTimeout(tryCallback, 100);
                return;
            }

            // No typing in progress, safe to proceed
            console.log('No typing in progress, proceeding with action');
            callback();
        };

        tryCallback();
    };
    
    // Function to handle option selection for multiple choice questions
    const handleOptionSelect = (option: string) => {
        setSelectedOption(option);
        setFinalAnswer(option);
    };
    
    // Handle key presses in the chat input
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey && input.trim() && isQuestioningEnabled) {
            e.preventDefault();
            handleUserQuestion();
        }
    };

    // Make sure we have loaded prompts and questions before initializing
    useEffect(() => {
        if (promptLoaded && currentQuestion) {
            console.log("All resources loaded, component is ready");
        }
    }, [promptLoaded, currentQuestion]);
    
    // --- EFFECT HOOKS ---
    // Update the flow stage check to match the multi page approach
    useEffect(() => {
        if (currentStage !== 'lesson') {
            console.warn(`Warning: User accessed single page in incorrect stage: ${currentStage}`);
            
            // Instead of immediate redirect, check localStorage directly as a fallback
            const storedStage = localStorage.getItem('currentStage');
            
            // Update localStorage if needed to match the current page
            if (storedStage !== 'lesson') {
                console.log('Redirecting to proper stage...');
                // router.push('/'); // Optionally redirect
            }
        }
    }, [currentStage]);
    
    // Load the specific question based on lessonQuestionIndex
    useEffect(() => {
        const fetchQuestion = async () => {
            try {
                const response = await fetch('/questions.json');
                if (!response.ok) {
                    throw new Error('Failed to fetch questions');
                }

                const data = await response.json();

                // Get questions array
                const allQuestionsData = data.questions || [];
                
                // Use the predetermined lessonQuestionIndex from the Flow context
                if (typeof lessonQuestionIndex === 'number' && 
                    lessonQuestionIndex >= 0 && 
                    lessonQuestionIndex < allQuestionsData.length) {
                    console.log(`Using predetermined lessonQuestionIndex: ${lessonQuestionIndex}`);
                    setCurrentQuestion(allQuestionsData[lessonQuestionIndex]);
                } else {
                    console.warn(`Invalid lessonQuestionIndex: ${lessonQuestionIndex}, using default question`);
                    setCurrentQuestion(allQuestionsData[0]); 
                }
            } catch (error) {
                console.error("Error loading question:", error);
                setCurrentQuestion(null);
            }
        };

        fetchQuestion();
    }, [lessonQuestionIndex]);
    
    // Add useEffect to track message changes for interventions
    useEffect(() => {
        if (messages.length > 0) {
            setLastMessageTime(Date.now());
        }
    }, [messages]);

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

    // Add useEffect to periodically check for intervention triggers
    useEffect(() => {
        if (!hasSubmittedAnswer || !isQuestioningEnabled) return;
        
        const intervalId = setInterval(checkInterventionTriggers, 5000);
        return () => clearInterval(intervalId);
    }, [hasSubmittedAnswer, isQuestioningEnabled, messages, wordCount, lastMessageTime]);

    // Add timer effect to properly track time and enable submit button
    useEffect(() => {
        // Only run timer before submission
        if (hasSubmittedAnswer || roundEndedRef.current) return;
        
        // Set up the counting timer for pre-submission
        const timerId = setInterval(() => {
            setTimeElapsed(prev => {
                const newTime = prev + 1;
                // Enable submit button after 10 seconds
                if (newTime >= 10 && !canSubmitRef.current) {
                    console.log("Timer reached 10 seconds, enabling submit button");
                    canSubmitRef.current = true;
                    setCanSubmit(true);
                }
                return newTime;
            });
        }, 1000);
        
        // Create a separate timeout to ensure button is enabled even if timer has issues
        const enableButtonTimeout = setTimeout(() => {
            if (!canSubmitRef.current) {
                console.log("Force enabling submit button via backup timeout");
                canSubmitRef.current = true; 
                setCanSubmit(true);
            }
        }, 10500);
        
        // Clean up timer on unmount or when dependencies change
        return () => {
            clearInterval(timerId);
            clearTimeout(enableButtonTimeout);
        };
    }, [hasSubmittedAnswer]); // Don't include timeElapsed here to avoid restart loops

    // Add post-submission countdown timer effect
    useEffect(() => {
        // Only run this timer after submission
        if (!hasSubmittedAnswer || roundEndedRef.current) return;
        
        console.log("Starting post-submission countdown timer");
        
        // Set up the countdown timer
        const timerId = setInterval(() => {
            setTimeLeft(prev => {
                // When timer reaches zero, handle completion
                if (prev <= 1) {
                    console.log("Discussion time expired");
                    roundEndedRef.current = true;
                    
                    // Add time's up message and disable questioning
                    const timeUpMessageId = getUniqueMessageId();
                    updateMessages(prev => [
                        ...prev,
                        {
                            id: timeUpMessageId,
                            sender: 'system',
                            text: "Time's up! Moving to the next question...",
                            timestamp: new Date().toISOString()
                        }
                    ]);
                    
                    setIsQuestioningEnabled(false);
                    
                    // SAVE SESSION DATA before navigating
                    const userAnswerText = finalAnswer.trim() || "No answer provided";
                    console.log('Saving final session data before completing lesson');
                    
                    // Navigate to next stage after saving data
                    setTimeout(() => {
                        saveSessionData(userAnswerText, false)
                            .then(() => {
                                console.log('Final session data saved, completing lesson');
                                completeLesson();
                            })
                            .catch(error => {
                                console.error('Error saving session data:', error);
                                // Still continue even if save fails
                                completeLesson();
                            });
                    }, 1000);
                    
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);
        
        // Clean up timer on unmount or when dependencies change
        return () => {
            clearInterval(timerId);
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [hasSubmittedAnswer, completeLesson]); // Only include the most critical dependencies

    // Add a function to save session data to flow context
    const saveSessionData = async (finalAnswerText: string, isTimeout: boolean) => {
        try {
            // Calculate session duration
            const endTime = submissionTime || new Date();
            const durationMs = endTime.getTime() - sessionStartTime.getTime();
            const durationSeconds = Math.floor(durationMs / 1000);
            
            // Get the question text
            const questionText = currentQuestion?.question || '';
            
            // Check if the answer is correct
            const isCorrect = checkAnswerCorrectness(finalAnswerText, currentQuestion);
            
            // Use messageStateRef to ensure all messages are captured, not just what's in the state
            const currentMessages = messageStateRef.current;
            console.log(`💾 SINGLE [Session Save] Using ${currentMessages.length} messages from messageStateRef`);
            
            // Process messages using the utility function
            const cleanedMessages = prepareMessagesForStorage(currentMessages);
            
            console.log(`💾 SINGLE [Session Save] Saving data for question ${lessonQuestionIndex}`);
            console.log(`💾 SINGLE [Session Save] Message count: ${cleanedMessages.length}`);
            
            // Save to flow context - use type assertion to avoid TypeScript errors with lessonType
            saveToFlowContext({
                questionId: lessonQuestionIndex,
                questionText,
                startTime: sessionStartTime,
                endTime,
                duration: durationSeconds,
                finalAnswer: finalAnswerText,
                scratchboardContent,
                messages: cleanedMessages,
                isCorrect,
                timeoutOccurred: isTimeout,
                lessonType // Include lessonType in the saved data
            } as any); // Use type assertion to avoid TypeScript errors
            
            console.log(`✅ SINGLE [Session Save] Data saved to flow context successfully for question ${lessonQuestionIndex}`);
            return true;
        } catch (error) {
            console.error(`❌ SINGLE [Session Save] Error saving session data:`, error);
            return false;
        }
    };

    // Helper function to check if an answer is correct
    const checkAnswerCorrectness = (userAnswer: string, question: any): boolean => {
        if (!question) return false;
        
        // Check for correctAnswer first, then fall back to answer
        const correctAnswer = question.correctAnswer || question.answer;
        if (!correctAnswer) return false;
        
        // Simple string comparison for multiple choice options
        const normalizedUserAnswer = userAnswer.trim().toLowerCase();
        const normalizedCorrectAnswer = correctAnswer.trim().toLowerCase();
        
        return normalizedUserAnswer === normalizedCorrectAnswer;
    };

    // --- AI INTERACTION FUNCTIONS ---
    /* Update Bob's system prompt
Context & Instructions:
1. Maintain a friendly, encouraging tone.
2. Point out both correct aspects and areas for improvement in student work.
3. Ask guiding questions that lead the student to discover key insights.
4. Provide clear explanations with step-by-step reasoning.
5. When highlighting an error, explain why it is incorrect and suggest a better approach.
6. Balance between giving too much help and too little - aim to develop student independence.

CRITICAL MATH FORMATTING INSTRUCTIONS:
1. ALL mathematical expressions MUST be enclosed in LaTeX delimiters with single $ symbols
2. NEVER write math expressions without proper LaTeX formatting
3. Examples of proper formatting:
   - Use $2^3$ instead of 2³ or 2^3
   - Use $\\frac{1}{2}$ instead of 1/2
   - Use $\\sqrt{x}$ instead of √x
   - Use $\\times$ instead of × or x
   - Use $5 \\cdot 3$ for multiplication instead of 5*3
4. NEVER use \\[ \\] delimiters for display math - ONLY use single $ symbols
5. Never use double $$ delimiters
6. Ensure ALL numbers in calculations use proper LaTeX when in mathematical context
7. Format operators properly: $+$, $-$, $\\div$
8. For multi-line equations or display math, use multiple separate $ expressions instead of \\[ \\]`;
*/
    // Add a function to count words in messages
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

    // Start conversation with initial message from Bob
    const startConversation = (question: Question, studentAnswer: string, scratchpad: string) => {
        console.log('Starting conversation with Bob...');
        
        // Reset discussion timer to 2 minutes
        setTimeLeft(90);
        roundEndedRef.current = false;
        
        // Use placeholder for empty scratchboard
        const workContent = scratchpad.trim() || "[No work shown]";
        
        // Create the user answer message
        const userAnswerMessage: Message = {
            id: getUniqueMessageId(),
            sender: 'user',
            text: `My answer: ${studentAnswer}\n\nMy work:\n${workContent}`,
            timestamp: new Date().toISOString()
        };

        // Create Bob's initial response (placeholder that will be replaced)
        const bobMessage: Message = {
            id: getUniqueMessageId(),
            sender: 'ai',
            agentId: 'bob',
            text: "I'm looking at your solution...",
            timestamp: new Date().toISOString()
        };

        // Add both messages to the state using updateMessages
        updateMessages([userAnswerMessage, bobMessage]);
        
        // Log to ensure messages are created
        console.log(`💾 SINGLE [Messages Created] Initial conversation messages: ${JSON.stringify([userAnswerMessage, bobMessage])}`);
        
        // Keep track of the message ID to replace later
        const bobMessageId = bobMessage.id;
        
        // Generate response
        generateTeacherInitialResponse(bobMessageId, question, studentAnswer, workContent);
    };

    // Function to generate teacher's initial response with the new format
    const generateTeacherInitialResponse = async (
        messageId: number,
        question: Question,
        studentAnswer: string,
        scratchpad: string
    ) => {
        try {
            const questionText = getQuestionText(question);
            const correctAnswer = question.correctAnswer || question.answer || "not provided";
            
            // Get options if available
            const options = question.options || [];
            const isMultipleChoice = (Array.isArray(options) && options.length > 0) ||
                                    (!Array.isArray(options) && Object.keys(options).length > 0);

            // Build prompt for teacher's response
            let promptText = `The current problem is: ${questionText}\n\n`;
            
            if (isMultipleChoice) {
                promptText += `This is a multiple choice problem with the following options:\n`;
                
                if (Array.isArray(options)) {
                    options.forEach((option: string, index: number) => {
                        promptText += `${String.fromCharCode(65 + index)}. ${option}\n`;
                    });
                } else {
                    Object.entries(options).forEach(([key, value]) => {
                        promptText += `${key}. ${value}\n`;
                    });
                }
                promptText += `\n`;
            }
            
            promptText += `The correct answer is: ${correctAnswer}\n\n`;
            promptText += `The student selected this answer: ${studentAnswer}\n\n`;
            promptText += `The student's work: ${scratchpad}\n\n`;

            promptText += `As Bob (the math teacher), provide feedback on the student's ${isMultipleChoice ? 'multiple choice selection' : 'answer'}:
1. Begin by stating whether their selected answer is correct or not
2. Acknowledge what they did well in their approach
3. Point out any misconceptions or errors in their reasoning
4. Provide a clear explanation of the correct solution approach
5. End with a question to check understanding or advance their thinking

Keep your tone encouraging and conversational.`;

            // Generate response from AI service
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: bobPrompt,
                    model: currentModel
                }
            );

            // Replace typing indicator with actual response
            updateMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: response,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));

            // Add to typing IDs to enable animation
            setTypingMessageIds(prev => [...prev, messageId]);

        } catch (error) {
            console.error("Error generating teacher's initial response:", error);
            
            // Fallback response
            const fallbackText = `Let's look at your answer. I see you selected "${studentAnswer}". Your work shows [analyzing reasoning]. We need to think about this problem in terms of [key concept]. Would you like me to explain why?`;
            
            updateMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: fallbackText,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // Add to typing IDs for animation
            setTypingMessageIds(prev => [...prev, messageId]);
        }
    };

    // Add functions for Bob-only intervention
    const checkInterventionTriggers = () => {
        // Skip if another intervention is already in progress
        if (interventionRef.current) {
            console.log("Intervention already in progress, skipping check");
            return;
        }
        
        const now = Date.now();
        const timeSinceLastMessage = now - lastMessageTime;
        
        console.log(`Checking triggers - Words: ${wordCount}/${wordThreshold}, Time: ${Math.round(timeSinceLastMessage/1000)}s/${Math.round(timeThreshold/1000)}s`);
        
        // Word count trigger (750 words)
        if (wordCount >= wordThreshold) {
            console.log("Word count threshold reached, triggering feedback intervention");
            interventionRef.current = true;
            
            // IMPORTANT: Set this first before triggering the intervention
            lastWordCountResetRef.current = Date.now();
            
            // Reset word count after triggering AND record the reset time
            setWordCount(0);
            
            // Trigger Bob's feedback
            triggerBobFeedback();
            return;
        }
        
        // Time-based trigger remains unchanged
        if (timeSinceLastMessage >= timeThreshold) {
            console.log("Time threshold reached, triggering brainstorm intervention");
            interventionRef.current = true;
            setLastMessageTime(now);
            
            triggerBobBrainstorm();
        }
    };

    // Function to trigger Bob's feedback after word count threshold
    const triggerBobFeedback = () => {
        const bobId = getUniqueMessageId();
        
        updateMessages(prev => [
            ...prev,
            {
                id: bobId,
                sender: 'ai',
                text: '...',
                agentId: 'bob',
                timestamp: new Date().toISOString(),
                onComplete: () => {
                    // CRITICAL FIX: Add a timeout before clearing the intervention flag
                    setTimeout(() => {
                        // Verify the word count is at 0 before clearing intervention flag
                        console.log(`Intervention complete. Current word count: ${wordCount}`);
                        
                        // For safety, make sure word count is properly reset
                        setWordCount(0);
                        
                        // Update the timestamp after intervention is truly complete
                        lastWordCountResetRef.current = Date.now();
                        
                        // Finally clear the intervention flag
                        interventionRef.current = false;
                        
                        console.log("Intervention complete, system ready for next threshold check");
                    }, 1000); // Add a 1 second delay
                }
            }
        ]);
        
        generateBobFeedback(bobId, messageStateRef.current);
    };

    // Word Count Intervention - Feedback on discussion
    const generateBobFeedback = async (messageId: number, contextMessages: Message[]) => {
        try {
            // Format conversation history
            const messagesSummary = contextMessages.map(msg => {
                return `${msg.sender === 'user' ? 'Student' : 'Bob'}: ${typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)}`;
            }).join('\n\n');
            
            // Build prompt for Bob's feedback - FOCUSED ON CONVERSATION REVIEW
            let promptText = `The current problem is: ${getQuestionText(currentQuestion)}\n\n`;
            promptText += `Here's the conversation so far:\n${messagesSummary}\n\n`;
            promptText += `As the teacher (Bob), provide DETAILED FEEDBACK on the discussion so far. Review what has been discussed and identify both strengths and areas for improvement in the student's understanding.

Specifically:
1. Highlight one correct idea from the student
2. Identify one misunderstanding or area that needs clarification
3. Suggest one strategy to deepen understanding of the problem
4. End with a specific question that prompts the student to reflect on their approach

Use LaTeX notation with $ for math expressions.`;
            
            // Generate response
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: bobPrompt,
                    model: 'gpt-4o-2024-08-06'
                }
            );
            
            // Update message
            updateMessages(prev => prev.map(msg =>
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
            console.error("Error generating Bob's feedback:", error);
            
            // Fallback response
            updateMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: "I notice there are a few things we should clarify in our discussion. Let me highlight some key points... [Error generating complete response]. Does that help clarify things?",
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // Add to typing IDs for animation
            setTypingMessageIds(prev => [...prev, messageId]);
        }
    };

    // Function to trigger Bob's brainstorm after inactivity
    const triggerBobBrainstorm = () => {
        const bobId = getUniqueMessageId();
        
        updateMessages(prev => [
            ...prev,
            {
                id: bobId,
                sender: 'ai',
                text: '...',
                agentId: 'bob',
                timestamp: new Date().toISOString(),
                onComplete: () => {
                    interventionRef.current = false;
                }
            }
        ]);
        
        generateBobBrainstorm(bobId);
    };

    // Time-Based Intervention - Brief prompt to restart discussion
    const generateBobBrainstorm = async (messageId: number) => {
        try {
            const questionText = getQuestionText(currentQuestion);
            
            // Build prompt for Bob's brainstorm - SHORTER and more DIRECT
            let promptText = `The current problem is: ${questionText}\n\n`;
            promptText += `The discussion has paused. As the teacher (Bob), BRIEFLY introduce ONE new insight or approach to prompt the student to engage with the problem.

Keep your response to 3 sentences maximum and end with a specific, direct question to restart the conversation.

Use LaTeX notation with $ for any math expressions.`;
            
            // Generate response
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: bobPrompt,
                    model: 'gpt-4o-2024-08-06'
                }
            );
            
            // Update message
            updateMessages(prev => prev.map(msg =>
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
            console.error("Error generating Bob's brainstorm:", error);
            
            // Fallback response
            updateMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: "I just had a thought that might help you understand this problem better... [Error generating complete response]. Does that give you a different perspective?",
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // Also add to typingMessageIds in error case
            setTypingMessageIds(prev => [...prev, messageId]);
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
                sendUserMessage();
            }, 50);
        } else {
            // No animations in progress, send message directly
            sendUserMessage();
        }
    };

    // Replace the sendUserMessage function with this enhanced version
    const sendUserMessage = () => {
        const userMessageId = getUniqueMessageId();
        const bobResponseId = getUniqueMessageId();

        // Create proper user message
        const userMessage: Message = {
            id: userMessageId,
            sender: 'user',
            text: input,
            timestamp: new Date().toISOString()
        };

        // Add user message immediately with enhanced logging using updateMessages
        updateMessages(prev => {
            const newMessages = [...prev, userMessage];
            console.log(`📝 SINGLE [Message Added] User message ID ${userMessageId}. Total count: ${newMessages.length}`, 
                       {length: input.length, preview: input.substring(0, 50) + (input.length > 50 ? '...' : '')});
            return newMessages;
        });
        
        // Create Bob's placeholder
        const bobPlaceholder: Message = {
            id: bobResponseId,
            sender: 'ai',
            agentId: 'bob',
            text: '...',
            timestamp: new Date().toISOString(),
            onComplete: () => {
                // Force an update to ensure all messages are captured
                updateMessages(current => {
                    console.log(`📝 SINGLE [Message Completed] Bob response ID ${bobResponseId}. Total count: ${current.length}`);
                    // Return same array but forces React to recognize the update
                    return [...current]; 
                });
            }
        };

        // Add Bob's placeholder
        setTimeout(() => {
            updateMessages(prev => {
                const newMessages = [...prev, bobPlaceholder];
                console.log(`📝 SINGLE [Message Added] Bob placeholder ID ${bobResponseId}. Total count: ${newMessages.length}`);
                return newMessages;
            });
            
            setTypingMessageIds(prev => [...prev, bobResponseId]);
            
            // Clear input and reset intervention flags
            setInput('');
            interventionRef.current = false;
            setLastMessageTime(Date.now());
            
            // Generate Bob's response
            generateBobResponse(bobResponseId, input);
        }, 10);
    };

    // Function to generate Bob's response to a user question
    const generateBobResponse = async (messageId: number, userQuestion: string) => {
        try {
            // Format all previous messages for context - use up to 5 most recent messages
            const previousMessages = messageStateRef.current.slice(-5);
            
            // Create a detailed conversation summary with specific highlights
            const messagesSummary = previousMessages.map(msg => {
                const sender = msg.sender === 'user' ? 'Student' : 'Teacher (Bob)';
                const content = typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text);
                
                // Highlight key points from previous exchanges
                let highlightedContent = content;
                
                // For student messages, try to identify questions or confusion points
                if (msg.sender === 'user') {
                    // If message has question marks, those are important to highlight
                    if (content.includes('?')) {
                        highlightedContent = `[Student question: ${content}]`;
                    }
                }
                
                return `${sender}: ${highlightedContent}`;
            }).join('\n\n');
            
            // Get the question text
            const questionText = getQuestionText(currentQuestion);
            
            // Build prompt for Bob's response with enhanced conversation awareness
            let promptText = `The current problem is: ${questionText}\n\n`;
            
            if (messagesSummary) {
                promptText += `Here's the conversation so far:\n${messagesSummary}\n\n`;
                promptText += `Based on this specific conversation history, consider:\n- What key points has the student raised?\n- What concepts might they be struggling with?\n- What have you already explained that you can build upon?\n\n`;
            }
            
            promptText += `The student just asked: "${userQuestion}"\n\n`;
            promptText += `As the teacher (Bob), respond to the student's question in a way that maintains natural conversation flow. Your response should:\n
1. SPECIFICALLY reference elements from your previous exchanges with phrases like "As we discussed earlier..." or "Building on what you mentioned about..."
2. Address the student's specific question directly and acknowledge their thought process
3. Maintain continuity by connecting your new explanations to concepts already covered
4. Use a consistent, warm teaching personality throughout all your interactions
5. End with a follow-up question that logically extends from both the student's question and your response

Use LaTeX notation enclosed in $ symbols for all mathematical expressions. Your response should feel like a natural continuation of the ongoing tutorial conversation, not a standalone answer.`;
            
            // Generate response from AI service
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: bobPrompt,
                    model: 'gpt-4o-2024-08-06'
                }
            );
            
            // Update message with response using updateMessages
            updateMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: response,
                        timestamp: new Date().toISOString()
                      }
                    : msg
            ));
            
            // Add to typing message IDs
            setTypingMessageIds(prev => [...prev, messageId]);
            
        } catch (error) {
            console.error("Error generating Bob's response:", error);
            
            // Fallback response
            updateMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: "I'm considering your question... [Error generating complete response]. Can you clarify what you're trying to understand?",
                        timestamp: new Date().toISOString()
                      }
                    : msg
            ));
            
            // Also add to typingMessageIds in error case
            setTypingMessageIds(prev => [...prev, messageId]);
        }
    };
    
    // Modify handleSend to work with student-first approach and use updateMessages
    const handleSend = () => {
        if (typingMessageIds.length > 0) return;

        // Record user activity time and submission time
        const now = new Date();
        setSubmissionTime(now);

        ensureNoTypingInProgress(() => {
            // Use whatever final answer they have, even if empty
            const submissionText = finalAnswer.trim() || selectedOption || "No answer specified";
            
            const userFinalAnswer: Message = {
                id: getUniqueMessageId(),
                sender: 'user',
                text: `My final answer is: ${submissionText}\n\nMy reasoning:\n${scratchboardContent || "No work shown"}`,
                timestamp: now.toISOString()
            };
            
            updateMessages([userFinalAnswer]); // Start with just the user's answer
            setIsQuestioningEnabled(true); // Enable questioning
            setHasSubmittedAnswer(true); // Mark that the answer has been submitted
            
            // Do NOT save session data here - wait until the discussion is complete
            // This prevents duplicate session data submission

            // Start conversation with Bob after submission
            startConversation(
                currentQuestion!, 
                submissionText, 
                scratchboardContent || "No work shown"
            );
        });
    };

    // Function to render chat messages with typewriter effect
    const renderChatMessages = () => {
        return (
            <div 
                ref={chatContainerRef}
                className="flex-1 bg-white bg-opacity-10 rounded-md overflow-y-auto p-2 chat-messages scrollbar"
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
                                    src="/tutor_avatar.svg"
                                    alt="Bob (Teacher)"
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
                                    Bob (Teacher)
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
            </div>
        );
    };

    // If question hasn't loaded yet
    if (!currentQuestion) {
        return (
            <div className="flex flex-col h-screen justify-center items-center bg-gray-900 text-white">
                <div className="text-2xl">Loading question...</div>
            </div>
        );
    }
    
    // --- RENDER COMPONENT ---
    return (
        <div className="h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4 flex flex-row overflow-hidden fixed inset-0">
            {/* LEFT PANEL - Problem, Final Answer, Scratchboard */}
            <div className={`${hasSubmittedAnswer ? 'w-1/2 pr-2' : 'w-full'} flex flex-col h-full overflow-hidden`}>
                {/* Problem Display with Timer inside */}
                {currentQuestion && (
                    <div className="bg-white bg-opacity-20 p-4 rounded-md mb-4 border-2 border-purple-400">
                        <div className="flex justify-between items-start mb-2">
                            <h2 className="text-xl text-white font-semibold">Problem:</h2>
                            {hasSubmittedAnswer && <div className="bg-purple-900 bg-opacity-50 rounded-lg px-3 py-1 text-white">
                                Time: {formatTime(timeLeft)}
                            </div>}
                        </div>
                        <p className="text-white text-lg">{formatMathExpression(currentQuestion.question)}</p>
                    </div>
                )}

                {/* Final Answer - Now ALWAYS visible like in MultiPage */}
                <div className="bg-white bg-opacity-15 p-4 rounded-md mb-4 border border-blue-500 flex-shrink-0">
                    <h3 className="text-lg text-white font-semibold mb-2">Your Final Answer</h3>
                    
                    {/* Multiple Choice Options - show when question has options */}
                    {currentQuestion && currentQuestion.options && (
                        <div className="grid grid-cols-2 gap-2 mb-3">
                            {!hasSubmittedAnswer ? (
                                Array.isArray(currentQuestion.options) ? (
                                    // Handle array-style options
                                    currentQuestion.options.map((option: string, index: number) => (
                                        <div 
                                            key={index}
                                            onClick={() => handleOptionSelect(option)}
                                            className={`cursor-pointer p-3 rounded-md border-2 ${
                                                finalAnswer === option 
                                                    ? 'bg-blue-500 bg-opacity-30 border-blue-500' 
                                                    : 'bg-white bg-opacity-10 border-gray-600'
                                            }`}
                                        >
                                            <div className="flex items-center">
                                                <div className={`w-6 h-6 mr-2 rounded-full border-2 flex items-center justify-center ${
                                                    finalAnswer === option 
                                                        ? 'border-blue-500 bg-blue-500 text-white' 
                                                        : 'border-gray-400'
                                                }`}>
                                                    {finalAnswer === option && <span>✓</span>}
                                                </div>
                                                <div className="text-white">{formatMathExpression(option)}</div>
                                            </div>
                                        </div>
                                    ))
                                ) : (
                                    // Handle object-style options
                                    Object.entries(currentQuestion.options).map(([key, value]) => (
                                        <div 
                                            key={key}
                                            onClick={() => handleOptionSelect(value as string)}
                                            className={`cursor-pointer p-3 rounded-md border-2 ${
                                                finalAnswer === value 
                                                    ? 'bg-blue-500 bg-opacity-30 border-blue-500' 
                                                    : 'bg-white bg-opacity-10 border-gray-600'
                                            }`}
                                        >
                                            <div className="flex items-center">
                                                <div className={`w-6 h-6 mr-2 rounded-full border-2 flex items-center justify-center ${
                                                    finalAnswer === value 
                                                        ? 'border-blue-500 bg-blue-500 text-white' 
                                                        : 'border-gray-400'
                                                }`}>
                                                    {finalAnswer === value && <span>✓</span>}
                                                </div>
                                                <div className="text-white">{formatMathExpression(value as string)}</div>
                                            </div>
                                        </div>
                                    ))
                                )
                            ) : (
                                // After submission, show only the selected answer in a read-only format
                                <div className="p-3 rounded-md border-2 bg-blue-500 bg-opacity-30 border-blue-500">
                                    <div className="flex items-center">
                                        <div className="w-6 h-6 mr-2 rounded-full border-2 flex items-center justify-center border-blue-500 bg-blue-500 text-white">
                                            <span>✓</span>
                                        </div>
                                        <div className="text-white">{formatMathExpression(finalAnswer)}</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Text Input - show only when no options are available */}
                    {(!currentQuestion || !currentQuestion.options) && (
                        <input
                            type="text"
                            value={finalAnswer}
                            onChange={(e) => setFinalAnswer(e.target.value)}
                            placeholder="Enter your final answer here..."
                            className="w-full bg-white bg-opacity-10 text-white border border-gray-600 rounded-md px-3 py-2"
                            disabled={hasSubmittedAnswer}
                        />
                    )}
                    
                    {!hasSubmittedAnswer && (
                        <button
                            onClick={handleSend}
                            disabled={!finalAnswer.trim() || typingMessageIds.length > 0 || !canSubmit}
                            className={`w-full mt-2 px-4 py-2 rounded-md font-medium ${
                                finalAnswer.trim() && typingMessageIds.length === 0 && canSubmit
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                            }`}
                        >
                            {canSubmit 
                                ? 'Submit Final Answer' 
                                : `Wait ${Math.max(1, 10 - timeElapsed)}s...`
                            }
                        </button>
                    )}
                </div>

                {/* Scratchboard - Below final answer with matching styling */}
                <div className="flex-1 border border-gray-600 rounded-md p-3 bg-black bg-opacity-30 overflow-auto">
                    <textarea
                        value={scratchboardContent}
                        onChange={(e) => setScratchboardContent(e.target.value)}
                        className="w-full h-[calc(100%-40px)] min-h-[200px] bg-black bg-opacity-40 text-white border-none rounded p-2"
                        placeholder="Space for scratch work..."
                        readOnly={hasSubmittedAnswer} // Make read-only after submission
                    />
                </div>
            </div>

            {/* RIGHT PANEL - Chat (only shown after submission) */}
            {hasSubmittedAnswer && (
                <div className="chat-container flex-1 flex flex-col h-full overflow-hidden">
                    {renderChatMessages()}

                    <div className="mt-3 flex items-start gap-2 chat-input">
                        <textarea
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyDown}
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
                </div>
            )}
        </div>
    );
}