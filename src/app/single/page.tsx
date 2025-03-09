'use client'

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import TypewriterText from '@/components/TypewriterText';
import { aiService, AI_MODELS } from '@/services/AI';
import { Message } from '@/utils/types';
import TypewriterTextWrapper from "@/components/TypewriterTextWrapper";

export default function MultiPage() {
  const router = useRouter();

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

  // Questions from JSON
  const [allQuestions, setAllQuestions] = useState<string[]>([]);
  const [loadedQuestions, setLoadedQuestions] = useState(false);

  // Timer state
  const [timeLeft, setTimeLeft] = useState(120);
  const roundEndedRef = useRef(false);

  // Question tracking
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [usedQuestionIndices, setUsedQuestionIndices] = useState<number[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<any>(null);

  // Define the AI agents - only Bob
  const agents = [
    {
      id: 'bob',
      name: 'Bob',
      avatar: 'bob_avatar.svg',
      systemPrompt: `You are Bob, an experienced and encouraging math teacher guiding a student.
When introducing problems, provide clear context and relevant background concepts.
Guide discussions without giving away solutions. 
Respond to student questions with helpful insights and Socratic questioning.
Acknowledge good observations and gently correct misconceptions.
Your goal is to facilitate learning through guided discovery.`
    }
  ];

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
        const questions: string[] = Object.values(data).flat() as string[];

        setAllQuestions(questions);
        setLoadedQuestions(true);
        console.log("Loaded questions:", questions);
      } catch (error) {
        console.error("Error loading questions:", error);
        // Use fallback questions if we can't load from JSON
        setAllQuestions([
          "In how many ways can four couples be seated at a round table if the men and women want to sit alternately?",
          "In how many different ways can five people be seated at a circular table?",
          "A shopping mall has a straight row of 5 flagpoles at its main entrance plaza. It has 3 identical green flags and 2 identical yellow flags. How many distinct arrangements of flags on the flagpoles are possible?"
        ]);
        setLoadedQuestions(true);
      }
    };

    fetchQuestions();
  }, []);

  // Add this at the top of your component with other state declarations
  const nextMessageIdRef = useRef(3); // Start at 3 to match your initial state

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

  // Update checkForBotMention to only check for Bob
  const checkForBotMention = (message: string) => {
    return 'bob'; // Always return bob since he's the only agent
  };

  // Update AI response generation to only use Bob
  const generateAIResponse = async (userMessage: string) => {
    // Don't generate responses if time's up
    if (roundEndedRef.current) return;

    const selectedAgent = agents[0]; // Bob is the only agent

    console.log(`Generating response from ${selectedAgent.name}`);
    setBotThinking(true);

    try {
      // Show typing indicator temporarily
      const tempMessageId = getUniqueMessageId();
      setMessages(prev => [...prev, {
        id: tempMessageId,
        sender: 'ai',
        text: '...',
        agentId: selectedAgent.id,
        timestamp: new Date().toISOString()
      }]);

      // Generate AI response using the correct API call
      const response = await aiService.generateResponse(
        [
          {
            id: 1,
            sender: 'user',
            text: `The current problem is: ${currentQuestion}`
          },
          {
            id: 2,
            sender: 'user',
            text: `The student asked: ${userMessage}`
          }
        ],
        {
          systemPrompt: selectedAgent.systemPrompt,
          model: currentModel
        }
      );

      // Replace typing indicator with actual message
      setMessages(prev => prev.map(msg =>
        msg.id === tempMessageId
          ? {
            ...msg,
            text: response,
            timestamp: new Date().toISOString()
          }
          : msg
      ));

      // Add to typing state
      setTypingMessageIds(prev => [...prev, tempMessageId]);

    } catch (error) {
      console.error("Error generating AI response:", error);
      setMessages(prev => prev.filter(msg => msg.text !== '...'));
    } finally {
      setBotThinking(false);
    }
  };

  // Simplify handleUserQuestion to only call generateAIResponse without bot mention check
  const handleUserQuestion = () => {
    if (!input.trim() || typingMessageIds.length > 0) return;

    // Record user activity
    setLastUserActivityTime(Date.now());

    const userMessage: Message = {
      id: getUniqueMessageId(),
      sender: 'user',
      text: input,
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');

    // Force scroll to bottom when user sends a message
    forceScrollToBottomRef.current = true;
    setTimeout(() => scrollToBottom(true), 50);

    // Generate Bob's response (no need to check which bot was mentioned)
    generateAIResponse(userMessage.text || "");
  };

  // Update the evaluation to only include Bob's assessment
  const generateEvaluation = async (finalAnswer: string, question: string) => {
    console.log("Generating evaluation");
    setBotThinking(true);

    try {
      // Add Bob's evaluation message
      const bobMessageId = getUniqueMessageId();
      setMessages(prev => [...prev, {
        id: bobMessageId,
        sender: "ai",
        text: "...",
        agentId: "bob",
        timestamp: new Date().toISOString()
      }]);

      // Generate Bob's evaluation of the answer
      const response = await aiService.generateResponse(
        [
          {
            id: 1,
            sender: "user",
            text: `Problem: ${question}
                    
Student's final answer: ${finalAnswer}

As Bob the teacher, provide:
1. The correct solution to this problem with step-by-step explanation
2. An evaluation of the student's answer (correct/partially correct/incorrect)
3. Specific feedback on their approach and reasoning
4. Key learning points from this problem

Format your response in a clear, encouraging way as a teacher would.`
          }
        ],
        {
          systemPrompt: agents[0].systemPrompt,
          model: currentModel
        }
      );

      // Update Bob's evaluation message
      setMessages(prev => prev.map(msg =>
        msg.id === bobMessageId
          ? {
            ...msg,
            text: response,
            timestamp: new Date().toISOString()
          }
          : msg
      ));

      // Add to typing state for typewriter effect
      setTypingMessageIds(prev => [...prev, bobMessageId]);
      setEvaluationComplete(true);
    } catch (error) {
      console.error("Error generating evaluation:", error);
      // Handle error
    } finally {
      setBotThinking(false);
    }
  };

  // Update startNewRound to only include Bob's introduction
  const startNewRound = async () => {
    // Remove any bot tracking state
    setLastSpeakingBot(null);

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

      // Set up messages for the new round with Bob introducing the problem
      const bobIntroId = getUniqueMessageId();

      // Create a message object
      const bobIntroMessage = {
        id: bobIntroId,
        sender: "ai",
        text: `Today we'll be working on an interesting problem. Take your time to understand it and think about your approach:\n\n${selectedQuestion}\n\nConsider what concepts might apply here. Feel free to ask questions as you work.`,
        agentId: "bob",
        timestamp: new Date().toISOString()
      };

      setMessages([bobIntroMessage]);
      setTypingMessageIds(prev => [...prev, bobIntroId]);

      // Reset timer and other state
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
          text: "Let's work on this combinatorics problem today.",
          agentId: "bob"
        },
        {
          id: 2,
          sender: "ai",
          text: fallbackQuestion,
          agentId: "bob"
        }
      ]);

      // Continue with the fallback question
      setTimeLeft(120);
      setIsQuestioningEnabled(true);
      roundEndedRef.current = false;
    }
  };

  // Initialize with first question once questions are loaded
  useEffect(() => {
    if (loadedQuestions) {
      startNewRound();
    }
  }, [loadedQuestions]);

  // Handle next question button
  const handleNextQuestion = () => {
    setEvaluationComplete(false);
    startNewRound();
  };

  // Add a new state to track which bot spoke last
  const [lastSpeakingBot, setLastSpeakingBot] = useState<string | null>(null);

  // Add the autoSubmitTimeoutAnswer function for the timer
  const autoSubmitTimeoutAnswer = () => {
    console.log("Auto-submitting answer due to timeout");

    // Disable further questioning
    setIsQuestioningEnabled(false);
    roundEndedRef.current = true;

    // Only auto-submit if user has written something in the scratchboard
    const submissionText = finalAnswer.trim() || "No answer.";

    ensureNoTypingInProgress(() => {
      const userFinalAnswer: Message = {
        id: getUniqueMessageId(),
        sender: 'user',
        text: `My final answer is: ${submissionText}\n\nMy reasoning:\n${scratchboardContent}`,
        timestamp: new Date().toISOString()
      };

      setMessages(prev => [...prev, userFinalAnswer]);
      setFinalAnswer('');

      // Generate evaluation
      generateEvaluation(userFinalAnswer.text || "", currentQuestion);
    });
  };

  // Add the handleSend function for the submit button
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

      setMessages(prev => [...prev, userFinalAnswer]);
      setFinalAnswer('');

      // Force scroll to bottom when user submits final answer
      forceScrollToBottomRef.current = true;
      setTimeout(() => scrollToBottom(true), 50);

      // Don't clear scratchboard to allow review
      // Disable further questioning
      setIsQuestioningEnabled(false);
      roundEndedRef.current = true;

      // Generate evaluation
      generateEvaluation(userFinalAnswer.text || "", currentQuestion);
    });
  };

  // Add the timer useEffect
  useEffect(() => {
    if (timeLeft <= 0) {
      // Time's up logic
      if (isQuestioningEnabled) {
        // Only auto-submit if questioning is still enabled (hasn't been submitted yet)
        autoSubmitTimeoutAnswer();
      }
      return;
    }

    if (roundEndedRef.current) {
      return;
    }

    const timerId = setTimeout(() => {
      setTimeLeft(prevTime => prevTime - 1);
    }, 1000);

    return () => clearTimeout(timerId);
  }, [timeLeft]);

  return (
    <div className="h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-4 flex flex-row overflow-hidden">
      {/* LEFT PANEL - Problem, Submission, Scratchboard */}
      <div className="w-1/2 pr-2 flex flex-col h-full overflow-hidden">
        {/* Problem Display with Timer inside */}
        {currentQuestion && (
          <div className="bg-white bg-opacity-20 p-4 rounded-md mb-4 border-2 border-purple-400">
            <div className="flex justify-between items-start mb-2">
              <h2 className="text-xl text-white font-semibold">Problem:</h2>
              {/* Timer integrated in problem statement */}
              <div className={`p-2 rounded-lg ${timeLeft > 20
                ? 'bg-green-700'
                : timeLeft > 10
                  ? 'bg-yellow-600 animate-pulse'
                  : 'bg-red-700 animate-pulse'} ml-4`}>
                <div className="text-xl font-mono text-white">{formatTime(timeLeft)}</div>
                {timeLeft <= 20 && (
                  <div className="text-xs text-white text-center">
                    {timeLeft <= 10 ? "Time almost up!" : "Finish soon!"}
                  </div>
                )}
              </div>
            </div>
            <p className="text-white text-lg">{currentQuestion}</p>
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
            />
            <button
              onClick={() => handleSend()}
              disabled={!finalAnswer.trim() || !scratchboardContent.trim() || typingMessageIds.length > 0}
              className={`px-4 py-3 rounded-md text-lg font-medium ${finalAnswer.trim() && scratchboardContent.trim() && typingMessageIds.length === 0
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                }`}
            >
              Submit Final Answer
            </button>
          </div>
        </div>

        {/* Scratchboard - Now below final answer with different styling */}
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
          {/* Update Agent info to only show Bob */}
          <div className="bg-black bg-opacity-30 p-2">
            <div className="flex space-x-3">
              <div className="flex items-center">
                <Image
                  src={agents[0].avatar}
                  alt={agents[0].name}
                  width={40}
                  height={40}
                  className="rounded-full border-2 border-white"
                />
                <span className="text-xs text-white ml-2">{agents[0].name}</span>
              </div>
            </div>
          </div>

          {/* Chat messages - Scrollable */}
          <div className="flex-1 p-4 overflow-y-auto"
            ref={chatContainerRef}
            onScroll={handleScroll}>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`mb-4 flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'ai' && (
                  <div className="mr-2 flex-shrink-0">
                    <Image
                      src={agents[0].avatar}
                      alt={agents[0].name}
                      width={40}
                      height={40}
                      className="rounded-full border-2 border-white"
                    />
                  </div>
                )}

                <div
                  className={`max-w-[75%] rounded-lg p-3 ${msg.sender === 'user'
                    ? 'bg-blue-600 text-white'
                    : msg.sender === 'system'
                      ? 'bg-purple-700 text-white'
                      : 'bg-white bg-opacity-10 text-white'
                    }`}
                >
                  {msg.sender === 'ai' && (
                    <div className="text-sm text-gray-300 mb-1 font-bold">
                      {agents[0].name}
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
                      text={msg.text}
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
                    />
                  ) : (
                    <div className="whitespace-pre-wrap">{msg.text}</div>
                  )}
                </div>
              </div>
            ))}
            <div key="messages-end" />
          </div>

          {/* Chat input (for questions only, separate from final answer) */}
          {isQuestioningEnabled && (
            <div className="p-3 bg-black bg-opacity-30">
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about the problem (mention Bob specifically if needed)..."
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
                  className={`px-4 py-2 rounded-md ${input.trim() && typingMessageIds.length === 0
                    ? 'bg-blue-600 hover:bg-blue-700 text-white'
                    : 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    }`}
                >
                  Ask
                </button>
              </div>
            </div>
          )}

          {/* Next question button (when time's up) */}
          {!isQuestioningEnabled && evaluationComplete && (
            <div className="p-3 bg-black bg-opacity-30 flex justify-center">
              <button
                onClick={handleNextQuestion}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-md"
              >
                Next Question
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}