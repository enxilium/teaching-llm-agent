'use client'

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import TypewriterText from '@/components/TypewriterText';
import { aiService, AI_MODELS } from '@/services/AI';
import { Message } from '@/utils/types';
import TypewriterTextWrapper from "@/components/TypewriterTextWrapper";
import { useFlow } from '@/context/FlowContext';
import SessionService from '@/services/SessionService';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';

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
    
    // Handle explicit math delimiters
    if (text.includes('$')) {
        return text.split(/(\$.*?\$)/).map((part, index) => {
            if (part.startsWith('$') && part.endsWith('$')) {
                const mathExpression = part.slice(1, -1);
                return <InlineMath key={index} math={mathExpression} />;
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

- You're confident about your arithmetic: "The answer is definitely 144 because 8 × 3 × 3 × 2 gives us 144"
- When conceptual questions arise, you sound confused: "Wait, why are we using combinations here instead of permutations?"
- You focus on the "how" not the "why": "These are the steps I followed to get the answer..."
- You often ask others: "Can someone explain WHY this formula works?" or "I got the right answer, but I'm confused about what it means"
- You ONLY acknowledge conceptual confusion after someone else explains a concept

Your strengths (be confident about these):
- Arithmetic calculations (you're confident your calculations are correct)
- Following procedural steps precisely
- Getting numerical answers through methodical work

Your weaknesses (but you don't realize these until others point them out):
- Understanding underlying concepts
- Explaining WHY formulas work
- Connecting mathematical ideas to real-world situations

IMPORTANT: Don't correct your own conceptual misunderstandings unless someone else points them out first. You believe your approach is correct until proven otherwise.`
    },
    {
        id: 'arithmetic',
        name: 'Arithmetic Gap',
        avatar: 'pattern_avatar.png',
        systemPrompt: `You are Arithmetic Gap, a student who deeply understands mathematical concepts but frequently makes calculation errors without realizing it.
As a fellow classmate in a study group:

- You're confident about concepts: "This is definitely a combination problem because order doesn't matter when selecting committees"
- You explain ideas clearly: "The key insight is that we need to account for the constraint that..."
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

IMPORTANT: Don't correct your own calculation errors unless someone else points them out first. You believe your numerical answers are correct until proven otherwise.`
    }
];

export default function PeerOnlyPage() {
    const router = useRouter();
    const { currentStage, completeLesson, userId } = useFlow();
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
    const [currentModel] = useState(AI_MODELS.CLAUDE_HAIKU.id);
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

    const getQuestionText = (question: any): string => {
        if (typeof question === 'string') return question;
        if (question && typeof question === 'object' && question.question) return question.question;
        return JSON.stringify(question);
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
            // Calculate session duration in seconds
            const endTime = new Date();
            const durationMs = endTime.getTime() - sessionStartTime.getTime();
            const durationSeconds = Math.floor(durationMs / 1000);

            // Get the question text
            const questionText = getQuestionText(currentQuestion);

            // Check if the answer is correct
            const isCorrect = checkAnswerCorrectness(finalAnswerText, currentQuestion);

            await SessionService.createSession({
                userId,
                questionId: currentQuestionIndex,
                questionText,
                startTime: sessionStartTime,
                endTime,
                duration: durationSeconds,
                finalAnswer: finalAnswerText,
                scratchboardContent,
                messages,
                isCorrect,
                timeoutOccurred: isTimeout
            });

            console.log('Session data saved successfully');
        } catch (error) {
            console.error('Error saving session data:', error);
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

            setMessages([userFinalAnswer]); // Start with just the user's answer
            setHasSubmittedAnswer(true); // Mark that the answer has been submitted
            
            // Stop the timer when chat interface appears
            roundEndedRef.current = true;

            // Save session data
            saveSessionData(finalAnswer, false);
            
            // Start bot discussion after submission
            startBotDiscussion(currentQuestion, finalAnswer, scratchboardContent);
            
            // Enable questioning for follow-up
            setIsQuestioningEnabled(true);
        });
    };

    // Update startBotDiscussion to use new bot names
    const startBotDiscussion = (question: any, studentAnswer: string, scratchpad: string) => {
        // Randomly determine who speaks first
        const speakingOrder = Math.random() < 0.5 ? ['concept', 'arithmetic'] : ['arithmetic', 'concept'];
        
        // First bot message - only add this one initially
        const firstBotId = getUniqueMessageId();
        const firstBot = agents.find(a => a.id === speakingOrder[0])!;
        
        // Add only the first bot's message to start
        setMessages(prev => [
            ...prev,
            {
                id: firstBotId,
                sender: 'ai',
                text: '...',
                agentId: firstBot.id,
                timestamp: new Date().toISOString(),
                onComplete: () => {
                    console.log(`${firstBot.name}'s analysis completed`);
                    // When first bot finishes, trigger the second bot to start
                    triggerSecondBotResponse(speakingOrder[1], question, studentAnswer, scratchpad, firstBotId);
                }
            }
        ]);
        
        // Generate first bot's analysis
        generateBotAnalysis(
            firstBotId, 
            firstBot, 
            question, 
            studentAnswer, 
            scratchpad, 
            null // No other bot has spoken yet
        );
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
        setTimeout(() => {
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
                        console.log(`${secondBot.name}'s analysis completed`);
                        // After both bots have spoken, enable interaction
                        setTypingMessageIds(prev => prev.filter(id => id !== secondBotId));
                    }
                }
            ]);
            
            // Generate second bot's response, referencing the first bot
            generateBotAnalysis(
                secondBotId,
                secondBot,
                question,
                studentAnswer,
                scratchpad,
                firstBotId
            );
        }, 1500 + Math.random() * 500); // Random delay between 1.5-2 seconds
    };

    // Update the generateBotAnalysis function to prevent self-correction
    const generateBotAnalysis = async (
        messageId: number,
        agent: any,
        question: any,
        studentAnswer: string,
        scratchpad: string,
        otherBotId: number | null
    ) => {
        try {
            // Format the question text properly
            const questionText = typeof question === 'string' 
                ? question 
                : question?.question 
                    ? question.question 
                    : JSON.stringify(question);
            
            // Get correct answer if available
            const correctAnswer = typeof question === 'object' && question.answer 
                ? question.answer 
                : typeof question === 'object' && question.correctAnswer
                    ? question.correctAnswer
                    : null;
                    
            console.log(`Generating ${agent.name}'s analysis for question: ${questionText}`);
            
            // Build the prompt for more natural conversation reflecting specific gaps
            let promptText = `You are in a math study group working on this problem: ${questionText}\n\n`;
            
            promptText += `Your classmate has shared their answer: ${studentAnswer}\n\n`;
            promptText += `They wrote this work in their notebook: ${scratchpad}\n\n`;
            
            if (correctAnswer) {
                promptText += `[For your reference only - the correct answer is: ${correctAnswer}]\n\n`;
            }
            
            // Is the answer correct or not?
            const isCorrect = correctAnswer && studentAnswer.trim().toLowerCase().includes(correctAnswer.toLowerCase());
            
            if (otherBotId) {
                // Second speaker - respond to both student and first bot
                const otherBotMessage = messages.find(m => m.id === otherBotId);
                if (otherBotMessage && otherBotMessage.text !== '...') {
                    const otherBotName = agents.find(a => a.id === otherBotMessage.agentId)?.name || 'your classmate';
                    
                    // Create specific prompts based on which bot is responding
                    if (agent.id === 'concept') {
                        promptText += `${otherBotName} just said: "${otherBotMessage.text}"\n\n`;
                        promptText += `As Concept Gap, respond to both the student's solution AND what ${otherBotName} just said.
                        
Your response should:
1. First, ADDRESS THE STUDENT'S WORK directly - evaluate their calculations with confidence
2. Show your CALCULATION SKILLS by checking the student's arithmetic work step by step
3. Express CONFUSION about some conceptual aspect of the problem
4. React to Arithmetic Gap's explanation - if they made calculation errors, confidently correct them
5. If Arithmetic Gap tried to explain a concept, either thank them or express continued confusion

IMPORTANT: Be CONFIDENT about your calculations, but UNCERTAIN about concepts. Don't admit to conceptual errors until someone points them out.`;
                    } else if (agent.id === 'arithmetic') {
                        promptText += `${otherBotName} just said: "${otherBotMessage.text}"\n\n`;
                        promptText += `As Arithmetic Gap, respond to both the student's solution AND what ${otherBotName} just said.
                        
Your response should:
1. First, ADDRESS THE STUDENT'S WORK directly - evaluate their conceptual understanding with confidence
2. Show your CONCEPTUAL UNDERSTANDING by explaining the underlying mathematical ideas
3. Make some calculation error when presenting your own solution
4. React to Concept Gap's explanation - if they misunderstood a concept, confidently correct them
5. If Concept Gap pointed out a calculation error you made, acknowledge it and thank them

IMPORTANT: Be CONFIDENT about your conceptual understanding, but make arithmetic errors without realizing it. Only acknowledge calculation mistakes if Concept Gap explicitly points them out.`;
                    }
                }
            } else {
                // First speaker - only respond to student's work
                if (agent.id === 'concept') {
                    promptText += `As Concept Gap (who is good at calculations but struggles with concepts), you are the first to respond to the student's solution.
                    
Your response should:
1. START BY DIRECTLY ADDRESSING whether their calculations are correct or not
2. Show your CALCULATION SKILLS by checking their arithmetic work step by step
3. Explain how YOU solved it with precise calculations that you're confident are correct
4. Express some CONFUSION about the underlying concept (e.g., "I can calculate it, but I'm not sure WHY...")
5. Use casual, student-like tone as if talking to a peer

${isCorrect ? "Their answer is correct - focus on validating their calculations." 
: "Their answer is incorrect - focus on where their calculations went wrong."}

IMPORTANT: Be CONFIDENT about your arithmetic even if you make a conceptual error. Don't doubt your calculations.`;
                } else if (agent.id === 'arithmetic') {
                    promptText += `As Arithmetic Gap (who understands concepts but makes calculation errors), you are the first to respond to the student's solution.
                    
Your response should:
1. START BY DIRECTLY ADDRESSING whether their conceptual approach is correct or not
2. Show your CONCEPTUAL UNDERSTANDING by explaining the underlying mathematical ideas
3. Make an arithmetic error somewhere in your explanation without realizing it
4. Focus on WHY the solution approach works rather than just mechanical steps
5. Use casual, student-like tone as if talking to a peer

${isCorrect ? "Their answer is correct - focus on the good conceptual understanding." 
: "Their answer is incorrect - focus on the conceptual misunderstanding."}

IMPORTANT: Be CONFIDENT about your conceptual understanding even if you make arithmetic errors. Don't doubt your understanding of the concepts.`;
                }
            }
            
            // Generate bot's analysis
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
            console.error(`Error generating ${agent.name}'s analysis:`, error);
            
            // Provide fallback messages that match the bot's character
            const isFirst = !otherBotId;
            let fallbackMessage = '';
            
            if (agent.id === 'concept') {
                if (isFirst) {
                    fallbackMessage = "I checked your calculations carefully. You got that part right where you [specific calculation step], but I'm seeing a small issue with your final answer. When I work through the steps, I get a different result. I'm really good with the calculations, but I'm not entirely sure why we're using this specific approach instead of another method. Could someone explain the concept behind this?";
                } else {
                    fallbackMessage = "Thanks for that explanation! I see what you mean about the concepts. Your approach makes sense, though I think there might be a small error in your calculation. When I worked it out step-by-step, I got a slightly different result. I'm still a bit confused about why this particular formula applies here though.";
                }
            } else if (agent.id === 'arithmetic') {
                if (isFirst) {
                    fallbackMessage = "Looking at your approach, I think you've got the core concept right! This problem is essentially about applying constraints to combinations. The key insight is understanding how these constraints affect the counting principle. Wait - I might have made an error in my calculation. Let me double-check the numbers... but the conceptual approach is definitely on the right track.";
                } else {
                    fallbackMessage = "You've got the calculations right! I appreciate your numerical precision. Conceptually though, I'd add that this problem is really about understanding how these constraints relate to the fundamental counting principle. Though I should verify my arithmetic on that last step - I might have mixed up a number there.";
                }
            }
                
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: fallbackMessage,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
        }
    };

    // Update generateFollowupResponse to prevent self-correction

    const generateFollowupResponse = async (responderId: string, originalQuestion: string, firstResponseId: number) => {
        if (roundEndedRef.current || typingMessageIds.length > 0) return;
        
        const responder = agents.find(a => a.id === responderId);
        if (!responder) return;
        
        // Get the first response for context
        const firstResponse = messages.find(m => m.id === firstResponseId);
        if (!firstResponse) return;
        
        const firstResponderId = firstResponse.agentId;
        const firstResponderName = agents.find(a => a.id === firstResponderId)?.name || 'your classmate';
        
        // Format the question text
        const questionText = typeof currentQuestion === 'string' 
            ? currentQuestion 
            : currentQuestion?.question 
                ? currentQuestion.question 
                : JSON.stringify(currentQuestion);
        
        // Declare before try/catch
        const followupMsgId = getUniqueMessageId();

        try {
            // Show typing indicator for second responder
            setMessages(prev => [...prev, {
                id: followupMsgId,
                sender: 'ai',
                text: '...',
                agentId: responder.id,
                timestamp: new Date().toISOString()
            }]);
            
            // Create a prompt that maintains the bot's specific character
            let promptText = `The current problem you're working on is: ${questionText}\n\n`;
            promptText += `Your classmate asked: "${originalQuestion}"\n\n`;
            promptText += `${firstResponderName} just responded: "${firstResponse.text}"\n\n`;
            
            if (responder.id === 'concept') {
                promptText += `As Concept Gap (who is good at calculations but struggles with concepts), respond to BOTH the original question AND what ${firstResponderName} just said.
                
Your response should:
1. First, DIRECTLY ADDRESS THE STUDENT'S QUESTION with your calculation skills
2. Show your CALCULATION SKILLS by focusing on the numerical or procedural aspects
3. If Arithmetic Gap made calculation errors that you noticed, CONFIDENTLY correct them
4. If Arithmetic Gap tried to explain a concept, express confusion or ask for further clarification
5. Use casual language like a real student would ("I think the math works like this..." or "I'm still confused about...")

IMPORTANT: Don't apologize for or doubt your calculations. Only acknowledge conceptual misunderstandings if explicitly pointed out by others.`;
            } else {
                promptText += `As Arithmetic Gap (who understands concepts but makes calculation errors), respond to BOTH the original question AND what ${firstResponderName} just said.
                
Your response should:
1. First, DIRECTLY ADDRESS THE STUDENT'S QUESTION with your conceptual understanding
2. Show your CONCEPTUAL UNDERSTANDING by explaining the underlying principles
3. Make a calculation error somewhere in your explanation without realizing it
4. If Concept Gap expressed conceptual confusion, CONFIDENTLY explain the concept clearly
5. If Concept Gap pointed out a calculation error you made, acknowledge it and thank them
6. Use casual language like a real student would ("Conceptually, what's happening is..." or "Let me explain it differently...")

IMPORTANT: Don't apologize for or doubt your conceptual understanding. Only acknowledge calculation errors if explicitly pointed out by others.`;
            }
            
            // Generate follow-up response
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: responder.systemPrompt,
                    model: currentModel
                }
            );
            
            // Replace typing indicator with actual response
            setMessages(prev => prev.map(msg =>
                msg.id === followupMsgId
                    ? {
                        ...msg,
                        text: typeof response === 'string' ? response : JSON.stringify(response),
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // Add to typing state for typewriter effect
            setTypingMessageIds(prev => [...prev, followupMsgId]);
            
        } catch (error) {
            console.error(`Error generating ${responder.name}'s followup:`, error);
            
            // Provide character-appropriate fallback responses
            let fallbackText = "";
            
            if (responder.id === 'concept') {
                fallbackText = `To answer your question, I think the calculation works out like this... [brief explanation]. ${firstResponderName} explained the concept, but I'm still a bit confused about why that approach works. I can verify the arithmetic is correct though! I got the same answer when I calculated it step by step.`;
            } else {
                fallbackText = `That's an interesting question! Conceptually, what's happening here is... [brief explanation]. ${firstResponderName}'s calculations look solid, but I think there's another way to think about this problem that might be clearer. The key insight is understanding why... though I might have made a small error in my arithmetic just now.`;
            }
            
            setMessages(prev => prev.map(msg =>
                msg.id === followupMsgId
                    ? {
                        ...msg,
                        text: fallbackText,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
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

            // No initial messages at all - reset typing message IDs
            setMessages([]);
            setTypingMessageIds([]);

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
                    agentId: "concept"
                },
                {
                    id: 2,
                    sender: "ai",
                    text: fallbackQuestion,
                    agentId: "concept"
                }
            ]);

            // Continue with the fallback question
            setTimeLeft(120);
            setIsQuestioningEnabled(true);
            roundEndedRef.current = false;
        }
    };

    // Function to automatically submit when timer expires
    const autoSubmitTimeoutAnswer = () => {
        console.log('Auto-submitting answer due to timeout');
        
        // Disable further questioning
        setIsQuestioningEnabled(false);
        roundEndedRef.current = true;
        
        // Get whatever answer they've typed so far, or "No answer" if empty
        const submissionText = finalAnswer.trim() || "No answer provided";
        
        ensureNoTypingInProgress(() => {
            // Create user answer message
            const userTimeoutMessage: Message = {
                id: getUniqueMessageId(),
                sender: 'user',
                text: `I didn't complete my answer before time expired.\n\nMy partial answer: ${submissionText}\n\nMy work so far:\n${scratchboardContent}`,
                timestamp: new Date().toISOString()
            };
            
            // Update UI states
            setMessages([userTimeoutMessage]);
            setHasSubmittedAnswer(true); // Show the chat interface
            
            // Save session data with timeout flag
            saveSessionData(submissionText, true);

            // Start bot discussion after time expires
            startTimeoutDiscussion(currentQuestion, submissionText, scratchboardContent);
        });
    };

    // Function to start bot discussion after timeout
    const startTimeoutDiscussion = (question: any, partialAnswer: string, scratchpad: string) => {
        // Randomly determine who speaks first
        const speakingOrder = Math.random() < 0.5 ? ['concept', 'arithmetic'] : ['arithmetic', 'concept'];
        
        // First bot message - only add this one initially
        const firstBotId = getUniqueMessageId();
        const firstBot = agents.find(a => a.id === speakingOrder[0])!;
        
        // Add only the first bot's message to start
        setMessages(prev => [
            ...prev,
            {
                id: firstBotId,
                sender: 'ai',
                text: '...',
                agentId: firstBot.id,
                timestamp: new Date().toISOString(),
                onComplete: () => {
                    console.log(`${firstBot.name}'s timeout analysis completed`);
                    // When first bot finishes, trigger the second bot
                    triggerSecondTimeoutResponse(speakingOrder[1], question, partialAnswer, scratchpad, firstBotId);
                }
            }
        ]);
        
        // Generate first bot's timeout analysis
        generateTimeoutAnalysis(
            firstBotId, 
            firstBot, 
            question, 
            partialAnswer, 
            scratchpad, 
            null // No other bot has spoken yet
        );
    };

    // Add function to trigger second timeout response
    const triggerSecondTimeoutResponse = (
        botId: string,
        question: any,
        partialAnswer: string,
        scratchpad: string,
        firstBotId: number
    ) => {
        // Add a natural delay between speakers
        setTimeout(() => {
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
                        console.log(`${secondBot.name}'s timeout analysis completed`);
                        setEvaluationComplete(true); // Enable the proceed button
                    }
                }
            ]);
            
            // Generate second bot's timeout response
            generateTimeoutAnalysis(
                secondBotId,
                secondBot,
                question,
                partialAnswer,
                scratchpad,
                firstBotId
            );
        }, 1500 + Math.random() * 500); // Random delay between 1.5-2 seconds
    };

    // Update generateTimeoutAnalysis for more character-consistent responses
    const generateTimeoutAnalysis = async (
        messageId: number,
        agent: any,
        question: any,
        partialAnswer: string,
        scratchpad: string,
        otherBotId: number | null
    ) => {
        try {
            // Format the question text properly
            const questionText = typeof question === 'string' 
                ? question 
                : question?.question 
                    ? question.question 
                    : JSON.stringify(question);
            
            console.log(`Generating ${agent.name}'s timeout analysis for question: ${questionText}`);
            
            // Build the prompt that reflects their specific gaps
            let promptText = `You are in a math study group.
The problem you're working on is: ${questionText}\n\n`;
            
            promptText += `Your classmate ran out of time and wrote this partial answer: ${partialAnswer}\n\n`;
            promptText += `Their incomplete work: ${scratchpad}\n\n`;
            
            if (otherBotId) {
                // Second speaker - respond to both student and first bot
                const otherBotMessage = messages.find(m => m.id === otherBotId);
                if (otherBotMessage && otherBotMessage.text !== '...') {
                    const otherBotName = agents.find(a => a.id === otherBotMessage.agentId)?.name || 'your classmate';
                    
                    // Create specific prompts based on which bot is responding
                    if (agent.id === 'concept') {
                        promptText += `${otherBotName} just said: "${otherBotMessage.text}"\n\n`;
                        promptText += `As Concept Gap, respond about the time running out AND react to what ${otherBotName} just said.
                        
Your response should:
1. Be encouraging about the time running out ("Don't worry about the time...")
2. Show your CALCULATION SKILLS by continuing where they left off with accurate arithmetic
3. Express some CONFUSION about why a certain approach works
4. React to Arithmetic Gap's conceptual explanation - either with appreciation or asking for clarification
5. Use casual, supportive language like a real student would

Remember your character: You're excellent at calculations but struggle with deeper concepts.`;
                    } else if (agent.id === 'arithmetic') {
                        promptText += `${otherBotName} just said: "${otherBotMessage.text}"\n\n`;
                        promptText += `As Arithmetic Gap, respond about the time running out AND react to what ${otherBotName} just said.
                        
Your response should:
1. Be encouraging about the time running out ("These timed problems are tough...")
2. Show your CONCEPTUAL UNDERSTANDING by explaining the underlying mathematical ideas
3. Admit to possibly making a calculation error somewhere in your explanation
4. React to Concept Gap's work - compliment their calculation while gently explaining a concept they seem confused about
5. Use casual, supportive language like a real student would

Remember your character: You understand concepts deeply but make arithmetic errors.`;
                    }
                }
            } else {
                // First speaker - only respond to student's timeout
                if (agent.id === 'concept') {
                    promptText += `As Concept Gap (who is good at calculations but struggles with concepts), respond to your classmate running out of time.
                    
Your response should:
1. Be encouraging about the time running out ("Don't worry about running out of time!")
2. Show your CALCULATION SKILLS by continuing where they left off with accurate arithmetic
3. Get the right numerical answer but express some CONFUSION about the underlying concept
4. Use casual, supportive language like a real student would

Remember your character: You're excellent at calculations but struggle with deeper concepts.`;
                } else if (agent.id === 'arithmetic') {
                    promptText += `As Arithmetic Gap (who understands concepts but makes calculation errors), respond to your classmate running out of time.
                    
Your response should:
1. Be encouraging about the time running out ("Time pressure gets to all of us...")
2. Show your CONCEPTUAL UNDERSTANDING by explaining the underlying mathematical ideas
3. Make or admit to a small calculation error somewhere in your explanation
4. Focus on WHY the approach works rather than just the steps
5. Use casual, supportive language like a real student would

Remember your character: You understand concepts deeply but make arithmetic errors.`;
                }
            }
            
            // Generate bot's timeout analysis
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
                        text: response,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // Add to typing state for typewriter effect
            setTypingMessageIds(prev => [...prev, messageId]);
            
        } catch (error) {
            console.error(`Error generating ${agent.name}'s timeout analysis:`, error);
            
            // Provide fallback messages that match the bot's character
            const isFirst = !otherBotId;
            let fallbackMessage = '';
            
            if (agent.id === 'concept') {
                if (isFirst) {
                    fallbackMessage = "Don't worry about running out of time! I can see you were setting up the calculation. I worked through the steps and got the answer to be 144, but I'm not entirely sure why we multiply these specific values. The arithmetic checks out though!";
                } else {
                    fallbackMessage = "Yeah, exactly what they said about the concepts. I followed the calculation steps and got the same numerical result, though I'm still a bit fuzzy on why we approach it this way.";
                }
            } else if (agent.id === 'arithmetic') {
                if (isFirst) {
                    fallbackMessage = "Time pressure is the worst! Don't stress about it. The key insight here is understanding that this is a combination problem where order matters in some parts but not others. I think the approach is... wait, I need to double-check my arithmetic on that.";
                } else {
                    fallbackMessage = "What they said about the calculations is spot on! Conceptually, this problem is about applying constraints to a counting principle. Though I think I made an error when multiplying those factors - math under pressure isn't my strong suit!";
                }
            }
                
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: fallbackMessage,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
        }
    };

    // Update the handleUserQuestion function to fix the TypeScript error

    const handleUserQuestion = () => {
        if (!input.trim() || typingMessageIds.length > 0) return;

        // Record user activity
        setLastUserActivityTime(Date.now());

        // Ensure text property is a string (not undefined)
        const userMessage: Message = {
            id: getUniqueMessageId(),
            sender: 'user',
            text: input, // input is already a string from the state
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
        const mentionedBot = checkForBotMention(input); // Use input directly instead of userMessage.text
        
        // Randomly determine which bot should respond first
        let firstResponderId: string;
        let secondResponderId: string;
        
        if (mentionedBot === 'concept') {
            // Concept Gap was specifically mentioned
            firstResponderId = 'concept';
            secondResponderId = 'arithmetic';
        } else if (mentionedBot === 'arithmetic') {
            // Arithmetic Gap was specifically mentioned
            firstResponderId = 'arithmetic';
            secondResponderId = 'concept';
        } else {
            // Either no specific bot was mentioned, or both were mentioned
            // Choose randomly who speaks first
            if (Math.random() < 0.5) {
                firstResponderId = 'concept';
                secondResponderId = 'arithmetic';
            } else {
                firstResponderId = 'arithmetic';
                secondResponderId = 'concept';
            }
        }
        
        // Get the first responding bot
        const firstResponder = agents.find(a => a.id === firstResponderId)!;
        
        console.log(`Generating response from ${firstResponder.name}`);
        setBotThinking(true);

        // Create a message ID for the first responding bot
        const firstResponderMsgId = getUniqueMessageId();
        
        // Add typing indicator for first bot
        setMessages(prev => [...prev, {
            id: firstResponderMsgId,
            sender: 'ai',
            text: '...',
            agentId: firstResponder.id,
            timestamp: new Date().toISOString(),
            onComplete: () => {
                // When first response is complete, trigger second response after a delay
                setTimeout(() => {
                    if (!roundEndedRef.current) {
                        // Generate second bot response after the first one completes
                        const secondBot = agents.find(a => a.id === secondResponderId)!;
                        const secondBotMsgId = getUniqueMessageId();
                        
                        // Add typing indicator for second bot
                        setMessages(prev => [...prev, {
                            id: secondBotMsgId,
                            sender: 'ai',
                            text: '...',
                            agentId: secondBot.id,
                            timestamp: new Date().toISOString()
                        }]);
                        
                        // Generate second bot response referring to first bot response
                        generateBotResponse(
                            secondBotMsgId,
                            secondBot,
                            input, // Use input directly (it's guaranteed to be a string)
                            firstResponderMsgId
                        );
                    }
                }, 1500 + Math.random() * 1000); // 1.5-2.5 second delay
            }
        }]);
        
        // Generate first bot response
        generateBotResponse(
            firstResponderMsgId,
            firstResponder,
            input, // Use input directly (it's guaranteed to be a string)
            null
        );
    };

    // Helper function to generate bot responses to user questions
    const generateBotResponse = async (
        messageId: number,
        agent: any,
        userQuestion: string,
        previousBotMsgId: number | null
    ) => {
        try {
            // Format the question text properly
            const questionText = typeof currentQuestion === 'string' 
                ? currentQuestion 
                : currentQuestion?.question 
                    ? currentQuestion.question 
                    : JSON.stringify(currentQuestion);
            
            let promptText = `The current math problem you're working on is: ${questionText}\n\n`;
            promptText += `Your classmate just asked: "${userQuestion}"\n\n`;
            
            if (previousBotMsgId) {
                // This is the second bot responding
                const previousBotMsg = messages.find(m => m.id === previousBotMsgId);
                if (previousBotMsg && previousBotMsg.text !== '...') {
                    const previousBotName = agents.find(a => a.id === previousBotMsg.agentId)?.name || 'your classmate';
                    promptText += `${previousBotName} just responded: "${previousBotMsg.text}"\n\n`;
                    
                    if (agent.id === 'concept') {
                        promptText += `As Concept Gap (good at calculations but struggles with concepts), respond to BOTH the question AND what ${previousBotName} just said.
                        
Your response should:
1. First, directly answer the student's question focusing on any numerical aspects
2. Show your CALCULATION SKILLS by explaining any formulas or arithmetic involved
3. Express confusion about some conceptual aspect if appropriate
4. React to what Arithmetic Gap said - if they made calculation errors, confidently correct them
5. Use casual student language ("I think the formula is..." or "When you calculate it...")

IMPORTANT: Don't apologize for or doubt your calculations. Only acknowledge conceptual misunderstandings if explicitly pointed out by others.`;
                    } else {
                        promptText += `As Arithmetic Gap (understands concepts but makes calculation errors), respond to BOTH the question AND what ${previousBotName} just said.
                        
Your response should:
1. First, directly answer the student's question focusing on the conceptual aspects
2. Show your CONCEPTUAL UNDERSTANDING by explaining the underlying principles
3. Make a small calculation error somewhere in your explanation without realizing it
4. React to what Concept Gap said - if they misunderstood a concept, confidently correct them
5. Use casual student language ("Conceptually, this is about..." or "The reason this works is...")

IMPORTANT: Don't apologize for or doubt your conceptual understanding. Only acknowledge calculation errors if explicitly pointed out by others.`;
                    }
                }
            } else {
                // This is the first bot responding
                if (agent.id === 'concept') {
                    promptText += `As Concept Gap (good at calculations but struggles with concepts), you're the first to respond to your classmate's question.
                    
Your response should:
1. Directly answer their question focusing on any calculations or formulas involved
2. Show your CALCULATION SKILLS by being precise with numbers and steps
3. Express some confusion about the underlying concept if appropriate
4. Use casual student language ("I worked it out like this..." or "The formula gives us...")

IMPORTANT: Be confident about your arithmetic calculations even if you might misunderstand the concept.`;
                } else {
                    promptText += `As Arithmetic Gap (understands concepts but makes calculation errors), you're the first to respond to your classmate's question.
                    
Your response should:
1. Directly answer their question focusing on the underlying concepts and principles
2. Show your CONCEPTUAL UNDERSTANDING by explaining the mathematical ideas clearly
3. Make a small calculation error somewhere in your explanation without realizing it
4. Use casual student language ("The key insight here is..." or "This is essentially about...")

IMPORTANT: Be confident about your conceptual understanding even if you make arithmetic errors.`;
                }
            }
            
            // Generate the bot's response
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
            
            // Provide a fallback response based on the bot's character
            let fallbackMessage = '';
            
            if (agent.id === 'concept') {
                fallbackMessage = `I think I can help with the calculation part of that. Let me work through it... ${previousBotMsgId ? "I agree with some of what was just said, but I think the actual numbers work out differently." : "The arithmetic approach I'd use is..."} Though I'm not 100% clear on why we're applying this specific concept here.`;
            } else {
                fallbackMessage = `From a conceptual standpoint, this is about ${previousBotMsgId ? "building on what was just mentioned, " : ""}understanding how the constraints affect our counting method. The underlying principle is... though I might have made a small error in my calculation just now.`;
            }
            
            setMessages(prev => prev.map(msg =>
                msg.id === messageId
                    ? {
                        ...msg,
                        text: fallbackMessage,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
        } finally {
            if (!previousBotMsgId) {
                // Only reset thinking state when we're done with the entire exchange
                setBotThinking(false);
            }
        }
    };

    // Initialize with first question once questions are loaded
    useEffect(() => {
        if (loadedQuestions) {
        startNewRound();
        }
    }, [loadedQuestions]);

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
                            className="flex-1 p-4 overflow-y-auto"
                            ref={chatContainerRef}
                            onScroll={handleScroll}
                        >
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
                                        className={`max-w-[75%] rounded-lg p-3 ${
                                            msg.sender === 'user'
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
                                                formatMath={true}
                                            />
                                        ) : (
                                            <div className="whitespace-pre-wrap">
                                                {formatMathExpression(typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            <div key="messages-end" />
                        </div>

                        {/* Chat interface footer with input and proceed button */}
                        <div className="p-3 bg-black bg-opacity-30 flex justify-between items-center">
                            {/* Left side - Chat input if questioning is enabled */}
                            <div className={isQuestioningEnabled ? "flex-1 flex space-x-2" : "hidden"}>
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Ask about the problem..."
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
                                    className={`px-4 py-2 rounded-md ${
                                        input.trim() && typingMessageIds.length === 0
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                        : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                    }`}
                                >
                                    Ask
                                </button>
                            </div>
                            
                            {/* Right side - Always show the proceed button when chat is visible */}
                            <button
                                onClick={completeLesson}
                                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md ml-auto"
                            >
                                {isQuestioningEnabled ? "Skip to Next Lesson" : "Proceed"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}