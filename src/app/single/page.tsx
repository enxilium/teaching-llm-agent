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
    options?: Record<string, string>; // A, B, C, D options
    answer: string;
    correctAnswer?: string;
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

export default function SinglePage() {
    const router = useRouter();
    const { completeLesson, lessonQuestionIndex, currentStage, userId, saveSessionData: saveToFlowContext } = useFlow();
    
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
    const [isQuestioningEnabled, setIsQuestioningEnabled] = useState(true);
    const [timeLeft, setTimeLeft] = useState(120); // 2 minutes
    const [evaluationComplete, setEvaluationComplete] = useState(false);
    const [userHasScrolled, setUserHasScrolled] = useState(false);
    const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
    const [currentModel] = useState(AI_MODELS.GPT4O.id);
    const [sessionStartTime] = useState<Date>(new Date());
    const [submissionTime, setSubmissionTime] = useState<Date | null>(null);
    const [lastMessageTime, setLastMessageTime] = useState(Date.now());
    const [wordCount, setWordCount] = useState(0);
    const [skipTypewriter, setSkipTypewriter] = useState(false);
    const interventionRef = useRef(false);
    const wordThreshold = 750; // Match the 750 word threshold from group page
    const timeThreshold = 30000; // 30 seconds
    const lastWordCountResetRef = useRef<number | null>(null);
    const roundEndedRef = useRef(false);
    
    // --- REFS ---
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const nextMessageIdRef = useRef(3);
    
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
    
    // Add a function to check answer correctness
    const checkAnswerCorrectness = (userAnswer: string, question: any): boolean => {
        if (!question || !question.correctAnswer) return false;
        
        // Simple string comparison (enhance as needed)
        const normalizedUserAnswer = userAnswer.trim().toLowerCase();
        const normalizedCorrectAnswer = question.correctAnswer.trim().toLowerCase();
        
        return normalizedUserAnswer === normalizedCorrectAnswer;
    };

    // Update saveSessionData to include correctness
    const saveSessionData = async (finalAnswerText: string, isTimeout: boolean) => {
        try {
            // Calculate session duration in seconds - use submission time if available
            const endTime = submissionTime || new Date();
            const durationMs = endTime.getTime() - sessionStartTime.getTime();
            const durationSeconds = Math.floor(durationMs / 1000);
            
            // Get the question text
            const questionText = getQuestionText(currentQuestion);
            
            // Check if the answer is correct
            const isCorrect = checkAnswerCorrectness(finalAnswerText, currentQuestion);
            
            // Log raw messages before cleaning
            console.log(`💾 SINGLE [Session Save] Original messages count: ${messages.length}`);
            if (messages.length > 0) {
                console.log(`💾 SINGLE [Message Sample] First message fields: ${Object.keys(messages[0]).join(', ')}`);
                console.log(`💾 SINGLE [Message Sample] First message text: ${typeof messages[0].text === 'string' ? 
                    messages[0].text.substring(0, 50) + '...' : 'non-string content'}`);
            }
            
            // Clean messages for database storage
            const cleanedMessages = prepareMessagesForStorage(messages);
            
            console.log(`💾 SINGLE [Session Save] Saving ${messages.length} messages (${cleanedMessages.length} after cleaning)`);
            
            // Add additional message verification
            const messagesWithoutProperties = cleanedMessages.filter(msg => 
                !msg.id || !msg.sender || !msg.text || !msg.timestamp
            );
            
            if (messagesWithoutProperties.length > 0) {
                console.warn(`⚠️ SINGLE Found ${messagesWithoutProperties.length} messages with missing properties`);
            }
            
            if (messages.length > 0) {
                console.log(`💾 SINGLE [Session Sample] First message: ${JSON.stringify(messages[0]).substring(0, 100)}...`);
                console.log(`💾 SINGLE [Session Sample] Last message: ${JSON.stringify(messages[messages.length-1]).substring(0, 100)}...`);
            }
            
            // Save to flow context 
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
                timeoutOccurred: isTimeout
            });
            
            console.log(`✅ SINGLE [Session Save] Data saved to flow context successfully with ${cleanedMessages.length} messages`);
        } catch (error) {
            console.error('❌ SINGLE [Session Save] Error saving session data:', error);
        }
    };

    // Function to handle timer expiration
    const handleTimeExpired = () => {
        console.log('Time expired - auto-submitting current answer');

        // Record submission time
        setSubmissionTime(new Date());

        // Prevent further edits
        setIsQuestioningEnabled(false);
        setHasSubmittedAnswer(true);

        // Use current values, even if empty
        const submissionText = finalAnswer.trim() || "No answer provided";

        // CHANGE: Remove system message, only keep user message
        const userTimeoutMessage: Message = {
            id: getUniqueMessageId(),
            sender: 'user',
            text: `My partial answer: ${submissionText}\n\nMy work so far:\n${scratchboardContent}`,
            timestamp: new Date().toISOString()
        };

        // Add only user message (no system message)
        setMessages(prev => {
            const newMessages = [userTimeoutMessage];
            console.log(`📝 SINGLE [Message Reset] Timeout submission. New count: ${newMessages.length}`);
            return newMessages;
        });

        // Do NOT save session data here - wait until the discussion is complete
        // This prevents duplicate session data submission

        // Start conversation with Bob about the partial answer
        startConversation(currentQuestion!, submissionText, scratchboardContent);
    };

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
                const data = await response.json();
                
                if (data && data.questions && 
                    typeof lessonQuestionIndex === 'number' && 
                    lessonQuestionIndex >= 0 && 
                    lessonQuestionIndex < data.questions.length) {
                    
                    setCurrentQuestion(data.questions[lessonQuestionIndex]);
                } else {
                    // Fallback to first question or show error
                    console.error('Invalid lesson question index or no questions found:', 
                        { lessonQuestionIndex, dataLength: data?.questions?.length });
                    
                    if (data && data.questions && data.questions.length > 0) {
                        setCurrentQuestion(data.questions[0]);
                    }
                }
            } catch (error) {
                console.error('Error loading questions:', error);
            }
        };
        
        fetchQuestion();
    }, [lessonQuestionIndex]);
    
    // Timer functionality
    useEffect(() => {
        if (!currentQuestion) return;

        if (!hasSubmittedAnswer) {
            // Pre-submission timer logic
            if (timeLeft <= 0) {
                handleTimeExpired();
                return;
            }
        } else {
            // Post-submission discussion timer
            if (timeLeft <= 0) {
                // Time to move to next page
                console.log('Discussion time expired - navigating to next page');
                
                // Show message about moving on
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
                
                // Save session data before navigating
                setTimeout(() => {
                    console.log(`💬 SINGLE Saving final session with ${messages.length + 1} messages`);
                    saveSessionData(finalAnswer.trim() || selectedOption || "No answer specified", false);
                    
                    // Navigate after data is saved
                    setTimeout(() => {
                        completeLesson();
                    }, 1000);
                }, 1000);
                
                return;
            }
        }

        // Continue with normal timer logic
        if (roundEndedRef.current) return;

        const timerId = setTimeout(() => {
            setTimeLeft((prevTime) => prevTime - 1);
        }, 1000);

        return () => clearTimeout(timerId);
    }, [timeLeft, hasSubmittedAnswer, currentQuestion]);
    
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

    // --- AI INTERACTION FUNCTIONS ---
    // Update Bob's system prompt
    const bobPrompt = `You are a supportive math tutor. Your role is to guide the student toward a correct and deep understanding of the solution process, rather than simply providing the final answer.
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
4. Never use double $$ delimiters
5. Ensure ALL numbers in calculations use proper LaTeX when in mathematical context
6. Format operators properly: $+$, $-$, $\\div$`;

    // Add function to count words in messages
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
        
        // Create the user answer message
        const userAnswerMessage: Message = {
            id: getUniqueMessageId(),
            sender: 'user',
            text: `My answer: ${studentAnswer}\n\nMy work:\n${scratchpad}`,
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

        // Add both messages to the state
        setMessages([userAnswerMessage, bobMessage]);
        
        // Log to ensure messages are created
        console.log(`💾 SINGLE [Messages Created] Initial conversation messages: ${JSON.stringify([userAnswerMessage, bobMessage])}`);
        
        // Keep track of the message ID to replace later
        const bobMessageId = bobMessage.id;
        
        // Generate response
        generateTeacherInitialResponse(bobMessageId, question, studentAnswer, scratchpad);
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
            const correctAnswer = question.correctAnswer || question.answer || 'not provided';
            
            // Build prompt for teacher's response
            let promptText = `The current problem is: ${questionText}\n\n`;
            promptText += `The correct answer is: ${correctAnswer}\n\n`;
            promptText += `The student's answer was: ${studentAnswer}\n\n`;
            promptText += `The student's work: ${scratchpad}\n\n`;
            
            promptText += `As the teacher (Bob), provide your response in this format:
1. Start with "The correct answer is [correct answer]."
2. Explain the proper solution approach in a clear, step-by-step manner
3. Provide specific feedback on the student's approach and where they went right or wrong
4. End with a question like "Any questions or confusions about this problem?" to encourage further discussion
5. Use LaTeX notation enclosed in $ symbols for all mathematical expressions`;
            
            // Generate response from AI service
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: bobPrompt,
                    model: 'gpt-4o-2024-08-06'
                }
            );
            
            // Update message with response
            setMessages(prev =>
                prev.map(msg =>
                    msg.id === messageId
                        ? { ...msg, text: response, timestamp: new Date().toISOString() }
                        : msg
                )
            );
            
            // ADD THIS LINE: Add to typingMessageIds for animation
            setTypingMessageIds(prev => [...prev, messageId]);
            
        } catch (error) {
            console.error("Error generating teacher's initial response:", error);
            
            // Fallback response
            const fallbackText = `The correct answer is ${question.correctAnswer || question.answer || '[correct answer]'}. Let me explain how to solve this step by step... [Error generating complete response]. Any questions or confusions about this problem?`;
            
            setMessages(prev =>
                prev.map(msg =>
                    msg.id === messageId
                        ? { ...msg, text: fallbackText, timestamp: new Date().toISOString() }
                        : msg
                )
            );
            
            // ALSO ADD HERE: Add to typingMessageIds in error case
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
        
        setMessages(prev => [
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
        
        generateBobFeedback(bobId, messages);
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
            console.error("Error generating Bob's feedback:", error);
            
            // Fallback response
            setMessages(prev => prev.map(msg =>
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
        
        setMessages(prev => [
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
            console.error("Error generating Bob's brainstorm:", error);
            
            // Fallback response
            setMessages(prev => prev.map(msg =>
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

        // Add user message immediately with enhanced logging
        setMessages(prev => {
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
                setMessages(current => {
                    console.log(`📝 SINGLE [Message Completed] Bob response ID ${bobResponseId}. Total count: ${current.length}`);
                    // Return same array but forces React to recognize the update
                    return [...current]; 
                });
            }
        };

        // Add Bob's placeholder
        setTimeout(() => {
            setMessages(prev => {
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
            // Format all previous messages for context
            const previousMessages = messages.slice(0, -2);            
            const messagesSummary = previousMessages.map(msg => {
                const sender = msg.sender === 'user' ? 'Student' : 'Teacher (Bob)';
                return `${sender}: ${typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)}`;
            }).join('\n\n');
            
            // Get the question text
            const questionText = getQuestionText(currentQuestion);
            
            // Build prompt for Bob's response
            let promptText = `The current problem is: ${questionText}\n\n`;
            
            if (messagesSummary) {
                promptText += `Here's the conversation so far:\n${messagesSummary}\n\n`;
            }
            
            promptText += `The student just asked: "${userQuestion}"\n\n`;
            promptText += `As the teacher (Bob), respond to the student's question. Be helpful, supportive, and clear. 
Make sure you address their specific question directly. Provide additional insights if relevant, but stay focused on what they're asking.
End with a question to encourage further thinking or check their understanding.
Use LaTeX notation enclosed in $ symbols for all mathematical expressions.`;
            
            // Generate response from AI service
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: bobPrompt,
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
            
            // Add to typing message IDs
            setTypingMessageIds(prev => [...prev, messageId]);
            
        } catch (error) {
            console.error("Error generating Bob's response:", error);
            
            // Fallback response
            setMessages(prev => prev.map(msg =>
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
    
    // Function to generate final evaluation when time is up
    const generateEvaluation = async () => {
        const evaluationId = getUniqueMessageId();
        
        // Add system message about time being up
        const timeUpMessage: Message = {
            id: getUniqueMessageId(),
            sender: 'system',
            text: "Time's up! Let's review the solution together.",
            timestamp: new Date().toISOString()
        };
        
        // Add placeholder for Bob's evaluation
        const evaluationPlaceholder: Message = {
            id: evaluationId,
            sender: 'ai',
            agentId: 'bob',
            text: '...',
            timestamp: new Date().toISOString()
        };
        
        // Update messages
        setMessages(prev => [...prev, timeUpMessage, evaluationPlaceholder]);
        setTypingMessageIds(prev => [...prev, evaluationId]);
        
        try {
            // Format previous messages for context
            const formattedMessages = messages.map(msg => ({
                id: msg.id,
                sender: msg.sender,
                text: typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)
            }));
            
            // Get the question and correct answer
            const questionText = getQuestionText(currentQuestion);
            const correctAnswer = currentQuestion?.answer || currentQuestion?.correctAnswer || "Not specified";
            
            // Get the user's final answer
            const userFinalAnswer = finalAnswer || selectedOption || "No answer provided";
            
            // Generate evaluation response
            const response = await aiService.generateResponse(
                formattedMessages,
                {
                    systemPrompt: `You are Bob, a supportive math tutor.
                    The student was working on this problem: ${questionText}
                    The correct answer is: ${correctAnswer}
                    The student's final answer was: ${userFinalAnswer}
                    Their work/reasoning: ${scratchboardContent}
                    
                    Provide a comprehensive evaluation of their solution:
                    1. Start by clearly stating whether their answer is correct or not
                    2. Explain the full correct solution with clear steps
                    3. Highlight where the student's reasoning was strong
                    4. Gently point out any misconceptions
                    5. Summarize key concepts they should remember for similar problems
                    
                    Use LaTeX notation for math expressions: $...$ format.`,
                    model: currentModel
                }
            );

            // Update the message with the response
            setMessages(prev => prev.map(msg => 
                msg.id === evaluationId 
                    ? { ...msg, text: response, timestamp: new Date().toISOString() } 
                    : msg
            ));

            setEvaluationComplete(true);
        } catch (error) {
            console.error("Error generating evaluation:", error);
            
            // Provide a fallback response
            setMessages(prev => prev.map(msg => 
                msg.id === evaluationId 
                    ? { ...msg, text: "I'm having trouble evaluating your solution. Let's discuss it together.", timestamp: new Date().toISOString() } 
                    : msg
            ));
            
            setEvaluationComplete(true);
        }
    };
    
    // Modify handleSend to work with student-first approach
    const handleSend = () => {
        if (!scratchboardContent.trim() || typingMessageIds.length > 0) return;

        // Record user activity time and submission time
        const now = new Date();
        setSubmissionTime(now);

        ensureNoTypingInProgress(() => {
            // Use whatever final answer they have, even if empty
            const submissionText = finalAnswer.trim() || selectedOption || "No answer specified";
            
            const userFinalAnswer: Message = {
                id: getUniqueMessageId(),
                sender: 'user',
                text: `My final answer is: ${submissionText}\n\nMy reasoning:\n${scratchboardContent}`,
                timestamp: now.toISOString()
            };
            
            setMessages([userFinalAnswer]); // Start with just the user's answer
            setIsQuestioningEnabled(true); // Enable questioning
            setHasSubmittedAnswer(true); // Mark that the answer has been submitted
            
            // Do NOT save session data here - wait until the discussion is complete
            // This prevents duplicate session data submission

            // Start conversation with Bob after submission
            startConversation(
                currentQuestion!, 
                submissionText, 
                scratchboardContent
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
                            <div className="bg-purple-900 bg-opacity-50 rounded-lg px-3 py-1 text-white">
                                Time: {formatTime(timeLeft)}
                            </div>
                        </div>
                        <p className="text-white text-lg">{formatMathExpression(currentQuestion.question)}</p>
                    </div>
                )}

                {/* Final Answer - Now ALWAYS visible like in MultiPage */}
                <div className="bg-white bg-opacity-15 rounded-md p-4 mb-4 border-2 border-blue-400 shadow-lg">
                    <h3 className="text-xl text-white font-semibold mb-2">Your Final Answer</h3>
                    <div className="flex flex-col space-y-3">
                        {currentQuestion && currentQuestion.options ? (
                            // Multiple choice final submission
                            <div className="grid grid-cols-1 gap-3 mb-4">
                                {Object.entries(currentQuestion.options).map(([key, value]) => (
                                    <button
                                        key={key}
                                        onClick={() => handleOptionSelect(key)}
                                        className={`p-3 rounded-md text-left flex items-center ${
                                            selectedOption === key 
                                            ? 'bg-purple-700 border-2 border-purple-400' 
                                            : 'bg-white bg-opacity-10 border border-gray-600 hover:bg-opacity-20'
                                        } text-white`}
                                    >
                                        <span className="font-bold mr-2">{key}:</span> 
                                        <span>{formatMathExpression(value)}</span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            // Free text input
                            <input
                                type="text"
                                value={finalAnswer}
                                onChange={(e) => setFinalAnswer(e.target.value)}
                                placeholder="Enter your final answer here..."
                                className="w-full bg-white bg-opacity-10 text-white border border-gray-600 rounded-md px-3 py-3 text-lg"
                            />
                        )}
                        
                        {/* Submit button - Only show if not submitted yet */}
                        {!hasSubmittedAnswer && (
                            <button
                                onClick={handleSend}
                                disabled={!scratchboardContent.trim() || typingMessageIds.length > 0}
                                className={`px-4 py-3 rounded-md text-lg font-medium ${
                                    scratchboardContent.trim() && typingMessageIds.length === 0
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                        : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                }`}
                            >
                                Submit Final Answer
                            </button>
                        )}
                    </div>
                </div>

                {/* Scratchboard - Below final answer with matching styling */}
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