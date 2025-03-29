'use client'

import { useState, useEffect, useRef } from 'react';
import { useFlow } from '@/context/FlowContext';
import Image from 'next/image';
import { Message } from '@/utils/types';
import TypewriterTextWrapper from '@/components/TypewriterTextWrapper';
import { aiService, AI_MODELS } from '@/services/AI';

// Define the question type to include multiple choice options
interface Question {
    id: number;
    question: string;
    options?: Record<string, string>; // A, B, C, D options
    answer: string;
    correctAnswer?: string;
}

// Ensure proper question text helper function at the top
const getQuestionText = (question: any): string => {
    if (typeof question === 'string') return question;
    if (question && typeof question === 'object' && question.question) return question.question;
    return JSON.stringify(question);
};

export default function SinglePage() {
    const { completeLesson, lessonQuestionIndex, currentStage } = useFlow();
    
    // Debug line to see what's happening
    console.log("SINGLE PAGE - Current stage:", currentStage, "Question index:", lessonQuestionIndex);
    
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
    
    // State management with proper typing
    const [messages, setMessages] = useState<Message[]>([]);
    const [completedMessageIds, setCompletedMessageIds] = useState<number[]>([]);
    const [scratchboardContent, setScratchboardContent] = useState('');
    const [input, setInput] = useState('');
    const [finalAnswer, setFinalAnswer] = useState('');
    const [selectedOption, setSelectedOption] = useState<string>('');
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const [nextMessageId, setNextMessageId] = useState(3);
    const [typingMessageIds, setTypingMessageIds] = useState<number[]>([]);
    const [isQuestioningEnabled, setIsQuestioningEnabled] = useState(true);
    const [timeLeft, setTimeLeft] = useState(120); // 2 minutes
    const [evaluationComplete, setEvaluationComplete] = useState(false);
    const [userHasScrolled, setUserHasScrolled] = useState(false);
    const nextMessageIdRef = useRef(3); // Start at 3 like your current state
    
    // AI Service initialization
    const [currentModel] = useState(AI_MODELS.CLAUDE_HAIKU.id);
    
    // Timer functionality
    useEffect(() => {
        if (timeLeft > 0 && isQuestioningEnabled) {
            const timerId = setTimeout(() => {
                setTimeLeft(timeLeft - 1);
            }, 1000);
            return () => clearTimeout(timerId);
        } else if (timeLeft === 0 && isQuestioningEnabled) {
            setIsQuestioningEnabled(false);
            generateEvaluation();
        }
    }, [timeLeft, isQuestioningEnabled]);
    
    // Format time display
    const formatTime = (seconds: number) => {
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
    };
    
    // Scroll handling
    const handleScroll = () => {
        if (chatContainerRef.current) {
            const { scrollTop, scrollHeight, clientHeight } = chatContainerRef.current;
            const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
            setUserHasScrolled(!isAtBottom);
        }
    };
    
    // Scroll to bottom of chat
    const scrollToBottom = () => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    };
    
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
                        
                        // Start conversation after question loads
                        setTimeout(() => {
                            startConversation(data.questions[lessonQuestionIndex]);
                        }, 500);
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
    
    // Start the conversation with Bob's introduction
    const startConversation = (question: Question) => {
        // Use getUniqueMessageId instead of hardcoded ID
        const bobIntroId = getUniqueMessageId();
        
        const bobIntroMessage = {
            id: bobIntroId,
            sender: 'ai',
            text: `Welcome to our one-on-one lesson! Today we'll be working on this problem:\n\n${question.question}\n\nTake your time to understand it, and feel free to ask me questions as you work through it.`,
            agentId: 'bob',
            timestamp: new Date().toISOString(),
            onComplete: () => {
                console.log("Bob's intro completed");
            }
        };
        
        setMessages([bobIntroMessage]);
        setTypingMessageIds([bobIntroId]);  
    };
    
    // Handle user question submission
    const handleUserQuestion = async () => {
        if (!input.trim() || typingMessageIds.length > 0) return;
        
        const messageId = getUniqueMessageId();
        
        // Add user message
        const userMessage = {
            id: messageId,
            sender: 'user',
            text: input,
            timestamp: new Date().toISOString()
        };
        
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        
        // Generate Bob's response
        await generateTeacherResponse(userMessage.text);
    };
    
    // Generate teacher (Bob) response
    const generateTeacherResponse = async (userMessage: string) => {
        const messageId = getUniqueMessageId();
        
        // Add placeholder message
        const teacherMessage = {
            id: messageId,
            sender: 'ai',
            text: 'Thinking...',
            agentId: 'bob',
            timestamp: new Date().toISOString()
        };
        
        setMessages(prev => [...prev, teacherMessage]);
        setTypingMessageIds(prev => [...prev, messageId]);
        
        try {
            // Convert question to string if needed
            const questionText = getQuestionText(currentQuestion);
            
            console.log(`Generating teacher response with problem context: ${questionText}`);
            
            // Generate Bob's response
            const response = await aiService.generateResponse(
                [
                    {
                        id: 1,
                        sender: 'user',
                        text: `Problem: ${questionText}\n\nStudent asked/commented: "${userMessage}"\n\nAs the teacher, provide a thoughtful but brief response that guides without giving away the solution. Acknowledge good insights or gently redirect if needed.`
                    }
                ],
                {
                    systemPrompt: "You are Bob, a knowledgeable math tutor who guides students through problem-solving with a patient, encouraging approach. You help students develop their own solutions rather than giving answers directly.",
                    model: currentModel
                }
            );
            
            // Ensure response is a string
            const stringResponse = typeof response === 'string' ? response : JSON.stringify(response);
            
            // Update message with response
            setMessages(prev =>
                prev.map(msg =>
                    msg.id === messageId
                        ? {
                              ...msg,
                              text: stringResponse,
                              timestamp: new Date().toISOString()
                          }
                        : msg
                )
            );
        } catch (error) {
            console.error("Error generating teacher response:", error);
            
            // Update with error message
            setMessages(prev =>
                prev.map(msg =>
                    msg.id === messageId
                        ? {
                              ...msg,
                              text: "I'm sorry, I had trouble processing that. Let's try a different approach to solving this problem.",
                              timestamp: new Date().toISOString()
                          }
                        : msg
                )
            );
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

    // Update the generateEvaluation function to show the exact answer from questions.json
    const generateEvaluation = async () => {
        const messageId = getUniqueMessageId();
        
        // Add system message
        const timeUpMessage = {
            id: messageId,
            sender: 'system',
            text: "Let's review your solution.",
            timestamp: new Date().toISOString()
        };
        
        setMessages(prev => [...prev, timeUpMessage]);
        
        // Add the official answer from questions.json first
        const officialAnswerMessageId = getUniqueMessageId();
        
        // Get the answer directly from the question object
        const officialAnswer = currentQuestion?.answer || "";
        
        const officialAnswerMessage = {
            id: officialAnswerMessageId,
            sender: 'system',
            text: `The correct answer is: ${officialAnswer}`,
            timestamp: new Date().toISOString()
        };
        
        setMessages(prev => [...prev, officialAnswerMessage]);
        
        // Then add teacher evaluation message placeholder
        const evaluationMessageId = getUniqueMessageId();
        
        const evaluationMessage = {
            id: evaluationMessageId,
            sender: 'ai',
            text: 'Evaluating your solution...',
            agentId: 'bob',
            timestamp: new Date().toISOString()
        };
        
        setMessages(prev => [...prev, evaluationMessage]);
        setTypingMessageIds(prev => [...prev, evaluationMessageId]);
        
        try {
            // Use the exact answer from questions.json for evaluation
            const correctAnswer = currentQuestion?.answer || "";
            
            // Get selected answer text
            const selectedAnswerText = currentQuestion?.options?.[selectedOption] || selectedOption;
            const finalAnswerText = finalAnswer.trim();
            
            // Determine what answer to evaluate - either selected option or free text
            const studentAnswer = selectedOption || finalAnswerText || "No answer provided";
            
            // Generate evaluation
            const questionText = getQuestionText(currentQuestion);
                
            const response = await aiService.generateResponse(
                [
                    {
                        id: 1,
                        sender: 'user',
                        text: `Problem: ${questionText}
                        
Student's answer: "${studentAnswer}"${selectedAnswerText && selectedAnswerText !== studentAnswer ? ` (${selectedAnswerText})` : ''}

Student's work/notes: ${scratchboardContent || "(No work shown)"}

The correct answer is: "${correctAnswer}"

As the teacher, provide a detailed evaluation of the student's answer. Compare their answer to the correct answer.
- If correct: Explain why their answer is correct and praise any good reasoning shown
- If incorrect: Explain exactly where they went wrong and provide the correct solution approach
- Don't just assume the answer is correct - carefully check it against the correct answer provided

Be specific about what was right or wrong in their answer.`
                    }
                ],
                {
                    systemPrompt: "You are Bob, a thorough math tutor who carefully evaluates student work. Your evaluations must be accurate - if a student's answer doesn't match the correct answer, you must identify this and explain the correct solution.",
                    model: currentModel
                }
            );
            
            // Ensure response is a string
            const stringResponse = typeof response === 'string' ? response : JSON.stringify(response);
            
            // Update message with evaluation
            setMessages(prev =>
                prev.map(msg =>
                    msg.id === evaluationMessageId
                        ? {
                              ...msg,
                              text: stringResponse,
                              timestamp: new Date().toISOString(),
                              onComplete: () => {
                                  console.log("Evaluation complete, setting state to true");
                                  setEvaluationComplete(true);
                              }
                          }
                        : msg
                )
            );
            
            // IMPORTANT: Make sure the typing ID gets added
            setTypingMessageIds(prev => [...prev, evaluationMessageId]);
        } catch (error) {
            console.error("Error generating evaluation:", error);
            
            // Update with error message and still enable the Proceed button
            setMessages(prev =>
                prev.map(msg =>
                    msg.id === evaluationMessageId
                        ? {
                              ...msg,
                              text: "I'm having trouble evaluating your answer right now. Let's move on to the next part of the lesson.",
                              timestamp: new Date().toISOString(),
                              onComplete: () => {
                                  console.log("Evaluation complete (error case), setting state to true");
                                  setEvaluationComplete(true);
                              }
                          }
                        : msg
                )
            );
            
            // IMPORTANT: Make sure the typing ID gets added even in error case
            setTypingMessageIds(prev => [...prev, evaluationMessageId]);
        }
    };

    // Handle option selection
    const handleOptionSelect = (option: string) => {
        setSelectedOption(option);
        setFinalAnswer(option);
    };
    
    // Handle enter key press in input
    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleUserQuestion();
        }
    };
    
    // Updated handleSend function - relaxed requirements like in multi page
    const handleSend = () => {
        // Only require scratchboard content, not final answer
        if (!scratchboardContent.trim() || typingMessageIds.length > 0) return;

        // Record user activity time
        const now = new Date().toISOString();

        ensureNoTypingInProgress(() => {
            // Use whatever final answer they have, even if empty
            const submissionText = finalAnswer.trim() || "No answer specified";
            
            const userFinalAnswer: Message = {
                id: getUniqueMessageId(),
                sender: 'user',
                text: `My final answer is: ${submissionText}\n\nMy reasoning:\n${scratchboardContent}`,
                timestamp: now
            };
            
            setMessages(prev => [...prev, userFinalAnswer]);
            setFinalAnswer('');

            // Force scroll to bottom when user submits final answer
            setTimeout(() => scrollToBottom(), 50);

            // Don't clear scratchboard to allow review
            // Disable further questioning
            setIsQuestioningEnabled(false);

            // Generate evaluation
            generateEvaluation();
        });
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

    // If question hasn't loaded yet
    if (!currentQuestion) {
        return (
            <div className="flex flex-col h-screen justify-center items-center bg-gray-900 text-white">
                <div className="text-2xl">Loading question...</div>
            </div>
        );
    }

    return (
        <div className="h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4 flex flex-row overflow-hidden">
            {/* LEFT PANEL - Problem, Final Answer, Scratchboard */}
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
                        <p className="text-white text-lg">{currentQuestion.question}</p>
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
                                        <span>{value}</span>
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
                        
                        {/* Submit button - Now in final answer section like MultiPage */}
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
                    </div>
                </div>

                {/* Scratchboard - Below final answer with matching styling */}
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

                    {/* Chat input (for questions only) */}
                    {isQuestioningEnabled && (
                        <div className="p-3 bg-black bg-opacity-30">
                            <div className="flex space-x-2">
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
                            </div>
                        </div>
                    )}

                    {/* Proceed button (when time's up) */}
                    {!isQuestioningEnabled && evaluationComplete && (
                        <div className="p-3 bg-black bg-opacity-30 flex justify-center">
                            <button
                                onClick={completeLesson} // Directly call completeLesson instead of handleFinishLesson
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