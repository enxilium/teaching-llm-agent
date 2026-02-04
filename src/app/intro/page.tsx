'use client'

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useFlow } from '@/context/FlowContext';

export default function IntroPage() {
    const { completeIntro, lessonType } = useFlow();

    // Log the scenario type for debugging
    useEffect(() => {
        console.log("📋 SCENARIO ASSIGNED:", lessonType);
        console.log("📋 Scenario details:", {
            lessonType,
            hasAgents: lessonType !== 'solo' && lessonType !== null,
            scenarioName: lessonType === 'multi' ? 'Tutor + Peers' 
                        : lessonType === 'single' ? 'Tutor Only'
                        : lessonType === 'group' ? 'Peers Only'
                        : lessonType === 'solo' ? 'Solo (No Agents)'
                        : 'Loading...'
        });
    }, [lessonType]);

    // Agent descriptions based on lessonType
    const getAgentDescriptions = () => {
        switch (lessonType) {
            case 'single':
                return [
                    {
                        name: "Bob (Tutor)",
                        avatar: "/tutor_avatar.svg",
                        description: "Bob is a supportive math tutor who will give you personalized feedback on your answers and help you understand the concepts. You can ask Bob questions during the lesson to help you prepare for later questions."
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
            case 'single':
                return "tutor who will give you personalized feedback.";
            case 'group':
                return "peers to discuss the problem.";
            case 'multi':
                return "tutor and peers to discuss the problem.";
            case 'solo':
            default:
                return "";
        }
    };
    
    // Check if this scenario involves chat (any scenario except 'solo')
    const hasChat = lessonType !== 'solo' && lessonType !== null;

    // Get a friendly name for the scenario
    const getScenarioName = () => {
        switch (lessonType) {
            case 'multi': return 'Tutor + Peers';
            case 'single': return 'Tutor Only';
            case 'group': return 'Peer Discussion';
            case 'solo': return 'Independent Study';
            default: return 'Loading...';
        }
    };

    const agents = getAgentDescriptions();
    
    return (
        <div className="min-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-8">
            <div className="max-w-3xl mx-auto text-white">
                <h1 className="text-3xl font-bold text-white text-center mb-6">Introduction to Your Learning Experience</h1>
                
                <div className="bg-purple-900 bg-opacity-50 p-6 rounded-lg border border-purple-500 mb-8">
                    <h2 className="text-2xl font-bold mb-4">Introduction</h2>
                    <p className="mb-4">
                        In this task, you will be asked to solve two math problems in a Practice/Lesson round, followed by two more problems in a Test round. The problems are similar to those commonly found on standardized tests.
                    </p>
                    
                    {hasChat && (
                        <p className="mb-4">
                            After providing a response to each problem in the Lesson, you will interact with AI {getScenarioDescription()}
                        </p>
                    )}
                </div>

                {agents.length > 0 && (
                    <div className="bg-white bg-opacity-10 p-6 rounded-lg mb-8">
                        <h2 className="text-2xl font-bold mb-4">Meet Your {lessonType === 'single' ? 'Tutor' : lessonType === 'multi' ? 'Tutor and Study Partners' : 'Study Partners'}</h2>
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
                                <p><strong>Note:</strong> In the chat, you may be referred to as &quot;@User&quot; in the conversation.</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Solo mode explanation */}
                {lessonType === 'solo' && (
                    <div className="bg-white bg-opacity-10 p-6 rounded-lg mb-8">
                        <h2 className="text-2xl font-bold mb-4">Independent Study Mode</h2>
                        <p>
                            In this session, you will work through the practice problems independently. 
                            Focus on your own problem-solving approach and take 
                            notes in the scratchpad as needed.
                        </p>
                    </div>
                )}
                
                <div className="bg-white bg-opacity-10 p-6 rounded-lg mb-8">
                    <h2 className="text-2xl font-bold mb-4">Important Reminders</h2>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Please do not refresh the page or use browser back/forward buttons</li>
                        <li>Do not take screenshots or use external tools</li>
                        <li>Give your best effort on all problems</li>
                        <li>Your performance on the problems does not affect your compensation</li>
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