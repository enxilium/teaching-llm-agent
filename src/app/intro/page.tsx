'use client'

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useFlow } from '@/context/FlowContext';

export default function IntroPage() {
    const { completeIntro, lessonType } = useFlow();

    // Agent descriptions based on lessonType
    const getAgentDescriptions = () => {
        switch (lessonType) {
            case 'single':
                return [
                    {
                        name: "Bob (Tutor)",
                        avatar: "/tutor_avatar.svg",
                        description: "Bob is a supportive math tutor who will give you personalized feedback on your answers and help you understand the concepts. You can ask Bob questions during the lesson to help you prepare for the test."
                    }
                ];
            case 'group':
                return [
                    {
                        name: "Alice",
                        avatar: "/pattern_avatar.png",
                        description: "Alice sometimes makes arithmetic mistakes but has strong conceptual understanding. She might mix up numbers or make calculation errors."
                    },
                    {
                        name: "Charlie",
                        avatar: "/logic_avatar.png",
                        description: "Charlie computes things accurately but sometimes misunderstands the underlying concepts. He may apply formulas incorrectly despite doing the math correctly."
                    }
                ];
            case 'multi':
                return [
                    {
                        name: "Bob (Tutor)",
                        avatar: "/tutor_avatar.svg",
                        description: "Bob is a supportive math tutor who will guide the discussion and provide feedback on your answers."
                    },
                    {
                        name: "Alice",
                        avatar: "/pattern_avatar.png",
                        description: "Alice sometimes makes arithmetic mistakes but has strong conceptual understanding. She might mix up numbers or make calculation errors."
                    },
                    {
                        name: "Charlie",
                        avatar: "/logic_avatar.png",
                        description: "Charlie computes things accurately but sometimes misunderstands the underlying concepts. He may apply formulas incorrectly despite doing the math correctly."
                    }
                ];
            case 'solo':
            default:
                return []; // No agents in solo mode
        }
    };

    // Get scenario description
    const getScenarioDescription = () => {
        switch (lessonType) {
            case 'solo':
                return "After solving the practice problems, you will receive brief feedback on your answers.";
            case 'single':
                return "After solving the practice problems, you will receive feedback from an AI tutor. You may also ask the tutor questions to help you prepare for the test.";
            case 'group':
                return "After solving the practice problems, you will see how your AI 'peers' (other AI agents) solved them. You may discuss the problem in a group setting before the test.";
            case 'multi':
                return "After solving the practice problems, you will receive feedback from an AI tutor alongside AI 'peers' (other AI agents). You may discuss the problem with both the tutor and your peers before the test.";
            default:
                return "After solving the practice problems, you will receive feedback to help you prepare for the test.";
        }
    };
    
    // Check if this scenario involves chat (any scenario except 'solo')
    const hasChat = lessonType !== 'solo';

    const agents = getAgentDescriptions();
    
    return (
        <div className="min-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-8">
            <div className="max-w-3xl mx-auto text-white">
                <h1 className="text-3xl font-bold text-white text-center mb-6">Introduction to Your Learning Experience</h1>
                
                <div className="bg-purple-900 bg-opacity-50 p-6 rounded-lg border border-purple-500 mb-8">
                    <h2 className="text-2xl font-bold mb-4">Study Overview</h2>
                    <p className="mb-4">
                        In this study, you will solve multiple-choice math problems about exponents. The problems are similar to those commonly found on standardized tests.
                    </p>
                    <p className="mb-4">
                        The study has the following stages:
                    </p>
                    <ol className="list-decimal pl-6 mb-4 space-y-2">
                        <li>Complete a pre-test survey to share your background with mathematics.</li>
                        <li>Answer a few practice problems to assess your initial understanding.</li>
                        <li>{getScenarioDescription()}</li>
                        <li>Take a short break with a tetris game.</li>
                        <li>Answer questions similar to the pre-test to measure your progress.</li>
                        <li>Complete a final set of questions that test your understanding.</li>
                        <li>Share your experience and feedback.</li>
                    </ol>
                </div>

                {agents.length > 0 && (
                    <div className="bg-white bg-opacity-10 p-6 rounded-lg mb-8">
                        <h2 className="text-2xl font-bold mb-4">Meet Your {lessonType === 'single' ? 'Tutor' : 'Study Partners'}</h2>
                        <div className="space-y-6">
                            {agents.map((agent, index) => (
                                <div key={index} className="flex items-start space-x-4 p-3 rounded-lg bg-white bg-opacity-10">
                                    <div className="flex-shrink-0">
                                        <Image 
                                            src={agent.avatar} 
                                            alt={agent.name} 
                                            width={60} 
                                            height={60}
                                            className="rounded-full border-2 border-purple-400"
                                        />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-purple-300">{agent.name}</h3>
                                        <p>{agent.description}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                        
                        {/* Note about @User reference in chat logs */}
                        {hasChat && (
                            <div className="mt-4 p-3 bg-blue-900 bg-opacity-40 rounded-lg border border-blue-500">
                                <p><strong>Note:</strong> In the chat, you may be referred to as "@User" in the conversation.</p>
                            </div>
                        )}
                    </div>
                )}
                
                <div className="bg-white bg-opacity-10 p-6 rounded-lg mb-8">
                    <h2 className="text-2xl font-bold mb-4">Important Reminders</h2>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Please do not refresh the page or use browser back/forward buttons</li>
                        <li>Do not take screenshots or use external tools</li>
                        <li>Give your best effort on all problems</li>
                        <li>Your performance on the tests does not affect your compensation</li>
                    </ul>
                </div>
                
                <div className="flex justify-center">
                    <button
                        onClick={completeIntro}
                        className="px-8 py-3 rounded-lg bg-purple-600 hover:bg-purple-700 text-white"
                    >
                        Continue to Survey
                    </button>
                </div>
            </div>
        </div>
    );
} 