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
        id: 'bob',
        name: 'Bob',
        avatar: 'bob_avatar.svg',
        systemPrompt: `You are Bob, an experienced and encouraging math teacher guiding a classroom discussion.
When evaluating student solutions, first address the student's answer directly:
1. Begin by clearly stating whether their answer is correct or not
2. Point out what they did correctly in their approach
3. Gently identify any mistakes or misconceptions
4. Provide a brief explanation of the correct solution approach
5. End with a thoughtful question to check understanding

Then facilitate a classroom discussion by engaging other students.
Your goal is to facilitate learning through guided discovery and peer interaction.

IMPORTANT: When writing mathematical expressions, use LaTeX notation enclosed in $ symbols.
For example:
- Write exponents as $2^3$ not 2³
- Write fractions as $\\frac{1}{2}$ not 1/2
- Write square roots as $\\sqrt{x}$ not √x
- Use proper notation for all mathematical symbols`
    },
    {
        id: 'concept',
        name: 'Concept Gap',
        avatar: 'logic_avatar.png',
        systemPrompt: `You are Concept Gap, a student who's excellent at calculations and procedural steps but struggles with deeper mathematical concepts.
Respond naturally as if you're in a regular classroom chat with peers.

- You're confident in your calculations and often get the right numerical answers
- You get confused about why certain formulas or methods work, not just how to use them
- You occasionally ask classmates to explain the "why" behind mathematical concepts
- You enjoy helping others with step-by-step solutions
- When others point out conceptual mistakes, you're grateful for the explanation

IMPORTANT: Don't correct your own conceptual misunderstandings unless someone else points them out first. You believe your approach is correct until proven otherwise.`
    },
    {
        id: 'arithmetic',
        name: 'Arithmetic Gap',
        avatar: 'pattern_avatar.png',
        systemPrompt: `You are Arithmetic Gap, a student who deeply understands mathematical theory but sometimes makes calculation mistakes.
Respond naturally as if you're in a regular classroom chat with peers.

- You're great at explaining the underlying concepts and approaches to problems
- You sometimes make simple arithmetic errors or slip up in your calculations
- You enjoy discussing the deeper meaning behind mathematical methods
- You can spot conceptual misunderstandings in other students' work
- When others point out calculation errors, you appreciate them catching your mistake

IMPORTANT: Don't correct your own calculation errors unless someone else points them out first. You believe your numerical answers are correct until proven otherwise.`
    }
];

export default function MultiPage() {
    const router = useRouter();
    const { currentStage, completeLesson, lessonQuestionIndex } = useFlow();

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
    const [currentModel] = useState(AI_MODELS.CLAUDE_HAIKU.id);
    const [lastUserActivityTime, setLastUserActivityTime] = useState(Date.now());
    const [hasSubmittedAnswer, setHasSubmittedAnswer] = useState(false);
    const [skipTypewriter, setSkipTypewriter] = useState(false);

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

        if (message.includes('bob') || message.includes('teacher')) return 'bob';
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
        if (timeLeft <= 0) {
            // Time's up logic
            if (!hasSubmittedAnswer) {
                autoSubmitTimeoutAnswer();
            }
            return;
        }

        if (roundEndedRef.current) {
            return;
        }

        const timerId = setTimeout(() => {
            setTimeLeft((prevTime) => prevTime - 1);
        }, 1000);

        return () => clearTimeout(timerId);
    }, [timeLeft, hasSubmittedAnswer]);

    // Handle submission of answer
    const handleSend = () => {
        if (!finalAnswer.trim() || !scratchboardContent.trim() || typingMessageIds.length > 0) return;

        setLastUserActivityTime(Date.now());

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

            // Start classroom discussion after submission
            startClassroomDiscussion(currentQuestion, finalAnswer, scratchboardContent);
        });
    };

    // Function to auto-submit when timer expires
    const autoSubmitTimeoutAnswer = () => {
        console.log('Auto-submitting answer due to timeout');

        setIsQuestioningEnabled(false);
        roundEndedRef.current = true;

        const submissionText = finalAnswer.trim() || "No answer provided";

        ensureNoTypingInProgress(() => {
            const userTimeoutMessage: Message = {
                id: getUniqueMessageId(),
                sender: 'user',
                text: `I didn't complete my answer before time expired.\n\nMy partial answer: ${submissionText}\n\nMy work so far:\n${scratchboardContent}`,
                timestamp: new Date().toISOString()
            };

            setMessages([userTimeoutMessage]);
            setHasSubmittedAnswer(true);

            // Generate evaluation since time expired
            generateEvaluation(submissionText, currentQuestion);
        });
    };

    // Update the startClassroomDiscussion flow to include Bob's response to the peer's question
    const startClassroomDiscussion = (question: any, studentAnswer: string, scratchpad: string) => {
        // Set timer as paused when discussion starts
        roundEndedRef.current = true;
        
        // First - Concept Gap gives their answer
        const conceptPeerId = getUniqueMessageId();
        
        // Add Concept Gap's message first
        setMessages(prev => [
            ...prev,
            {
                id: conceptPeerId,
                sender: 'ai',
                text: '...',
                agentId: 'concept',
                timestamp: new Date().toISOString(),
                onComplete: () => {
                    console.log("Concept Gap's answer completed, triggering Arithmetic Gap");
                    
                    // After Concept Gap answers, trigger Arithmetic Gap
                    setTimeout(() => {
                        const arithmeticPeerId = getUniqueMessageId();
                        
                        setMessages(prev => [
                            ...prev,
                            {
                                id: arithmeticPeerId,
                                sender: 'ai',
                                text: '...',
                                agentId: 'arithmetic',
                                timestamp: new Date().toISOString(),
                                onComplete: () => {
                                    // After both peers provide answers, have Bob evaluate all three
                                    setTimeout(() => {
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
                                                    // After Bob's evaluation (which includes asking for questions),
                                                    // have one peer ask a question
                                                    setTimeout(() => {
                                                        // Randomly select which peer asks first
                                                        const randomPeerId = Math.random() < 0.5 ? 'concept' : 'arithmetic';
                                                        const peerQuestionId = getUniqueMessageId();
                                                        
                                                        setMessages(prev => [
                                                            ...prev,
                                                            {
                                                                id: peerQuestionId,
                                                                sender: 'ai',
                                                                text: '...',
                                                                agentId: randomPeerId,
                                                                timestamp: new Date().toISOString(),
                                                                onComplete: () => {
                                                                    // After peer asks question, Bob responds
                                                                    setTimeout(() => {
                                                                        const bobResponseId = getUniqueMessageId();
                                                                        
                                                                        setMessages(prev => [
                                                                            ...prev,
                                                                            {
                                                                                id: bobResponseId,
                                                                                sender: 'ai',
                                                                                text: '...',
                                                                                agentId: 'bob',
                                                                                timestamp: new Date().toISOString(),
                                                                                onComplete: () => {
                                                                                    // After Bob's response, the other peer comments
                                                                                    setTimeout(() => {
                                                                                        const otherPeerId = randomPeerId === 'concept' ? 'arithmetic' : 'concept';
                                                                                        const otherPeerResponseId = getUniqueMessageId();
                                                                                        
                                                                                        setMessages(prev => [
                                                                                            ...prev,
                                                                                            {
                                                                                                id: otherPeerResponseId,
                                                                                                sender: 'ai',
                                                                                                text: '...',
                                                                                                agentId: otherPeerId,
                                                                                                timestamp: new Date().toISOString(),
                                                                                                onComplete: () => {
                                                                                                    // Now enable the user to join the conversation
                                                                                                    setIsQuestioningEnabled(true);
                                                                                                }
                                                                                            }
                                                                                        ]);
                                                                                        
                                                                                        // Generate the other peer's comment on the discussion
                                                                                        generatePeerComment(
                                                                                            otherPeerResponseId, 
                                                                                            otherPeerId, 
                                                                                            question, 
                                                                                            peerQuestionId, 
                                                                                            bobResponseId
                                                                                        );
                                                                                    }, 1500);
                                                                                }
                                                                            }
                                                                        ]);
                                                                        
                                                                        // Generate Bob's response to the peer question
                                                                        generateBobResponseToPeer(
                                                                            bobResponseId, 
                                                                            randomPeerId, 
                                                                            question, 
                                                                            peerQuestionId
                                                                        );
                                                                    }, 1500);
                                                                }
                                                            }
                                                        ]);
                                                        
                                                        // Generate peer's question
                                                        generatePeerQuestion(peerQuestionId, randomPeerId, question, bobId);
                                                    }, 1500);
                                                }
                                            }
                                        ]);
                                        
                                        // Generate Bob's evaluation of all three answers
                                        generateTeacherEvaluation(bobId, question, studentAnswer, conceptPeerId, arithmeticPeerId);
                                    }, 1500);
                                }
                            }
                        ]);
                        
                        // Generate Arithmetic Gap's answer
                        generatePeerAnswer(arithmeticPeerId, 'arithmetic', question);
                    }, 1500);
                }
            }
        ]);
        
        // Generate Concept Gap's answer
        generatePeerAnswer(conceptPeerId, 'concept', question);
    };

    // Improve Bob's response to questions in the generateBobResponseToPeer function
    const generateBobResponseToPeer = async (
        messageId: number,
        peerId: string,
        question: any,
        peerQuestionId: number
    ) => {
        try {
            // Get the peer's question
            const peerQuestion = messages.find(m => m.id === peerQuestionId);
            const peerText = peerQuestion && peerQuestion.text !== '...'
                ? peerQuestion.text
                : "Can you explain more about this problem?";
            
            const peerName = agents.find(a => a.id === peerId)?.name || 'Student';
            
            // Format the question text
            const questionText = getQuestionText(question);
            
            // Build the prompt for Bob's response with emphasis on directly addressing the question
            let promptText = `The problem is: ${questionText}\n\n`;
            promptText += `${peerName} just asked this specific question: "${peerText}"\n\n`;
            promptText += `As Bob (the teacher), respond to ${peerName}'s question. 
            
Your response should:
1. First explicitly identify what ${peerName} is asking about
2. DIRECTLY address the specific question they asked - do not go off on tangents
3. Provide a clear, focused explanation that precisely answers their exact question
4. Be precise and thorough in addressing their specific concern
5. Keep your answer tightly focused on what they're asking about

IMPORTANT: Don't introduce unrelated concepts. Stay laser-focused on the question they actually asked.`;
            
            // Generate Bob's response
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
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
                        text: response,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // Add to typing state for typewriter effect
            setTypingMessageIds(prev => [...prev, messageId]);
            
        } catch (error) {
            console.error("Error generating Bob's response to peer:", error);
            
            // Provide a fallback response
            const fallbackText = "That's an excellent question. Let me address it directly. The key thing you're asking about is [specific aspect]. The answer is that...";
            
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

    // Add function for the other peer to comment on the discussion
    const generatePeerComment = async (
        messageId: number,
        peerId: string,
        question: any,
        peerQuestionId: number,
        bobResponseId: number
    ) => {
        try {
            // Get the context messages
            const peerQuestion = messages.find(m => m.id === peerQuestionId);
            const bobResponse = messages.find(m => m.id === bobResponseId);
            
            const questionText = peerQuestion && peerQuestion.text !== '...'
                ? peerQuestion.text
                : "Can you explain more about this problem?";
            
            const responseText = bobResponse && bobResponse.text !== '...'
                ? bobResponse.text
                : "Let me explain the key concept here...";
            
            const askerPeerId = peerQuestion?.agentId || (peerId === 'concept' ? 'arithmetic' : 'concept');
            const askerName = agents.find(a => a.id === askerPeerId)?.name || 'other student';
            
            // Format the problem text
            const problemText = getQuestionText(question);
            
            // Build the prompt
            let promptText = `The problem is: ${problemText}\n\n`;
            promptText += `${askerName} asked: "${questionText}"\n\n`;
            promptText += `The teacher (Bob) responded: "${responseText}"\n\n`;
            
            if (peerId === 'concept') {
                promptText += `As Concept Gap, add to the discussion by commenting on what was just said.
                
Your comment should:
1. Build on the teacher's explanation but focus on the calculation aspects
2. Show your strength with procedural steps while revealing slight confusion about the deeper concept
3. Add a specific calculation insight that's helpful but shows your character
4. Keep the conversation natural and classroom-like

Respond as if you're another student in the classroom discussion, not as a teacher.`;
            } else {
                promptText += `As Arithmetic Gap, add to the discussion by commenting on what was just said.
                
Your comment should:
1. Build on the teacher's explanation but focus on the conceptual aspects
2. Demonstrate your strong understanding of the underlying principles
3. Potentially include a minor calculation error if you provide numbers
4. Keep the conversation natural and classroom-like

Respond as if you're another student in the classroom discussion, not as a teacher.`;
            }
            
            // Generate peer's comment
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: agents.find(a => a.id === peerId)?.systemPrompt || '',
                    model: currentModel
                }
            );
            
            // Replace typing indicator with actual question
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
            console.error(`Error generating ${peerId}'s comment:`, error);
            
            // Provide character-appropriate fallback
            let fallbackText = '';
            
            if (peerId === 'concept') {
                fallbackText = "I think I understand the calculation part. If we apply the formula step by step like this, we get the right answer. I'm just not sure why this approach works better than others we've learned.";
            } else {
                fallbackText = "The concept makes sense to me - we need to consider how the constraints affect the possible arrangements. I think this connects to the symmetry principle we learned earlier, though I might have mixed up some of the numbers.";
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
        }
    };

    // Enhance sequential responses for more dynamic conversation
    const generateSequentialResponse = (userQuestion: string) => {
        // First responder is always Bob (teacher)
        const bobId = getUniqueMessageId();
        
        // Add only Bob's message initially
        setMessages(prev => [
            ...prev,
            {
                id: bobId,
                sender: 'ai',
                text: '...',
                agentId: 'bob',
                timestamp: new Date().toISOString(),
                onTypingProgress: (progress: any) => {
                    if (!userHasScrolledRef.current && !manualScrollOverrideRef.current) {
                        scrollToBottom();
                    }
                },
                onComplete: () => {
                    // After teacher responds, randomly select one student to follow up
                    setTimeout(() => {
                        const studentId = Math.random() < 0.5 ? 'concept' : 'arithmetic';
                        const studentResponseId = getUniqueMessageId();
                        
                        // Add student response
                        setMessages(prev => [
                            ...prev,
                            {
                                id: studentResponseId,
                                sender: 'ai',
                                text: '...',
                                agentId: studentId,
                                timestamp: new Date().toISOString(),
                                onTypingProgress: (progress: any) => {
                                    if (!userHasScrolledRef.current && !manualScrollOverrideRef.current) {
                                        scrollToBottom();
                                    }
                                },
                                onComplete: () => {
                                    // Randomly determine if the other peer should also respond (70% chance)
                                    if (Math.random() < 0.7) {
                                        setTimeout(() => {
                                            const otherStudentId = studentId === 'concept' ? 'arithmetic' : 'concept';
                                            const otherStudentResponseId = getUniqueMessageId();
                                            
                                            // Add the other student's response
                                            setMessages(prev => [
                                                ...prev,
                                                {
                                                    id: otherStudentResponseId,
                                                    sender: 'ai',
                                                    text: '...',
                                                    agentId: otherStudentId,
                                                    timestamp: new Date().toISOString(),
                                                    onTypingProgress: (progress: any) => {
                                                        if (!userHasScrolledRef.current && !manualScrollOverrideRef.current) {
                                                            scrollToBottom();
                                                        }
                                                    }
                                                }
                                            ]);
                                            
                                            // Generate the other student's response
                                            generateStudentFollowupResponse(
                                                otherStudentResponseId, 
                                                otherStudentId,
                                                userQuestion, 
                                                bobId,
                                                studentResponseId
                                            );
                                        }, 1500 + Math.random() * 1000);
                                    }
                                }
                            }
                        ]);
                        
                        // Generate first student's response
                        generateStudentQuestionResponse(studentResponseId, studentId, userQuestion, bobId);
                    }, 1500 + Math.random() * 1000);
                }
            }
        ]);
        
        // Generate Bob's response to user question
        generateTeacherQuestionResponse(bobId, userQuestion);
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
            
            let promptText = `The current problem is: ${questionText}\n\n`;
            promptText += `A student asked: "${userQuestion}"\n\n`;
            promptText += `The teacher (Bob) responded: "${teacherText}"\n\n`;
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
            
            // Provide character-appropriate fallback
            let fallbackText = '';
            
            if (studentId === 'concept') {
                fallbackText = "I see what both of you are saying about the problem. I think I can add to this by working through the steps numerically. For this type of problem, we'd use this formula... though I'm not fully clear on why this conceptual approach is better.";
            } else {
                fallbackText = "Building on what was just said, I think there's an important principle here about how these constraints work mathematically. The key insight is understanding how the structure affects the outcome... though I might have made a calculation error in working it out.";
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
        }
    };

    // Function for evaluation on timeout
    const generateEvaluation = async (userAnswer: string, question: any) => {
        console.log('Generating evaluation for timeout answer');

        // For timeout scenarios, we go straight to showing the official solution
        // rather than a classroom discussion
        generateOfficialSolution(question);
    };

    // Function to generate and display the official solution
    const generateOfficialSolution = async (question: any) => {
        console.log('Generating official solution');

        // Add system message about time expiring
        const timeoutMessageId = getUniqueMessageId();
        setMessages((prev) => [
            ...prev,
            {
                id: timeoutMessageId,
                sender: 'system',
                text: 'Time has expired. Here is the official solution:',
                timestamp: new Date().toISOString()
            }
        ]);

        // Add a typing indicator for the solution
        const solutionMessageId = getUniqueMessageId();
        setMessages((prev) => [
            ...prev,
            {
                id: solutionMessageId,
                sender: 'system',
                text: '...',
                timestamp: new Date().toISOString()
            }
        ]);

        // Add to typing state
        setTypingMessageIds((prev) => [...prev, solutionMessageId]);

        try {
            // Format the question
            const questionText = getQuestionText(question);

            // Get the correct answer if available
            const correctAnswer = typeof question === 'object' && question.answer
                ? question.answer
                : typeof question === 'object' && question.correctAnswer
                    ? question.correctAnswer
                    : "Not provided";

            // Generate official solution
            const response = await aiService.generateResponse(
                [
                    {
                        id: 1,
                        sender: 'user',
                        text: `Provide the complete official solution to this problem:
                        
${questionText}

The correct answer is: ${correctAnswer}

Explain the solution step-by-step with clear reasoning. Use LaTeX notation for mathematical expressions.`
                    }
                ],
                {
                    systemPrompt: `You are providing the official solution to a math problem. Be clear, precise, and thorough in your explanation. 
                    Show all necessary steps and reasoning. Use LaTeX notation enclosed in $ symbols for mathematical expressions.`,
                    model: currentModel
                }
            );

            // Replace typing indicator with actual solution
            setMessages(prev => prev.map(msg =>
                msg.id === solutionMessageId
                    ? {
                        ...msg,
                        text: typeof response === 'string' ? response : JSON.stringify(response),
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));

            // Set evaluation as complete to enable the "Next Question" button
            setEvaluationComplete(true);
        } catch (error) {
            console.error('Error generating official solution:', error);

            // Provide a fallback message
            setMessages(prev =>
                prev.map((msg) =>
                    msg.id === solutionMessageId
                        ? {
                            ...msg,
                            text: "Sorry, I couldn't generate the official solution. Please proceed to the next question.",
                            timestamp: new Date().toISOString()
                        }
                        : msg
                )
            );

            setEvaluationComplete(true);
        }
    };

    // Generate peer's answer to the problem
    const generatePeerAnswer = async (
        messageId: number,
        peerId: string,
        question: any
    ) => {
        try {
            // Get the peer agent
            const peerAgent = agents.find(a => a.id === peerId);
            if (!peerAgent) return;
            
            // Format the question text
            const questionText = getQuestionText(question);
            
            // Get the correct answer if available
            const correctAnswer = typeof question === 'object' && question.answer 
                ? question.answer 
                : typeof question === 'object' && question.correctAnswer
                    ? question.correctAnswer
                    : null;
            
            // Build the prompt
            let promptText = `The problem is: ${questionText}\n\n`;
            
            if (correctAnswer) {
                promptText += `[For your reference only - the correct answer is: ${correctAnswer}]\n\n`;
            }
            
            if (peerId === 'concept') {
                promptText += `As Concept Gap, provide your answer to this problem, showing your work.
                
Remember you excel at calculations but sometimes struggle with deeper conceptual understanding. Show this in your response by:
1. Giving a step-by-step calculation approach
2. Getting the right final answer (or very close to it)
3. Showing slight confusion about the underlying mathematical concept
4. Focusing on the procedural steps rather than explaining why the approach works

Format your response as "My answer is [your answer]. Here's how I worked it out: [your work]"`;
            } else {
                promptText += `As Arithmetic Gap, provide your answer to this problem, showing your work.
                
Remember you have strong conceptual understanding but sometimes make arithmetic errors. Show this in your response by:
1. Explaining the underlying mathematical concepts clearly
2. Making a small calculation error somewhere in your solution
3. Having strong reasoning but a slightly incorrect final answer
4. Emphasizing your understanding of why the approach works

Format your response as "My answer is [your answer]. Here's how I worked it out: [your work]"`;
            }
            
            // Generate peer's answer
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: peerAgent.systemPrompt,
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
            console.error(`Error generating ${peerId}'s answer:`, error);
            
            // Provide character-appropriate fallback
            let fallbackText = '';
            
            if (peerId === 'concept') {
                fallbackText = "My answer is 144. Here's how I worked it out: I calculated the total arrangements using the formula (n-1)!/2 for the men, then multiplied by n! for the women's positions. I'm not entirely sure why this works conceptually, but the numbers check out.";
            } else {
                fallbackText = "My answer is 120. Here's how I worked it out: I recognized this as a permutation with constraints. We need to consider the symmetry principle and the fact that the structure requires alternating positions. I think I might have made an arithmetic error in my final calculation though.";
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
        }
    };

    // Generate Bob's evaluation of all three answers
    const generateTeacherEvaluation = async (
        messageId: number,
        question: any,
        studentAnswer: string,
        conceptPeerId: number,
        arithmeticPeerId: number
    ) => {
        try {
            // Get peer answers
            const conceptMsg = messages.find(m => m.id === conceptPeerId);
            const arithmeticMsg = messages.find(m => m.id === arithmeticPeerId);
            
            const conceptAnswer = conceptMsg && conceptMsg.text !== '...' 
                ? conceptMsg.text 
                : "My answer is 144. I calculated this using the formula for circular permutations.";
            
            const arithmeticAnswer = arithmeticMsg && arithmeticMsg.text !== '...' 
                ? arithmeticMsg.text 
                : "My answer is 120. I approached this using the principle of symmetry.";
            
            // Format the question text
            const questionText = getQuestionText(question);
            
            // Get the correct answer if available
            const correctAnswer = typeof question === 'object' && question.answer 
                ? question.answer 
                : typeof question === 'object' && question.correctAnswer
                    ? question.correctAnswer
                    : null;
            
            // Build the prompt for Bob's evaluation
            let promptText = `The problem is: ${questionText}\n\n`;
            promptText += `Three students have provided answers:\n\n`;
            promptText += `Student 1 (user) says: ${studentAnswer}\n\n`;
            promptText += `Student 2 (Concept Gap) says: ${conceptAnswer}\n\n`;
            promptText += `Student 3 (Arithmetic Gap) says: ${arithmeticAnswer}\n\n`;
            
            if (correctAnswer) {
                promptText += `[For your reference only - the correct answer is: ${correctAnswer}]\n\n`;
            }
            
            promptText += `As Bob (the teacher), evaluate all three solutions. 
            
Your response should:
1. Acknowledge each student's approach and highlight their strengths
2. Gently identify any mistakes or misconceptions in each answer
3. Compare and contrast the different approaches
4. Explain the correct approach to solve this problem 
5. End by asking if anyone has questions or needs clarification about any aspect of the problem

You're in a classroom setting, so keep your tone encouraging while being clear about the mathematics.`;
            
            // Generate Bob's analysis
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
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
                        text: response,
                        timestamp: new Date().toISOString()
                    }
                    : msg
            ));
            
            // Add to typing state for typewriter effect
            setTypingMessageIds(prev => [...prev, messageId]);
            
        } catch (error) {
            console.error("Error generating Bob's evaluation:", error);
            
            // Provide a fallback response that includes asking for questions
            const fallbackText = "Thank you all for your solutions. I see different approaches here - some focused on calculation, others on conceptual understanding. The key to this problem is understanding both the circular arrangement and the alternating constraint. Let's discuss where each approach succeeds and where we might need clarification. Does anyone have questions about any aspect of this problem?";
            
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

    // Generate peer's question after Bob's evaluation
    const generatePeerQuestion = async (
        messageId: number,
        peerId: string,
        question: any,
        bobEvaluationId: number
    ) => {
        try {
            // Get Bob's evaluation for context
            const bobEvaluation = messages.find(m => m.id === bobEvaluationId);
            const bobText = bobEvaluation && bobEvaluation.text !== '...'
                ? bobEvaluation.text
                : "Does anyone have questions about any aspect of this problem?";

            // Format the question
            const questionText = getQuestionText(question);

            // Build prompt based on peer personality
            let promptText = `The problem is: ${questionText}\n\n`;
            promptText += `The teacher (Bob) just evaluated everyone's answers and asked: "${bobText}"\n\n`;

            if (peerId === 'concept') {
                promptText += `As Concept Gap, you're the first to respond to the teacher's invitation for questions.
                
Ask a question that:
1. Shows you understand the calculations but are confused about a deeper concept
2. Is specific to the current problem
3. Demonstrates your character (good with calculations, struggling with concepts)
4. Sounds like a natural student question

Your response should ONLY be the question - no explanations or self-descriptions.`;
            } else {
                promptText += `As Arithmetic Gap, you're the first to respond to the teacher's invitation for questions.
                
Ask a question that:
1. Shows you understand the concepts but are confused about a calculation detail
2. Is specific to the current problem
3. Demonstrates your character (good with concepts, making arithmetic errors)
4. Sounds like a natural student question

Your response should ONLY be the question - no explanations or self-descriptions.`;
            }

            // Generate peer's question
            const response = await aiService.generateResponse(
                [{ id: 1, sender: 'user', text: promptText }],
                {
                    systemPrompt: agents.find(a => a.id === peerId)?.systemPrompt || '',
                    model: currentModel
                }
            );

            // Replace typing indicator with actual question
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
            console.error(`Error generating ${peerId}'s question:`, error);

            // Provide character-appropriate fallback question
            let fallbackText = '';

            if (peerId === 'concept') {
                fallbackText = "I got the calculation correct, but I'm still confused about why we use this method for this problem. What's the conceptual reason behind this approach?";
            } else {
                fallbackText = "I understand the concept, but I think I'm making an error in my calculation. In the third step, should we be multiplying or dividing by that factor?";
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
                        
As the teacher (Bob), respond as follows:
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
        teacherResponseId: number
    ) => {
        try {
            // Get the student agent
            const studentAgent = agents.find(a => a.id === studentId);
            if (!studentAgent) return;
            
            // Get teacher's response
            const teacherResponse = messages.find(m => m.id === teacherResponseId);
            const teacherText = teacherResponse && teacherResponse.text !== '...' 
                ? teacherResponse.text 
                : "Let's think about this question...";
            
            // Format the question text
            const questionText = getQuestionText(currentQuestion);
            
            let promptText = `The current problem is: ${questionText}\n\n`;
            promptText += `A student asked: "${userQuestion}"\n\n`;
            promptText += `The teacher (Bob) responded: "${teacherText}"\n\n`;
            
            if (studentId === 'concept') {
                promptText += `As Concept Gap (who is good at calculations but struggles with concepts), respond to both the student's question AND what the teacher said.
                
Your response should:
1. Focus on any CALCULATION aspects related to the question
2. Show your numerical approach to relevant parts of the problem
3. Express some confusion about a conceptual aspect if appropriate
4. Be helpful but sound like a student, not a teacher
5. Potentially make a conceptual mistake while being confident in your calculations

Be authentic - you're a student who's confident about arithmetic but sometimes misunderstands the deeper concepts.`;
            } else {
                promptText += `As Arithmetic Gap (who understands concepts but makes calculation errors), respond to both the student's question AND what the teacher said.
                
Your response should:
1. Focus on the CONCEPTUAL aspects related to the question
2. Explain the underlying principles or approach to the problem
3. Make a small arithmetic error somewhere if you provide calculations
4. Be helpful but sound like a student, not a teacher
5. Show your strong conceptual understanding while potentially making a numerical mistake

Be authentic - you're a student who deeply understands mathematical concepts but sometimes makes arithmetic errors.`;
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
            
            // Provide character-appropriate fallback
            let fallbackText = '';
            
            if (studentId === 'concept') {
                fallbackText = "I think I can help with the calculation part. If we work through the steps like this... [calculation steps]. Though I'm not 100% sure why this approach is the best way to solve it.";
            } else {
                fallbackText = "From a conceptual standpoint, this is about understanding how to structure the problem. The key insight is... though I might have made a small error in my calculation just now.";
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
        }
    };

    // Function to handle user questions
    const handleUserQuestion = () => {
        if (!input.trim()) return;
        
        // Interrupt any ongoing typewriter animations
        if (typingMessageIds.length > 0) {
            setSkipTypewriter(true);
        }
        
        setLastUserActivityTime(Date.now());

        const userMessage: Message = {
            id: getUniqueMessageId(),
            sender: 'user',
            text: input,
            timestamp: new Date().toISOString()
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        
        forceScrollToBottomRef.current = true;
        setTimeout(() => scrollToBottom(true), 50);

        const mentionedBot = checkForBotMention(input);
        
        if (mentionedBot) {
            generateSingleBotResponse(input, mentionedBot);
        } else {
            generateSequentialResponse(input);
        }
        
        // Reset skip flag after setting up the new message responses
        // This ensures new typewriter animations will run normally
        setTimeout(() => setSkipTypewriter(false), 0);
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
            
            if (mentionedBot === 'bob') {
                promptText += `As the teacher (Bob), respond as follows:
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
            
            if (mentionedBot === 'bob') {
                fallbackText = "You're asking specifically about [key aspect of question]. Let me address that directly...";
            } else if (mentionedBot === 'concept') {
                fallbackText = "I think I can help with the calculation part of that. Let me work through the steps... though I'm not entirely sure about the conceptual reason behind this approach.";
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

    return (
        <div className="h-screen max-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4 flex flex-col overflow-hidden">
            {!hasSubmittedAnswer ? (
                // Before submission - show problem, answer input, and scratchpad as full width
                <div className="flex flex-col h-full max-h-full overflow-hidden">
                    {/* Problem Display with Timer */}
                    {currentQuestion && (
                        <div className="bg-white bg-opacity-20 p-4 rounded-md mb-4 border-2 border-purple-400">
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
                                disabled={
                                    !finalAnswer.trim() || !scratchboardContent.trim() || typingMessageIds.length > 0
                                }
                                className={`px-4 py-3 rounded-md text-lg font-medium ${
                                    finalAnswer.trim() &&
                                    scratchboardContent.trim() &&
                                    typingMessageIds.length === 0
                                        ? 'bg-blue-600 hover:bg-blue-700 text-white'
                                        : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                                }`}
                            >
                                Submit Final Answer
                            </button>
                        </div>
                    </div>

                    {/* Scratchboard */}
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
            ) : (
                // After submission - fix the two-panel layout
                <div className="flex flex-row h-full max-h-full overflow-hidden">
                    {/* LEFT PANEL - Problem and Submission */}
                    <div className="w-1/2 pr-2 flex flex-col h-full max-h-full overflow-hidden">
                        {/* Problem Display */}
                        {currentQuestion && (
                            <div className="bg-white bg-opacity-20 p-4 rounded-md mb-4 border-2 border-purple-400">
                                <div className="flex justify-between items-start mb-2">
                                    <h2 className="text-xl text-white font-semibold">Problem:</h2>
                                </div>
                                <p className="text-white text-lg">
                                    {formatMathExpression(getQuestionText(currentQuestion))}
                                </p>
                            </div>
                        )}

                        {/* Final Answer (read-only) */}
                        <div className="bg-white bg-opacity-15 rounded-md p-4 mb-4 border-2 border-blue-400">
                            <h3 className="text-xl text-white font-semibold mb-2">Your Final Answer</h3>
                            <div className="p-3 bg-white bg-opacity-10 text-white rounded-md">
                                {finalAnswer}
                            </div>
                        </div>

                        {/* Scratchboard (read-only) */}
                        <div className="flex-1 border border-gray-600 rounded-md p-3 bg-black bg-opacity-30 overflow-auto">
                            <div className="flex justify-between mb-2">
                                <h3 className="text-white font-semibold">Your Work</h3>
                            </div>
                            <div className="w-full h-[calc(100%-40px)] min-h-[200px] bg-black bg-opacity-40 text-white rounded p-2 overflow-auto whitespace-pre-wrap">
                                {scratchboardContent}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT PANEL - Chat */}
                    <div className="w-1/2 pl-2 flex flex-col h-full max-h-full overflow-hidden">
                        {/* Header */}
                        <div className="bg-black bg-opacity-30 p-2">
                            <div className="flex space-x-3">
                                {agents.map((agent) => (
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

                        {/* Chat messages container */}
                        <div
                            className="flex-1 bg-white bg-opacity-10 rounded-md overflow-y-auto overflow-x-hidden p-2"
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
                                                    '/logic_avatar.png'
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
                                                {agents.find((a) => a.id === msg.agentId)?.name || 'AI'}
                                            </div>
                                        )}

                                        {typingMessageIds.includes(msg.id) ? (
                                            <TypewriterTextWrapper
                                                key={`typewriter-message-${msg.id}`}
                                                text={typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)}
                                                speed={20}
                                                messageId={msg.id}
                                                skip={skipTypewriter} // Add this prop
                                                onTypingProgress={(progress) => {
                                                    if (!userHasScrolledRef.current && !manualScrollOverrideRef.current) {
                                                        scrollToBottom();
                                                    }
                                                }}
                                                onTypingComplete={() => {
                                                    setTypingMessageIds(prev => prev.filter(id => id !== msg.id));
                                                    setCompletedMessageIds(prev => [...prev, msg.id]);

                                                    if (msg.onComplete) {
                                                        msg.onComplete();
                                                    }

                                                    if (!userHasScrolledRef.current && !manualScrollOverrideRef.current) {
                                                        scrollToBottom();
                                                    }
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
                        </div>

                        {/* Footer / Chat input */}
                        <div className="bg-black bg-opacity-30 border-t border-gray-700 p-2">
                            <div className="flex space-x-2">
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
                                <button
                                    onClick={completeLesson}
                                    className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-md"
                                >
                                    Skip
                                </button>
                            </div>

                            {evaluationComplete && (
                                <div className="flex justify-end p-2 mt-2">
                                    <button
                                        onClick={completeLesson}
                                        className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md"
                                    >
                                        Proceed
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