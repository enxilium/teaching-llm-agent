'use client'

import TypewriterText from "@/components/TypewriterText";
import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { Message } from "@/utils/types";
// Add to imports in page.tsx
import { aiService, AI_MODELS, DEFAULT_MODEL } from '@/services/AI';
import { useRouter } from 'next/navigation';

export default function Home() {
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [questionInput, setQuestionInput] = useState("");
  const [scratchboardContent, setScratchboardContent] = useState("");
  const [usedQuestionIndices, setUsedQuestionIndices] = useState<number[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number | null>(null);
  const [isQuestioningEnabled, setIsQuestioningEnabled] = useState(true);
  const [timeLeft, setTimeLeft] = useState(120); // 2 minutes
  const [nextMessageId, setNextMessageId] = useState(3); // IDs 1 and 2 are used initially
  const [typingMessageIds, setTypingMessageIds] = useState<number[]>([]);
  const [evaluationComplete, setEvaluationComplete] = useState(false);
  const [currentModel, setCurrentModel] = useState<string>(DEFAULT_MODEL.id);

  // Add provider filter state for UI
  const [selectedProvider, setSelectedProvider] = useState<string>('all');
  const router = useRouter();

  const timerInitializedRef = useRef(false);
  const roundEndedRef = useRef(false);

  const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  // Function to load a new round: clears chat, fetches a new problem, resets timer and state.
  const startNewRound = async () => {
    try {
      const response = await fetch('questions.json');
      const data = await response.json();
      const combinatoricsQuestions = data.combinatorics;

      // Reset used indices if necessary
      let availableIndices = Array.from({ length: combinatoricsQuestions.length }, (_, i) => i)
        .filter(index => !usedQuestionIndices.includes(index));
      // Check if we've used all questions
      if (availableIndices.length === 0) {
        // All questions have been used, redirect to break screen
        router.push('/break');
        return; // Stop execution here
      }

      const randomIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
      setCurrentQuestionIndex(randomIndex);
      setUsedQuestionIndices(prev => [...prev, randomIndex]);

      // Clear previous messages and set new initial messages
      setMessages([
        {
          id: 1,
          sender: "ai",
          text: "Welcome! Let's solve this combinatorics problem. You have 2 minutes to ask questions, then submit your final answer. Please show your reasoning in the scratchboard before submitting."
        },
        {
          id: 2,
          sender: "ai",
          text: combinatoricsQuestions[randomIndex]
        }
      ]);
      // Reset message id counter if desired (or continue incrementing)
      setNextMessageId(3);
    } catch (error) {
      console.error("Error fetching question:", error);
    }
    // Reset timer and enable interactions for the new round
    setTimeLeft(120);
    setIsQuestioningEnabled(true);
    roundEndedRef.current = false;

    setScratchboardContent("");
    setInput("");
  };

  // Initial load – start new round on mount
  useEffect(() => {
    startNewRound();
  }, []); // run once on mount

  // Timer effect – runs continuously via one interval
  useEffect(() => {
    if (timerInitializedRef.current) return;
    timerInitializedRef.current = true;

    const countdownInterval = setInterval(() => {
      setTimeLeft(prevTime => {
        if (prevTime <= 0) {
          // End current round if not already ended
          if (!roundEndedRef.current) {
            setIsQuestioningEnabled(false);
            roundEndedRef.current = true;
            // Start a new round
            startNewRound();
          }
          return 0;
        }
        return prevTime - 1;
      });
    }, 1000);

    return () => clearInterval(countdownInterval);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleQuestion = async () => {
    if (!questionInput.trim() || !isQuestioningEnabled) return;

    const userMessageId = nextMessageId;
    const aiMessageId = nextMessageId + 1;
    setNextMessageId(prev => prev + 2);

    // Add user message immediately
    setMessages(prev => [
      ...prev,
      {
        id: userMessageId,
        sender: "user",
        text: questionInput.trim()
      }
    ]);
    setQuestionInput("");
    scrollToBottom();

    // Add placeholder for AI response with typing indicator
    setTypingMessageIds(prev => [...prev, aiMessageId]);
    setMessages(prev => [
      ...prev,
      {
        id: aiMessageId,
        sender: "ai",
        text: "..." // Placeholder text
      }
    ]);

    try {
      const newMessage: Message = {
        id: userMessageId,
        sender: "user",
        text: questionInput.trim()
      };
      const updatedMessages = [...messages, newMessage];

      // Call AI service (works with any provider)
      const aiResponse = await aiService.generateResponse(updatedMessages, {
        systemPrompt: "You are a helpful teaching assistant named Bob who helps students with mathematics problems. Be encouraging and provide hints rather than full answers.",
        model: currentModel
      });

      // Update the AI message with the response
      setMessages(prev =>
        prev.map(msg =>
          msg.id === aiMessageId
            ? { ...msg, text: aiResponse }
            : msg
        )
      );
    } catch (error) {
      console.error("Error getting AI response:", error);

      // Update with error message
      setMessages(prev =>
        prev.map(msg =>
          msg.id === aiMessageId
            ? { ...msg, text: "I'm sorry, I encountered an error. Please try again." }
            : msg
        )
      );
    }
  };

  const handleSend = async () => {
    if (!input.trim() || !isQuestioningEnabled) return;
    if (!scratchboardContent.trim()) {
      alert("Please use the scratchboard to show your reasoning before submitting your answer.");
      return;
    }

    const userMessageId = nextMessageId;
    const aiMessageId = nextMessageId + 1;
    setNextMessageId(prev => prev + 2);

    const userFinalAnswer = `Final Answer: ${input.trim()}\n\nReasoning: ${scratchboardContent}`;

    // Add user message immediately
    setMessages(prev => [
      ...prev,
      {
        id: userMessageId,
        sender: "user",
        text: userFinalAnswer
      }
    ]);
    setInput("");
    scrollToBottom();

    // Add placeholder for AI response with typing indicator
    setTypingMessageIds(prev => [...prev, aiMessageId]);
    setMessages(prev => [
      ...prev,
      {
        id: aiMessageId,
        sender: "ai",
        text: "..." // Placeholder text
      }
    ]);

    try {
      const newMessage: Message = {
        id: userMessageId,
        sender: "user",
        text: userFinalAnswer
      };
      const updatedMessages = [...messages, newMessage];

      // Enhance the system prompt for final answer evaluation
      const evaluationPrompt = "You are a helpful teaching assistant named Bob who helps students with mathematics problems. The student has submitted their final answer. Evaluate it thoroughly, explaining what's correct and what could be improved.";

      // Call AI service (works with any provider)
      const aiResponse = await aiService.generateResponse(updatedMessages, {
        systemPrompt: evaluationPrompt,
        model: currentModel
      });

      // Update the AI message with the response
      setMessages(prev =>
        prev.map(msg =>
          msg.id === aiMessageId
            ? {
              ...msg,
              text: aiResponse,
              // Mark evaluation as complete when typing finishes
              onComplete: () => {
                setEvaluationComplete(true);
              }
            }
            : msg
        )
      );

      // End the current round
      setIsQuestioningEnabled(false);

    } catch (error) {
      console.error("Error getting AI response:", error);

      // Update with error message
      setMessages(prev =>
        prev.map(msg =>
          msg.id === aiMessageId
            ? { ...msg, text: "I'm sorry, I encountered an error evaluating your answer. Please try again." }
            : msg
        )
      );
    }
  };

  // Add this function to handle moving to next question
  const handleNextQuestion = () => {
    setEvaluationComplete(false);
    startNewRound();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    console.log(nextMessageId);
    if (e.key === "Enter") {
      if (e.currentTarget.name === "question") {
        handleQuestion();
      } else if (isQuestioningEnabled && scratchboardContent.trim()) {
        handleSend();
      }
    }
  };

  return (
    <div className="bg-gradient-to-b from-[#2D0278] to-[#0A001D] h-screen w-screen p-8 overflow-hidden flex flex-col">
      <div className="h-full flex flex-col">
        {/* Title Section */}
        <div className="p-4 mb-4">
          <div className="bg-white bg-opacity-10 rounded-md p-4">
            <h2 className="text-2xl text-white font-bold mb-2">
              Solve the Following:
            </h2>
            <p className="text-white break-words">
              {currentQuestionIndex !== null && messages[1]?.text}
            </p>
          </div>
        </div>

        {/* Blackboard Section */}
        <div className="flex-1 flex items-center justify-center pb-8 relative">
          <div className="bg-secondary border-[#210651] border-[1em] w-full h-full rounded-xl mx-16 relative">
            {/* Timer */}
            <div className={`absolute top-4 right-4 px-4 py-2 rounded-full ${timeLeft <= 30 ? 'bg-red-500' : 'bg-blue-500'} text-white font-mono text-xl z-10 flex items-center gap-2`}>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              {formatTime(timeLeft)}
            </div>

            {/* Chat Area */}
            <div className="absolute inset-0 p-8 mt-16 mb-24 mx-8 flex flex-col">
              <div
                ref={chatContainerRef}
                className="flex-1 overflow-y-auto space-y-4 mb-4"
              >
                {messages.map((msg) => (
                  <div key={`msg-${msg.id}`} className={`flex ${msg.sender === "ai" ? "flex-row" : "flex-row-reverse"} items-start`}>
                    {msg.sender === "ai" && (
                      <Image
                        src={"bob_avatar.svg"}
                        alt="AI Avatar"
                        width={75}
                        height={75}
                        className="rounded-full mr-2"
                      />
                    )}
                    <div className={`max-w-[70%] p-3 rounded-lg ${msg.sender === "ai" ? "bg-gray-200 text-gray-800" : "bg-blue-500 text-white"
                      }`}>
                      {msg.sender === "ai" && typingMessageIds.includes(msg.id) && msg.text === "..." ? (
                        <div className="flex items-center space-x-2">
                          <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                        </div>
                      ) : msg.sender === "ai" && typingMessageIds.includes(msg.id) ? (
                        <TypewriterText
                          text={msg.text}
                          speed={30}
                          onCharacterTyped={scrollToBottom}
                          onComplete={() => {
                            setTypingMessageIds(prev => prev.filter(id => id !== msg.id));
                            scrollToBottom();
                            msg.onComplete?.();
                          }}
                        />
                      ) : (
                        <div className="whitespace-pre-wrap">{msg.text}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

          {/* Decorations */}
          <Image
            src={"Bob.svg"}
            alt="Blackboard"
            width={175}
            height={175}
            className="absolute z-10 -top-10 -left-20"
          />

          <div className="bg-primary w-full h-8 rounded-2xl absolute left-1/2 transform -translate-x-1/2 -bottom-5">
            <Image
              src={"flower.svg"}
              alt="Decoration"
              width={50}
              height={50}
              className="absolute z-10 bottom-full left-24"
            />

            <Image
              src={"chalk.svg"}
              alt="Decoration"
              width={50}
              height={50}
              className="absolute z-10 bottom-full right-64"
            />
            {/* Question Input - Moved here and styled */}
            {isQuestioningEnabled && (
              <div className="absolute bottom-full mb-2 left-1/2 transform -translate-x-1/2 w-full max-w-xl">
                <div className="bg-white bg-opacity-20 rounded-lg p-2 flex gap-2 mx-4">
                  <input
                    type="text"
                    name="question"
                    value={questionInput}
                    onChange={(e) => setQuestionInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    className="flex-1 bg-transparent text-white placeholder-gray-300 outline-none px-4"
                    placeholder="Ask a question..."
                  />
                  <button
                    onClick={handleQuestion}
                    className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600"
                  >
                    Ask
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

          {evaluationComplete && !isQuestioningEnabled && (
            <div className="absolute bottom-28 left-1/2 transform -translate-x-1/2 z-20">
              <button
                onClick={handleNextQuestion}
                className="bg-green-500 hover:bg-green-600 text-white text-lg font-bold py-3 px-6 rounded-full shadow-lg flex items-center gap-2 animate-pulse"
              >
                Next Question
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

        {/* Answer Submission Section */}
          <div className="flex flex-col gap-4 items-center justify-center w-full max-w-2xl mx-auto">
            {/* Scratchboard Textarea */}
            <div className="w-full">
              <label htmlFor="scratchboard" className="block text-white text-sm mb-2">
                Show your reasoning:
              </label>
              <textarea
                id="scratchboard"
                value={scratchboardContent}
                onChange={(e) => setScratchboardContent(e.target.value)}
                className="w-full h-32 bg-white bg-opacity-10 text-white rounded-lg p-3 resize-none outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Write your reasoning here before submitting your final answer..."
              />
            </div>

            {/* Final Answer Input */}
            <div className="flex items-center bg-white rounded-full p-2 w-full">
              <input
                type="text"
                name="answer"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                className="flex-1 outline-none px-4 text-sm"
                placeholder={scratchboardContent ? "Submit final answer..." : "Show your reasoning first..."}
                disabled={!scratchboardContent || !isQuestioningEnabled}
              />
              <button
                onClick={handleSend}
                disabled={!scratchboardContent || !isQuestioningEnabled}
                className={`px-4 py-1 rounded-full text-sm ${scratchboardContent && isQuestioningEnabled
                    ? 'bg-green-500 hover:bg-green-600 text-white cursor-pointer'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
              >
                Submit
              </button>
            </div>
          </div>
      </div>
    </div>
    </div>
  );
}