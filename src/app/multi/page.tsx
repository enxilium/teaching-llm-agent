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

// Interface for agent prompts loaded from JSON
interface Agent {
  id: string;
  name: string;
  avatar: string;
  systemPrompt: string;
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

// Define a variable for agents that will be loaded from JSON
const agents: Agent[] = [];

// Enhance the SessionData interface to include lessonType
interface SessionData {
    questionId: number;
    questionText: string;
    startTime: Date;
    endTime: Date;
    duration: number;
    finalAnswer: string;
    scratchboardContent: string;
    messages: Message[];
    isCorrect: boolean;
    timeoutOccurred: boolean;
    lessonType?: string; // Add lessonType as optional field
}

export default function MultiPage() {
    const router = useRouter();
    const { 
        completeLesson, 
        lessonQuestionIndex, 
        currentStage, 
        userId, 
        saveSessionData: saveToFlowContext,
        lessonType 
    } = useFlow();
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

    // Timer state - Use timeElapsed for pre-submission, timeLeft for post-submission
    const [timeElapsed, setTimeElapsed] = useState(0); // Time counting up before submission
    const [timeLeft, setTimeLeft] = useState(90);    // Time counting down after submission
    const roundEndedRef = useRef(false);
    const [canSubmit, setCanSubmit] = useState(false); // Add state for submit button

    // Question tracking
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

    // Add message ref for tracking all messages
    const messageStateRef = useRef<Message[]>([]);
    
    // Add state for loading prompts
    const [promptsLoaded, setPromptsLoaded] = useState(false);
    
    // Load agent prompts from JSON file
    useEffect(() => {
        const loadPrompts = async () => {
            try {
                const response = await fetch('/prompts/multi.json');
                if (!response.ok) {
                    throw new Error('Failed to fetch agent prompts');
                }
                
                const data = await response.json();
                if (data.agents && Array.isArray(data.agents)) {
                    // Clear agents array and add loaded agents
                    agents.length = 0;
                    data.agents.forEach((agent: Agent) => {
                        agents.push(agent);
                    });
                    console.log(`Loaded ${agents.length} agent prompts`);
                    setPromptsLoaded(true);
                } else {
                    throw new Error('Invalid prompts data format');
                }
            } catch (error) {
                console.error("Error loading agent prompts:", error);
                // Provide fallback prompts if loading fails
                agents.length = 0;
                agents.push({
                    id: 'tutor',
                    name: 'Tutor',
                    avatar: 'tutor_avatar.svg',
                    systemPrompt: 'You are a math tutor guiding students. Identify errors and provide feedback.'
                });
                agents.push({
                    id: 'concept',
                    name: 'Concept Gap',
                    avatar: 'logic_avatar.png',
                    systemPrompt: 'You are Concept Gap, a student who is good at calculations but struggles with concepts. Make conceptual errors.'
                });
                agents.push({
                    id: 'arithmetic',
                    name: 'Arithmetic Gap',
                    avatar: 'pattern_avatar.png',
                    systemPrompt: 'You are Arithmetic Gap, a student who understands concepts but makes calculation errors. Make arithmetic errors.'
                });
                setPromptsLoaded(true);
            }
        };
        
        loadPrompts();
    }, []);

    // Update the setMessages function to also update the ref
    const updateMessages = (newMessages: Message[] | ((prev: Message[]) => Message[])) => {
        if (typeof newMessages === 'function') {
            setMessages((prev: Message[]) => {
                const updated = newMessages(prev);
                messageStateRef.current = updated;
                return updated;
            });
        } else {
            setMessages(newMessages);
            messageStateRef.current = newMessages;
        }
    };

    // Only continue with rest of component when prompts and questions are loaded
    useEffect(() => {
        if (promptsLoaded && loadedQuestions && currentQuestion) {
            // Initialize component after prompts and questions are loaded
            console.log("All resources loaded, component is ready");
        }
    }, [promptsLoaded, loadedQuestions, currentQuestion]);

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
            // Always use lessonQuestionIndex from the flow context - this is now predetermined
            if (typeof lessonQuestionIndex === 'number' &&
                lessonQuestionIndex >= 0 &&
                lessonQuestionIndex < allQuestions.length) {
                console.log(`Using predetermined lessonQuestionIndex: ${lessonQuestionIndex}`);
                setCurrentQuestion(allQuestions[lessonQuestionIndex]);
                // Don't update currentQuestionIndex state anymore
            } else {
                // Fallback only if there's an issue with lessonQuestionIndex
                console.warn(`Invalid lessonQuestionIndex: ${lessonQuestionIndex}, using default question`);
                setCurrentQuestion(allQuestions[0]);
            }
        }
    }, [loadedQuestions, allQuestions, lessonQuestionIndex]);

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

        if (hasSubmittedAnswer) {
            // Post-submission phase - Use decreasing timer (countdown)
            if (timeLeft <= 0) {
                // Discussion phase timeout - navigate to next page
                console.log('Discussion time expired - navigating to next page');
                
                // IMPORTANT FIX: Mark the round as ended to prevent further timer decrements
                roundEndedRef.current = true;
                
                // Disable user interaction during transition
                setIsQuestioningEnabled(false);
                
                // Add message about moving on
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
                
                // Save final session data before navigating - this is the ONE point where we save
                console.log('Saving final session data before completing lesson');
                saveSessionData(finalAnswer || "No answer provided", false)
                  .then(() => {
                      console.log('Final session data saved successfully, completing lesson now');
                      // Add a delay before navigating to ensure state updates are complete
                      setTimeout(() => {
                          console.log('Completing lesson and transitioning to break...');
                          completeLesson();
                      }, 2000);
                  })
                  .catch(error => {
                      console.error('Error saving final session data:', error);
                      // Still proceed with lesson completion even if save fails
                      setTimeout(() => {
                          completeLesson();
                      }, 2000);
                  });
                return;
            }

            if (roundEndedRef.current) return;

            const timerId = setTimeout(() => {
                setTimeLeft((prevTime) => prevTime - 1);
            }, 1000);

            return () => clearTimeout(timerId);
        } else {
            // Pre-submission phase - Use increasing timer (count up)
            if (roundEndedRef.current) return;

            const timerId = setTimeout(() => {
                setTimeElapsed((prevTime) => prevTime + 1);
                // Enable submit button after 10 seconds
                if (timeElapsed >= 9) {
                    setCanSubmit(true);
                }
            }, 1000);

            return () => clearTimeout(timerId);
        }
    }, [timeLeft, timeElapsed, hasSubmittedAnswer, currentQuestion]);

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
        if (!question) return false;
        
        // Check for correctAnswer first, then fall back to answer
        const correctAnswer = question.correctAnswer || question.answer;
        if (!correctAnswer) return false;
        
        // Simple string comparison for multiple choice options
        const normalizedUserAnswer = userAnswer.trim().toLowerCase();
        const normalizedCorrectAnswer = correctAnswer.trim().toLowerCase();
        
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

    // Modified saveSessionData function with enhanced logging
    const saveSessionData = async (finalAnswerText: string, isTimeout: boolean) => {
        try {
            // Calculate session duration - only count time until answer submission
            const endTime = submissionTime || new Date();
            const durationMs = endTime.getTime() - sessionStartTime.getTime();
            const durationSeconds = Math.floor(durationMs / 1000);
            
            // Get the question text
            const questionText = currentQuestion?.question || '';
            
            // Check if the answer is correct
            const isCorrect = checkAnswerCorrectness(finalAnswerText, currentQuestion);
            
            // Use the message ref instead of state
            const currentMessages = messageStateRef.current;
            
            console.log(`💾 MULTI [Session Save Detail] Saving ${currentMessages.length} messages:`);
            currentMessages.forEach((msg, idx) => {
                if (idx < 3 || idx >= currentMessages.length - 2) {
                    console.log(`Message ${idx}: sender=${msg.sender}, id=${msg.id}, text preview=${typeof msg.text === 'string' ? msg.text.substring(0, 30) : 'non-string'}...`);
                }
            });
            
            // Clean and prepare messages for storage
            const messagesWithFaults = currentMessages.filter(msg => 
                !msg.id || !msg.sender || !msg.text
            );
            
            if (messagesWithFaults.length > 0) {
                console.warn(`⚠️ MULTI Found ${messagesWithFaults.length} messages with missing properties`);
            }
            
            // Loop through messages and ensure each has required properties with defaults
            const cleanedMessages = currentMessages.map(msg => ({
                id: msg.id || Date.now(),
                sender: msg.sender || 'unknown',
                text: typeof msg.text === 'string' ? msg.text : String(msg.text || 'No content'),
                agentId: msg.agentId || null,
                timestamp: new Date(msg.timestamp || Date.now()), // Ensure timestamp is a Date object
            }));
            
            // Double check that all messages have required properties
            const messagesWithoutProperties = cleanedMessages.filter(msg => 
                !msg.id || !msg.sender || !msg.text || !msg.timestamp
            );
            
            if (messagesWithoutProperties.length > 0) {
                console.warn(`⚠️ MULTI Found ${messagesWithoutProperties.length} messages with missing properties`);
            }
            
            // Log session details including scenario type
            console.log(`💾 MULTI [Session Save] Saving data for question ${lessonQuestionIndex}, scenario: ${lessonType}`);
            console.log(`💾 MULTI [Session Save] Message count: ${cleanedMessages.length}`);
            
            // Save to flow context instead of calling SessionService directly
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
                lessonType // Include the scenario type
            } as any); // Type assertion to avoid type errors

            console.log(`✅ MULTI [Session Save] Data saved to flow context successfully with ${cleanedMessages.length} messages`);
            return true;
        } catch (error) {
            console.error(`❌ MULTI [Session Save] Error saving session data:`, error);
            return false;
        }
    };

    // Handle submission of answer
    const handleSend = () => {
        // If this is a multiple choice question, require selection of an option
        if (currentQuestion && currentQuestion.options && currentQuestion.options.length > 0) {
            if (!finalAnswer.trim()) {
                console.log('Missing required field: answer selection');
                return;
            }
        } else {
            // For non-multiple choice, just check if there's a final answer
            if (!finalAnswer.trim()) return;
        }

        setLastUserActivityTime(Date.now());

        // Record submission time
        const now = new Date();
        setSubmissionTime(now);

        ensureNoTypingInProgress(() => {
            const userFinalAnswer: Message = {
                id: getUniqueMessageId(),
                sender: 'user',
                text: `My final answer is: ${finalAnswer}\n\nMy reasoning:\n${scratchboardContent || "No work shown"}`,
                timestamp: new Date().toISOString()
            };

            // Update messages by appending the user's answer instead of resetting
            updateMessages(prev => [...prev, userFinalAnswer]);
            setHasSubmittedAnswer(true); // Mark answer as submitted

            // Stop the timer when chat interface appears
            roundEndedRef.current = true;

            // Disable questioning initially - it will be enabled after the AI discussion sequence
            setIsQuestioningEnabled(false);

            // Start classroom discussion after submission
            startClassroomDiscussion(currentQuestion, finalAnswer, scratchboardContent || "No work shown");
        });
    };

    // Function to auto-submit when timer expires - now only used for manual timeout
    const autoSubmitTimeoutAnswer = () => {
        console.log('Auto-submitting answer due to timeout');

        // Immediately set flags to prevent further edits
        setIsQuestioningEnabled(false);
        roundEndedRef.current = true;
        setHasSubmittedAnswer(true);

        // Use current values, even if empty
        const submissionText = finalAnswer.trim() || "No answer selected";

        // Create a user message with the timeout info
        const userTimeoutMessage: Message = {
            id: getUniqueMessageId(),
            sender: 'user',
            text: `My partial answer: ${submissionText}\n\nMy work so far:\n${scratchboardContent}`,
            timestamp: new Date().toISOString()
        };

        // Add message and start classroom discussion directly
        setMessages([userTimeoutMessage]);

        // Use the same flow as normal submission
        startClassroomDiscussion(currentQuestion, submissionText, scratchboardContent);
    };

    // Update handleTimeExpired to be the only other place where session data is saved
    const handleTimeExpired = async () => {
        if (hasSubmittedAnswer) return;
        
        const now = new Date();
        setSubmissionTime(now);
        setHasSubmittedAnswer(true);
        
        // Create timeout message to inform user
        const timeoutMessage: Message = {
            id: getUniqueMessageId(),
            sender: 'user',
            text: `My partial answer: ${finalAnswer || "No answer provided"}\n\nMy work so far:\n${scratchboardContent || "No work shown"}`,
            timestamp: new Date().toISOString()
        };
        
        // Use updateMessages to ensure message reference is updated
        updateMessages([timeoutMessage]);
        
        // Then add confirmation message
        const confirmationMessage: Message = {
            id: getUniqueMessageId(),
            sender: 'system',
            text: "Time's up! Your session data is being saved...",
            timestamp: new Date().toISOString()
        };
        
        // Add confirmation message to the chat
        updateMessages(prev => [...prev, confirmationMessage]);
        
        // Save session data with timeout flag - this is the ONE other point where we save
        try {
            console.log('Saving final session data before completing lesson due to timeout');
            await saveSessionData(finalAnswer || "No answer provided", true);
            
            // Update confirmation message to show success
            updateMessages(prev => prev.map(msg => 
                msg.id === confirmationMessage.id
                    ? {...msg, text: "Time's up! Your session data has been saved successfully."}
                    : msg
            ));
            
            console.log("Final session data saved successfully on timeout");
            
            // Wait a moment before completing the lesson
            setTimeout(() => {
                completeLesson();
            }, 2000);
        } catch (error) {
            console.error("Error saving final session data:", error);
            
            // Update confirmation message to show failure
            updateMessages(prev => prev.map(msg => 
                msg.id === confirmationMessage.id
                    ? {...msg, text: "Time's up! There was an issue saving your data."}
                    : msg
            ));
            
            // Still complete the lesson after a delay
            setTimeout(() => {
                completeLesson();
            }, 2000);
        }
    };

    // Update startClassroomDiscussion to use the message ref
    const startClassroomDiscussion = async (question: any, studentAnswer: string, scratchpad: string) => {
        // Reset peer messages tracking at the start of a new discussion
        peerMessagesRef.current = [];
        
        // Reset discussion timer to 2 minutes
        setTimeLeft(90);
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
        updateMessages([
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
                            updateMessages(prev => [
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
                                            
                                            updateMessages(prev => [
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
            
            // Get multiple choice options if available
            const options = typeof currentQuestion === 'object' && currentQuestion.options 
                ? currentQuestion.options 
                : [];

            // Build prompt for peer's initial response
            let promptText = `The current problem is: ${questionText}\n\n`;

            if (options.length > 0) {
                promptText += `The available answer options are:\n`;
                options.forEach((option: string, index: number) => {
                    promptText += `${String.fromCharCode(65 + index)}. ${option}\n`;
                });
                promptText += `\n`;
            }

            if (correctAnswer) {
                promptText += `The correct answer is: ${correctAnswer}\n\n`;
            }

            promptText += `As ${agent.name}, provide your answer to this multiple choice problem in this format:
1. Start with "I choose option [letter/answer]."
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
                fallbackText = "I choose option B. This is how I solved it: I followed the steps carefully and made sure to calculate each part correctly...";
            } else if (agent.id === 'arithmetic') {
                fallbackText = "I choose option A. This is how I solved it: Looking at the conceptual framework, I identified the key relationship between...";
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

    // Update the generateTutorAnalysis function to handle multiple choice
    const generateTutorAnalysis = async (
        messageId: number,
        question: any,
        studentAnswer: string,
        scratchpad: string,
        peerMessages: { agentId: string, text: string }[]
    ) => {
        const questionText = getQuestionText(question);
        const correctAnswer = question?.correctAnswer || question?.answer || "not provided";
        
        // Get options if available
        const options = question?.options || [];
        const isMultipleChoice = options.length > 0;

        try {
            // Build prompt for tutor's analysis
            let promptText = `The current problem is: ${questionText}\n\n`;
            
            if (isMultipleChoice) {
                promptText += `This is a multiple choice problem with the following options:\n`;
                options.forEach((option: string, index: number) => {
                    promptText += `${String.fromCharCode(65 + index)}. ${option}\n`;
                });
                promptText += `\n`;
            }
            
            promptText += `The correct answer is: ${correctAnswer}\n\n`;
            
            // First analyze the student's answer (keep this part first)
            promptText += `The student's selected answer was: ${studentAnswer}\n\n`;
            promptText += `The student's work: ${scratchpad}\n\n`;
            
            // Then include peer responses
            if (peerMessages && peerMessages.length > 0) {
                promptText += "The other students' responses:\n";
                peerMessages.forEach(msg => {
                    const peerName = agents.find(a => a.id === msg.agentId)?.name || 'Student';
                    promptText += `${peerName}: ${msg.text}\n\n`;
                });
            }
            
            promptText += `As an experienced and encouraging math teacher, provide feedback on this multiple choice problem in a friendly, conversational tone. Structure your response in a natural way with several paragraphs:

Begin with your assessment of the student's selected answer, acknowledging what they did well while gently identifying any misconceptions.

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
            const fallbackText = `I see you selected "${studentAnswer}". The correct answer is ${correctAnswer}. Looking at your work and comparing it with other approaches, I'd like to offer some insights on how you might think about this problem differently.`;
            
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
        if (!input.trim() || !isQuestioningEnabled) return;

        // Skip any ongoing typewriter animations if user sends a new message
        if (typingMessageIds.length > 0) {
            setSkipTypewriter(true);
            setTimeout(() => {
                setTypingMessageIds([]);
                sendUserQuestion();
            }, 50);
        } else {
            sendUserQuestion();
        }
    };

    // Update the sendUserQuestion function to not save after each message
    const sendUserQuestion = () => {
        const userMessageId = getUniqueMessageId();
        const userMessage: Message = {
            id: userMessageId,
            sender: 'user',
            text: input,
            timestamp: new Date().toISOString()
        };

        // Use updateMessages to ensure message reference is updated
        updateMessages(prev => [...prev, userMessage]);
        
        // Clear input
        setInput('');

        // Force scroll to bottom
        forceScrollToBottomRef.current = true;
        setTimeout(() => scrollToBottom(true), 50);

        // Reset intervention flags
        interventionRef.current = false;
        setLastMessageTime(Date.now());
        setBotThinking(false);

        // Check if a specific bot was mentioned
        const mentionedBot = checkForBotMention(input);
        
        if (mentionedBot) {
            console.log(`User mentioned ${mentionedBot}`);
            generateSingleBotResponse(input, mentionedBot);
        } else {
            // Generate sequential responses from all participants
            generateSequentialResponse(input);
        }
    };

    // Fix the generateSingleBotResponse function by retaining the structure
    const generateSingleBotResponse = async (userQuestion: string, mentionedBot: string) => {
        // Find the mentioned bot
        const bot = agents.find(a => a.id === mentionedBot);
        if (!bot) return;

        // Create a placeholder message for the bot
        const botMessageId = getUniqueMessageId();
        updateMessages(prev => [
            ...prev,
            {
                id: botMessageId,
                sender: 'ai',
                text: '...',
                agentId: bot.id,
                timestamp: new Date().toISOString(),
                onComplete: () => {
                    // No session save here
                }
            }
        ]);

        // Add to typing IDs
        setTypingMessageIds(prev => [...prev, botMessageId]);

        try {
            console.log(`Generating response from ${bot.name}`);
            setBotThinking(true);

            try {
                // Format the question text
                const questionText = getQuestionText(currentQuestion);

                // Get recent conversation context (up to 5 messages)
                const recentMessages = messageStateRef.current.slice(-5);
                const conversationContext = recentMessages.map(msg => {
                    let sender = msg.sender === 'user' ? 'Student' : (
                        agents.find(a => a.id === msg.agentId)?.name || 'Unknown'
                    );
                    return `${sender}: ${typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)}`;
                }).join('\n\n');

                // Generate prompt based on which agent was mentioned
                let promptText = `The current problem is: ${questionText}\n\n`;
                
                // Include conversation context if there are previous messages
                if (recentMessages.length > 0) {
                    promptText += `Recent conversation history:\n${conversationContext}\n\n`;
                }
                
                promptText += `A student asked you directly: "${userQuestion}"\n\n`;

                if (mentionedBot === 'tutor') {
                    promptText += `As the teacher (Tutor), respond as follows:
1. First, explicitly reference the conversation context and acknowledge what has been discussed so far
2. Identify what the student is specifically asking about and address it directly
3. Provide a clear, focused explanation that builds on the ongoing discussion
4. If other students (Concept Gap or Arithmetic Gap) have made points, acknowledge them by name
5. Maintain a natural conversational tone that flows from previous exchanges

Your response should feel like it's part of an ongoing classroom discussion, not an isolated answer.`;
                } else if (mentionedBot === 'concept') {
                    // Enhanced Concept Gap prompt
                    promptText += `As Concept Gap, respond to the student's question while maintaining the natural flow of conversation.

1. Reference specific points from the conversation history if relevant
2. If Arithmetic Gap or the Tutor have spoken, acknowledge their contributions by name
3. Focus on calculation approaches and step-by-step arithmetic as your strength
4. Express some confusion about deeper conceptual foundations
5. Keep your response conversational, as if you're in a real classroom discussion`;
                } else if (mentionedBot === 'arithmetic') {
                    // Enhanced Arithmetic Gap prompt
                    promptText += `As Arithmetic Gap, respond to the student's question while maintaining the natural flow of conversation.

1. Reference specific points from the conversation history if relevant
2. If Concept Gap or the Tutor have spoken, acknowledge their contributions by name
3. Focus on conceptual understanding and mathematical principles as your strength
4. Make at least one small calculation error in your numerical work
5. Keep your response conversational, as if you're in a real classroom discussion`;
                }

                // Generate response
                const response = await aiService.generateResponse(
                    [{ id: 1, sender: 'user', text: promptText }],
                    {
                        systemPrompt: bot.systemPrompt,
                        model: currentModel
                    }
                );

                // Replace typing indicator with actual response
                updateMessages(prev => {
                    const updatedMessages = prev.map(msg =>
                        msg.id === botMessageId
                            ? {
                                ...msg,
                                text: typeof response === 'string' ? response : JSON.stringify(response),
                                timestamp: new Date().toISOString()
                            }
                            : msg
                    );
                    return updatedMessages;
                });

                // Add to typing state for typewriter effect
                setTypingMessageIds(prev => [...prev, botMessageId]);

            } catch (error) {
                console.error(`Error generating ${bot.name}'s response:`, error);

                // Provide character-appropriate fallback
                let fallbackText = '';

                if (mentionedBot === 'tutor') {
                    fallbackText = "You're asking specifically about [key aspect of question]. Let me address that directly...";
                } else if (mentionedBot === 'concept') {
                    fallbackText = "I think I can help with the calculation part of that. Let me work through the steps... though I'm not fully clear on why this conceptual approach is better.";
                } else if (mentionedBot === 'arithmetic') {
                    fallbackText = "From a conceptual standpoint, this problem is about understanding the relationship between the constraints. The key insight is... though I might have made a small error in my arithmetic.";
                }

                updateMessages(prev => {
                    const updatedMessages = prev.map(msg =>
                        msg.id === botMessageId
                            ? {
                                ...msg,
                                text: fallbackText,
                                timestamp: new Date().toISOString()
                            }
                            : msg
                    );
                    return updatedMessages;
                });
            } finally {
                setBotThinking(false);
            }
        } catch (error) {
            console.error(`Error generating ${bot.name}'s response:`, error);
            setBotThinking(false);
            updateMessages(prev => {
                const updatedMessages = prev.map(msg =>
                    msg.id === botMessageId
                        ? {
                            ...msg,
                            text: "Sorry, I couldn't generate a response. Please try again.",
                            timestamp: new Date().toISOString()
                        }
                        : msg
                );
                return updatedMessages;
            });
        }
    };

    // Fix the generateSequentialResponse function to use existing functions
    const generateSequentialResponse = (userQuestion: string) => {
        // CRITICAL FIX: Randomly select ONE agent from all three instead of always starting with Tutor
        const allAgents = [...agents]; // This includes tutor, concept, and arithmetic
        const randomIndex = Math.floor(Math.random() * allAgents.length);
        const selectedAgent = allAgents[randomIndex];
        
        console.log(`Random agent selected to respond: ${selectedAgent.name}`);
        
        // Directly call generateSingleBotResponse without creating another message placeholder
        generateSingleBotResponse(userQuestion, selectedAgent.id);
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

    // Add a debugging function to verify message state
    const debugMessages = () => {
        console.log(`DEBUG: Current messages in state: ${messages.length}`);
        console.log(`DEBUG: Current messages in ref: ${messageStateRef.current.length}`);
        
        // Log the last few messages
        if (messageStateRef.current.length > 0) {
            const lastMsg = messageStateRef.current[messageStateRef.current.length - 1];
            console.log(`DEBUG: Last message - id: ${lastMsg.id}, sender: ${lastMsg.sender}, text preview: ${typeof lastMsg.text === 'string' ? lastMsg.text.substring(0, 30) : 'non-string'}...`);
        }
    };

    // Add this effect to verify messageStateRef is properly updated
    useEffect(() => {
        messageStateRef.current = messages;
        console.log(`Message state sync: State has ${messages.length} messages, ref now has ${messageStateRef.current.length} messages`);
    }, [messages]);

    return (
        <div className="chat-page-container bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4 flex flex-col h-full">
            {!hasSubmittedAnswer ? (
                // Before submission view - full width layout
                <div className="flex flex-col h-full">
                    {/* Problem Display with Timer */}
                    {currentQuestion && (
                        <div className="bg-white bg-opacity-20 p-4 rounded-md mb-4 border-2 border-purple-400 flex-shrink-0">
                            <div className="flex justify-between items-start mb-2">
                                <h2 className="text-xl text-white font-semibold">Problem:</h2>
                            </div>
                            <div className="text-white text-lg mb-3">
                                {formatMathExpression(getQuestionText(currentQuestion))}
                            </div>
                        </div>
                    )}

                    {/* Final Answer Input */}
                    <div className="bg-white bg-opacity-15 rounded-md p-4 mb-4 border-2 border-blue-400 shadow-lg flex-shrink-0">
                        <h3 className="text-xl text-white font-semibold mb-2">Your Final Answer</h3>
                        <div className="flex flex-col space-y-3">
                            {currentQuestion && currentQuestion.options && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                                    {currentQuestion.options.map((option: string, index: number) => (
                                        <div 
                                            key={index}
                                            onClick={() => setFinalAnswer(option)}
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
                                    ))}
                                </div>
                            )}
                            <button
                                onClick={() => handleSend()}
                                disabled={!finalAnswer.trim() || !canSubmit}
                                className={`px-4 py-3 rounded-md text-lg font-medium ${
                                    finalAnswer.trim() && canSubmit
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                        : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                }`}
                            >
                                {canSubmit ? 'Submit Final Answer' : `Wait ${Math.max(1, 10 - timeElapsed)}s...`}
                            </button>
                        </div>
                    </div>

                    {/* Scratchboard - Always visible, read-only after submission */}
                    <div className="flex-1 border border-gray-600 rounded-md p-3 bg-black bg-opacity-30 overflow-hidden flex flex-col">
                        <textarea
                            value={scratchboardContent}
                            onChange={(e) => setScratchboardContent(e.target.value)}
                            className="w-full flex-1 min-h-[200px] bg-black bg-opacity-40 text-white border-none rounded p-2"
                            placeholder="Space for scratch work..."
                            readOnly={hasSubmittedAnswer} // Make read-only after submission
                        />
                    </div>
                </div>
            ) : (
                <div className="flex h-full">
                    {/* Left panel - Problem Display */}
                    <div className="w-1/2 pr-2 flex flex-col h-full">
                        {/* Problem Display with Timer */}
                        {currentQuestion && (
                            <div className="bg-white bg-opacity-20 p-4 rounded-md mb-4 border-2 border-purple-400 flex-shrink-0">
                                <div className="flex justify-between items-start mb-2">
                                    <h2 className="text-xl text-white font-semibold">Problem:</h2>
                                    {hasSubmittedAnswer && <div className="bg-purple-900 bg-opacity-50 rounded-lg px-3 py-1 text-white">
                                        Time: {formatTime(timeLeft)}
                                    </div>}
                                </div>
                                <div className="text-white text-lg mb-3">
                                    {formatMathExpression(getQuestionText(currentQuestion))}
                                </div>
                                
                                {/* Multiple Choice Options Display */}
                                {currentQuestion.options && currentQuestion.options.length > 0}
                            </div>
                        )}

                        {/* Student Answer & Work Area (read-only after submission) */}
                        <div className="bg-white bg-opacity-15 p-4 rounded-md mb-4 border-2 border-blue-400 flex-shrink-0">
                            <h3 className="text-lg text-white font-semibold mb-2">Your Final Answer</h3>
                            <div className="p-3 rounded-md border-2 bg-blue-500 bg-opacity-30 border-blue-500">
                                <div className="flex items-center">
                                    <div className="w-6 h-6 mr-2 rounded-full border-2 flex items-center justify-center border-blue-500 bg-blue-500 text-white">
                                        <span>✓</span>
                                    </div>
                                    <div className="text-white">{formatMathExpression(finalAnswer)}</div>
                                </div>
                            </div>
                        </div>

                        {/* Scratchboard - Always visible, read-only after submission */}
                        <div className="flex-1 border border-gray-600 rounded-md p-3 bg-black bg-opacity-30 overflow-hidden flex flex-col">
                            <textarea
                                value={scratchboardContent}
                                onChange={(e) => setScratchboardContent(e.target.value)}
                                className="w-full flex-1 min-h-[200px] bg-black bg-opacity-40 text-white border-none rounded p-2"
                                placeholder="Space for scratch work..."
                                readOnly={hasSubmittedAnswer} // Make read-only after submission
                            />
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