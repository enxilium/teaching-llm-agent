'use client'

import { useState, useEffect, useRef } from 'react';
import { useFlow } from '@/context/FlowContext';
import Image from 'next/image';
import { Message } from '@/utils/types';
import TypewriterTextWrapper from '@/components/TypewriterTextWrapper';
import { aiService, AI_MODELS } from '@/services/AI';
import 'katex/dist/katex.min.css';
import { InlineMath, BlockMath } from 'react-katex';

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

// Helper function to format time as MM:SS
const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
};

export default function SinglePage() {
    const { completeLesson, lessonQuestionIndex, currentStage } = useFlow();
    
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
    const [currentModel] = useState(AI_MODELS.CLAUDE_HAIKU.id);
    
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
    
    // Function to handle option selection for multiple choice questions
    const handleOptionSelect = (option: string) => {
        setSelectedOption(option);
        setFinalAnswer(option);
    };
    
    // Handle key presses in the chat input
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleUserQuestion();
        }
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
                console.log('Updating localStorage to match current page (lesson)');
                localStorage.setItem('currentStage', 'lesson');
            }
        }
    }, [currentStage]);
    
    // Load the specific question based on lessonQuestionIndex
    useEffect(() => {
        const fetchQuestion = async () => {
            try {
                const response = await fetch('/questions.json');
                if (response.ok) {
                    const data = await response.json();
                    // Use lessonQuestionIndex to select the question
                    if (data.questions && data.questions.length > lessonQuestionIndex) {
                        setCurrentQuestion(data.questions[lessonQuestionIndex]);
                        console.log("Loaded question:", data.questions[lessonQuestionIndex]);
                    } else {
                        console.error("Question index out of bounds:", lessonQuestionIndex);
                    }
                }
            } catch (error) {
                console.error("Error fetching question:", error);
            }
        };
        
        fetchQuestion();
    }, [lessonQuestionIndex]);
    
    // Timer functionality
    useEffect(() => {
        if (timeLeft > 0 && !hasSubmittedAnswer) {
            const timerId = setTimeout(() => {
                setTimeLeft(timeLeft - 1);
            }, 1000);
            return () => clearTimeout(timerId);
        } else if (timeLeft === 0 && !hasSubmittedAnswer) {
            // Time's up, handle like a submission with no answer
            handleTimeExpired();
        }
    }, [timeLeft, hasSubmittedAnswer]);
    
    // --- AI INTERACTION FUNCTIONS ---
    // Update Bob's system prompt
    const bobPrompt = `You are a supportive math tutor. Your role is to guide the student toward a correct and deep understanding of the solution process, rather than simply providing the final answer.
Context & Instructions:
1. Maintain a friendly, encouraging tone.
2. In your first response, indicate whether the student's answer is correct or incorrect.
3. Follow that with an explanation or helpful feedback.
4. End this initial response by asking a question to check if your explanation is clear.
5. Acknowledge correct reasoning or partial steps.
6. Ask clarifying or probing questions as needed.
7. Provide step-by-step hints if needed, but avoid giving the full solution immediately.
8. Emphasize that mistakes are normal and useful for learning.
9. Encourage the student to reflect on their approach and restate the solution in their own words.
Parameters:
- Question: {question}
- Student answer: {student_answer}
- Scratch pad (optional): {scratch_pad}
Your goal is to:
- Begin by stating if the student's answer is correct or not.
- Provide a brief explanation or guidance.
- End with a question like "Does this make sense?" or "Is that clear?"`;

    // Modify startConversation function to work with student-first approach
    const startConversation = (question: Question, studentAnswer: string, scratchpad: string) => {
        const bobIntroId = getUniqueMessageId();
        
        const bobIntroMessage = {
            id: bobIntroId,
            sender: 'ai',
            text: "I've reviewed your answer. Let me provide some feedback...",
            agentId: 'bob',
            timestamp: new Date().toISOString(),
            onComplete: () => {
                generateInitialFeedback(question, studentAnswer, scratchpad);
            }
        };
        
        setMessages([bobIntroMessage]);
        setTypingMessageIds([bobIntroId]);
    };
    
    // Add new function to generate initial feedback
    const generateInitialFeedback = async (question: Question, studentAnswer: string, scratchpad: string) => {
        const messageId = getUniqueMessageId();
        
        // Add placeholder message
        const feedbackMessage = {
            id: messageId,
            sender: 'ai',
            text: 'Analyzing your answer...',
            agentId: 'bob',
            timestamp: new Date().toISOString()
        };
        
        setMessages(prev => [...prev, feedbackMessage]);
        setTypingMessageIds(prev => [...prev, messageId]);
        
        try {
            // Convert question to string
            const questionText = getQuestionText(question);
            
            // Generate Bob's feedback
            const response = await aiService.generateResponse(
                [
                    {
                        id: 1,
                        sender: 'user',
                        text: `Question: ${questionText}\nStudent answer: ${studentAnswer}\nScratch pad: ${scratchpad}`
                    }
                ],
                {
                    systemPrompt: bobPrompt.replace('{question}', questionText)
                                          .replace('{student_answer}', studentAnswer)
                                          .replace('{scratch_pad}', scratchpad),
                    model: currentModel
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
        } catch (error) {
            console.error("Error generating initial feedback:", error);
            // Handle error
            setMessages(prev =>
                prev.map(msg =>
                    msg.id === messageId
                        ? { 
                            ...msg, 
                            text: "I'm having trouble analyzing your answer right now. Let's discuss your approach in more detail.", 
                            timestamp: new Date().toISOString() 
                          }
                        : msg
                )
            );
        }
    };
    
    // Add new function to handle when time expires
    const handleTimeExpired = () => {
        // Record time expiration
        const now = new Date().toISOString();
        
        // Create message about not submitting an answer
        const userTimeoutMessage: Message = {
            id: getUniqueMessageId(),
            sender: 'user',
            text: `I didn't submit an answer before the time expired.\n\nMy incomplete work:\n${scratchboardContent}`,
            timestamp: now
        };
        
        // Update UI states
        setMessages([userTimeoutMessage]);
        setHasSubmittedAnswer(true); // Show the chat interface
        
        // Start conversation with Bob, informing him the user didn't provide an answer
        startTimeoutConversation(currentQuestion!, scratchboardContent);
    };
    
    // Add function to start conversation when time expires
    const startTimeoutConversation = (question: Question, scratchpad: string) => {
        const bobIntroId = getUniqueMessageId();
        
        const bobIntroMessage = {
            id: bobIntroId,
            sender: 'ai',
            text: "I see you didn't have time to complete your answer. That's okay, let's work through this together...",
            agentId: 'bob',
            timestamp: new Date().toISOString(),
            onComplete: () => {
                generateTimeoutFeedback(question, scratchpad);
            }
        };
        
        setMessages(prev => [...prev, bobIntroMessage]);
        setTypingMessageIds([bobIntroId]);
    };

    // Add function to generate feedback when time expires
    const generateTimeoutFeedback = async (question: Question, scratchpad: string) => {
        const messageId = getUniqueMessageId();
        
        // Add placeholder message
        const feedbackMessage = {
            id: messageId,
            sender: 'ai',
            text: 'Analyzing your work...',
            agentId: 'bob',
            timestamp: new Date().toISOString()
        };
        
        setMessages(prev => [...prev, feedbackMessage]);
        setTypingMessageIds(prev => [...prev, messageId]);
        
        try {
            // Convert question to string
            const questionText = getQuestionText(question);
            
            // Generate Bob's feedback
            const response = await aiService.generateResponse(
                [
                    {
                        id: 1,
                        sender: 'user',
                        text: `Question: ${questionText}\nStudent didn't submit an answer before time expired.\nTheir incomplete work: ${scratchpad}`
                    }
                ],
                {
                    systemPrompt: `You are a supportive math tutor. The student ran out of time and didn't submit a final answer.
                        Context & Instructions:
                        1. Maintain a friendly, encouraging tone.
                        2. Acknowledge that running out of time is common and not a problem.
                        3. Review what they did manage to work on in their scratchpad.
                        4. Provide a clear step-by-step explanation of how to solve the problem.
                        5. Ask if they have any questions about the solution.
                        6. Emphasize the key concepts needed for this type of problem.
                        
                        Question: ${questionText}
                        Student scratchpad: ${scratchpad}
                        
                        Your goal is to:
                        - Be encouraging and supportive
                        - Explain the full solution clearly
                        - Highlight key concepts they should understand`,
                    model: currentModel
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
        } catch (error) {
            console.error("Error generating timeout feedback:", error);
            // Handle error
            setMessages(prev =>
                prev.map(msg =>
                    msg.id === messageId
                        ? { 
                            ...msg, 
                            text: "Let me help you with this problem. It looks like you ran out of time, which happens to everyone. Let's walk through the solution together.", 
                            timestamp: new Date().toISOString() 
                          }
                        : msg
                )
            );
        }
    };
    
    // Function to handle user asking a question to Bob
    const handleUserQuestion = () => {
        if (!input.trim() || typingMessageIds.length > 0) return;

        const userMessageId = getUniqueMessageId();
        const bobResponseId = getUniqueMessageId();

        // Add user message
        const userMessage: Message = {
            id: userMessageId,
            sender: 'user',
            text: input,
            timestamp: new Date().toISOString()
        };

        // Add placeholder for Bob's response
        const bobPlaceholder: Message = {
            id: bobResponseId,
            sender: 'ai',
            agentId: 'bob',
            text: '...',
            timestamp: new Date().toISOString()
        };

        // Update the message list
        setMessages(prev => [...prev, userMessage, bobPlaceholder]);
        setTypingMessageIds(prev => [...prev, bobResponseId]);
        setInput(''); // Clear input field

        // Generate Bob's response
        setTimeout(() => generateBobResponse(bobResponseId, input), 100);
    };
    
    // Function to generate Bob's response to a user question
    const generateBobResponse = async (messageId: number, userQuestion: string) => {
        try {
            // Format all previous messages for context
            const formattedMessages = messages.map(msg => ({
                id: msg.id,
                sender: msg.sender,
                text: typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)
            }));

            // Add the latest user question
            formattedMessages.push({
                id: formattedMessages.length + 1,
                sender: 'user',
                text: userQuestion
            });

            // Get the final answer from the messages if it exists
            const userFinalAnswer = messages.find(msg => 
                msg.sender === 'user' && 
                typeof msg.text === 'string' && 
                msg.text.startsWith('My final answer is:')
            );

            // Format the question for context
            const questionText = getQuestionText(currentQuestion);
            
            // Generate response from AI service
            const response = await aiService.generateResponse(
                formattedMessages,
                {
                    systemPrompt: `You are Bob, a supportive math tutor helping a student with the problem: ${questionText}
                    ${userFinalAnswer ? `The student's answer was: ${userFinalAnswer.text}` : ''}
                    Respond to their question in a clear, helpful way. Give guidance but avoid giving the full solution immediately.
                    Use LaTeX notation for math expressions: $...$ format.`,
                    model: currentModel
                }
            );

            // Update the message with the response
            setMessages(prev => prev.map(msg => 
                msg.id === messageId 
                    ? { ...msg, text: response, timestamp: new Date().toISOString() } 
                    : msg
            ));

        } catch (error) {
            console.error("Error generating Bob's response:", error);
            
            // Provide a fallback response
            setMessages(prev => prev.map(msg => 
                msg.id === messageId 
                    ? { ...msg, text: "I'm having trouble processing your question. Could you rephrase it?", timestamp: new Date().toISOString() } 
                    : msg
            ));
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

        // Record user activity time
        const now = new Date().toISOString();

        ensureNoTypingInProgress(() => {
            // Use whatever final answer they have, even if empty
            const submissionText = finalAnswer.trim() || selectedOption || "No answer specified";
            
            const userFinalAnswer: Message = {
                id: getUniqueMessageId(),
                sender: 'user',
                text: `My final answer is: ${submissionText}\n\nMy reasoning:\n${scratchboardContent}`,
                timestamp: now
            };
            
            setMessages([userFinalAnswer]); // Start with just the user's answer
            setIsQuestioningEnabled(true); // Enable questioning
            setHasSubmittedAnswer(true); // Mark that the answer has been submitted
            
            // Start conversation with Bob after submission
            startConversation(
                currentQuestion!, 
                submissionText, 
                scratchboardContent
            );
        });
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
        <div className="h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4 flex flex-row overflow-hidden">
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
                <div className="w-1/2 pl-2 flex flex-col h-full">
                    <div className="flex-1 bg-white bg-opacity-10 rounded-md flex flex-col overflow-hidden">
                        {/* Agent info (just Bob) - Added to match MultiPage */}
                        <div className="bg-black bg-opacity-30 p-2">
                            <div className="flex space-x-3">
                                <div className="flex items-center">
                                    <Image
                                        src="/bob_avatar.svg"
                                        alt="Bob"
                                        width={40}
                                        height={40}
                                        className="rounded-full border-2 border-white"
                                    />
                                    <span className="text-xs text-white ml-2">Bob</span>
                                </div>
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
                                    className={`mb-4 flex ${
                                        msg.sender === 'user' ? 'justify-end' : 'justify-start'
                                    }`}
                                >
                                    {msg.sender === 'ai' && (
                                        <div className="mr-2 flex-shrink-0">
                                            <Image
                                                src="/bob_avatar.svg"
                                                alt="Bob"
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
                                                Bob
                                            </div>
                                        )}
                                        
                                        {typingMessageIds.includes(msg.id) ? (
                                            <TypewriterTextWrapper
                                                key={`typewriter-message-${msg.id}`}
                                                text={typeof msg.text === 'string' ? msg.text : JSON.stringify(msg.text)}
                                                speed={20}
                                                messageId={msg.id}
                                                onTypingProgress={() => {
                                                    if (!userHasScrolled) {
                                                        scrollToBottom();
                                                    }
                                                }}
                                                onTypingComplete={() => {
                                                    setTypingMessageIds(prev => prev.filter(id => id !== msg.id));
                                                    setCompletedMessageIds(prev => [...prev, msg.id]);
                                                    
                                                    if (msg.onComplete) {
                                                        msg.onComplete();
                                                    }
                                                    
                                                    if (!userHasScrolled) {
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
                            <div key="messages-end" />
                        </div>

                        {/* Chat interface footer with input or proceed button */}
                        <div className="p-3 bg-black bg-opacity-30 flex justify-between items-center">
                            {/* Left side - Chat input if questioning is enabled */}
                            <div className={isQuestioningEnabled ? "flex-1 flex space-x-2" : "hidden"}>
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    placeholder="Ask Bob about the problem..."
                                    className="flex-1 bg-white bg-opacity-10 text-white border border-gray-700 rounded-md px-3 py-2"
                                    onKeyDown={handleKeyDown}
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
                                    className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md ml-auto"
                                >
                                    {isQuestioningEnabled ? "Skip" : "Proceed"}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}