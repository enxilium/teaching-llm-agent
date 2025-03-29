'use client'

import { useState, useEffect } from 'react';
import { useFlow } from '@/context/FlowContext';
import Tetris from '@/components/Tetris';

export default function BreakPage() {
    const [timeLeft, setTimeLeft] = useState(5); // 5 minutes
    const { completeTetrisBreak, currentStage } = useFlow();

    // Ensure user is in the proper flow stage
    useEffect(() => {
        // Wrap the localStorage update in a setTimeout to move it out of the render cycle
        if (currentStage !== 'tetris-break') {
            console.warn(`Warning: User accessed break page in incorrect stage: ${currentStage}`);
            
            // Use setTimeout to defer the update to avoid updating during render
            setTimeout(() => {
                localStorage.setItem('currentStage', 'tetris-break');
            }, 0);
        }
    }, [currentStage]);

    useEffect(() => {
        const timer = setInterval(() => {
            setTimeLeft(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    completeTetrisBreak(); // Use Flow context to advance
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [completeTetrisBreak]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="bg-gradient-to-b from-[#2D0278] to-[#0A001D] min-h-screen p-8 flex flex-col items-center">
            <h1 className="text-3xl text-white font-bold mb-6">Break Time!</h1>
            <p className="text-white text-xl mb-8">
                Take a 5-minute break and play some Tetris.
                Test phase will begin automatically when the timer ends.
            </p>

            <div className="bg-white bg-opacity-10 p-4 rounded-lg mb-6">
                <div className="text-2xl text-white font-mono">
                    Time left: {formatTime(timeLeft)}
                </div>
            </div>

            <div className="bg-black bg-opacity-30 p-6 rounded-xl">
                <Tetris />
            </div>
        </div>
    );
}