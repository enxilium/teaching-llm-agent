'use client'

import { useState, useEffect } from 'react';
import { useFlow } from '@/context/FlowContext';
import SessionService from '@/services/SessionService';
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

// Define the question type without multiple choice options
interface Question {
    id: number;
    question: string;
    answer: string;
}

export default function SoloPage() {
    const { completeLesson, lessonQuestionIndex, currentStage, userId } = useFlow();
    const [sessionStartTime] = useState<Date>(new Date());
    
    // Ensure user is in the proper flow stage
    useEffect(() => {
        if (currentStage !== 'lesson') {
            console.warn(`Warning: User accessed solo page in incorrect stage: ${currentStage}`);
            // Comment out to prevent loops
            // window.location.href = '/';
        }
    }, [currentStage]);
    
    const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
    const [scratchboardContent, setScratchboardContent] = useState('');
    const [finalAnswer, setFinalAnswer] = useState('');
    const [feedback, setFeedback] = useState<{visible: boolean, correct: boolean}>({
        visible: false, 
        correct: false
    });
    const [showingSolution, setShowingSolution] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [errors, setErrors] = useState<{work: boolean, answer: boolean}>({
        work: false,
        answer: false
    });
    
    // Load the specific question based on lessonQuestionIndex
    useEffect(() => {
        const fetchQuestion = async () => {
            try {
                const response = await fetch('/questions.json');
                if (response.ok) {
                    const data = await response.json();
                    if (data.questions && data.questions.length > 0) {
                        // Use the lessonQuestionIndex to select which question to show
                        const question = data.questions[lessonQuestionIndex];
                        setCurrentQuestion(question);
                        setIsLoading(false);
                    }
                }
            } catch (error) {
                console.error("Error fetching question:", error);
                setIsLoading(false);
            }
        };
        
        fetchQuestion();
    }, [lessonQuestionIndex]);
    
    // Add a function to check answer correctness
    const checkAnswerCorrectness = (userAnswer: string, question: any): boolean => {
        if (!question || !question.answer) return false;
        
        // Simple string comparison (enhance as needed)
        const normalizedUserAnswer = userAnswer.trim().toLowerCase();
        const normalizedCorrectAnswer = question.answer.trim().toLowerCase();
        
        return normalizedUserAnswer === normalizedCorrectAnswer;
    };

    // Add this function to save session data
    const saveSessionData = async (finalAnswerText: string, isTimeout: boolean) => {
        try {
            // Calculate session duration in seconds
            const endTime = new Date();
            const durationMs = endTime.getTime() - sessionStartTime.getTime();
            const durationSeconds = Math.floor(durationMs / 1000);
            
            // Get the question text
            const questionText = currentQuestion?.question || '';
            
            // Check if the answer is correct
            const isCorrect = checkAnswerCorrectness(finalAnswerText, currentQuestion);
            
            await SessionService.createSession({
                userId,
                questionId: currentQuestion?.id || 0,
                questionText,
                startTime: sessionStartTime,
                endTime,
                duration: durationSeconds,
                finalAnswer: finalAnswerText,
                scratchboardContent,
                messages: [],
                isCorrect,
                timeoutOccurred: isTimeout
            });
            
            console.log('Session data saved successfully');
        } catch (error) {
            console.error('Error saving session data:', error);
        }
    };

    // Check answer and provide feedback
    const checkAnswer = () => {
        // Reset error state
        setErrors({work: false, answer: false});
        
        // Validate that work is shown
        if (!scratchboardContent.trim()) {
            setErrors(prev => ({...prev, work: true}));
            return;
        }
        
        // Validate that an answer is provided
        if (!finalAnswer.trim()) {
            setErrors(prev => ({...prev, answer: true}));
            return;
        }
        
        if (!currentQuestion) return;
        
        // Normalize answers for comparison (trim whitespace, convert to lowercase)
        const normalizedUserAnswer = finalAnswer.trim().toLowerCase();
        const normalizedCorrectAnswer = currentQuestion.answer.trim().toLowerCase();
        
        // Check if the answer matches
        const isCorrect = normalizedUserAnswer === normalizedCorrectAnswer;
        
        // Show feedback
        setFeedback({
            visible: true,
            correct: isCorrect
        });
        
        // Save session data
        saveSessionData(finalAnswer, false);

        // After a delay, allow continuing to the next stage
        setTimeout(() => {
            setShowingSolution(true);
        }, 1500);
    };
    
    // Handle final submission
    const handleFinishLesson = () => {
        // Continue to the next stage (tetris break) by directly calling completeLesson
        completeLesson();
    };

    // Auto-submit timeout answer
    const autoSubmitTimeoutAnswer = () => {
        const submissionText = finalAnswer || '';
        saveSessionData(submissionText, true);
    };
    
    // If questions haven't loaded yet
    if (isLoading) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] flex justify-center items-center">
                <div className="text-white text-xl">Loading question...</div>
            </div>
        );
    }
    
    return (
        <div className="min-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D]">
            <div className="container mx-auto p-8">
                {/* Header */}
                <div className="bg-white bg-opacity-10 rounded-lg p-6 mb-6">
                    <h1 className="text-3xl text-white font-bold mb-2">Self-Study Question</h1>
                    <p className="text-white opacity-70">
                        Work through this problem and enter your answer. You must show your work to proceed.
                    </p>
                </div>
                
                {/* Question Content */}
                <div className="bg-white bg-opacity-10 rounded-lg p-6 mb-6">
                    <h2 className="text-xl text-white font-bold mb-4">
                        {formatMathExpression(currentQuestion?.question || "Loading question...")}
                    </h2>

                    {/* Working Space - REQUIRED */}
                    <div className="mb-6">
                        <label className="block text-white text-sm mb-2 items-center">
                            <span className="mr-2">Show your work (required):</span>
                            {errors.work && 
                                <span className="text-red-400 text-xs">* You must show your work before submitting</span>
                            }
                        </label>
                        <textarea
                            value={scratchboardContent}
                            onChange={(e) => {
                                setScratchboardContent(e.target.value);
                                if (e.target.value.trim()) {
                                    setErrors(prev => ({...prev, work: false}));
                                }
                            }}
                            className={`w-full h-48 bg-white bg-opacity-10 text-white border rounded-lg p-3 resize-none ${
                                errors.work ? 'border-red-500' : 'border-gray-600'
                            }`}
                            placeholder="Show your reasoning here - explain how you're solving the problem..."
                            disabled={feedback.visible}
                        />
                    </div>

                    {/* Final Answer Box */}
                    <div className="mb-6">
                        <label className="block text-white text-sm mb-2 items-center">
                            <span className="mr-2">Your final answer (required):</span>
                            {errors.answer && 
                                <span className="text-red-400 text-xs">* You must provide an answer</span>
                            }
                        </label>
                        <input
                            type="text"
                            value={finalAnswer}
                            onChange={(e) => {
                                setFinalAnswer(e.target.value);
                                if (e.target.value.trim()) {
                                    setErrors(prev => ({...prev, answer: false}));
                                }
                            }}
                            className={`w-full bg-white bg-opacity-10 text-white border rounded-lg p-3 ${
                                errors.answer ? 'border-red-500' : 'border-gray-600'
                            }`}
                            placeholder="Enter your answer here..."
                            disabled={feedback.visible}
                        />
                    </div>
                    
                    {/* Feedback Message */}
                    {feedback.visible && (
                        <div className={`p-4 mb-6 rounded-lg border-2 ${
                            feedback.correct 
                            ? 'bg-green-900 bg-opacity-30 border-green-500' 
                            : 'bg-red-900 bg-opacity-30 border-red-500'
                        }`}>
                            <p className="text-white text-lg font-medium">
                                {feedback.correct 
                                ? 'Correct! Great job!' 
                                : 'Incorrect.'}
                            </p>
                            
                            {!feedback.correct && currentQuestion?.answer && (
                                <p className="text-white mt-2">
                                    <span className="font-bold">Correct answer: </span> 
                                    {formatMathExpression(currentQuestion.answer)}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex justify-end">
                        {!feedback.visible ? (
                            <button
                                onClick={checkAnswer}
                                className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                Submit Answer
                            </button>
                        ) : (
                            <button
                                onClick={handleFinishLesson}
                                className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg"
                            >
                                Continue
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}