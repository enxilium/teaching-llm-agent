'use client'

import { useEffect, useState } from 'react';
import { useFlow } from '@/context/FlowContext';
import TetrisGame from '@/components/TetrisGame';

export default function BreakPage() {
  const { completeTetrisBreak, currentStage } = useFlow();
  const [isTransitioning, setIsTransitioning] = useState(false);
  
  // CRITICAL FIX: Only check stage in useEffect, not during render
  useEffect(() => {
    // Verify we're in the correct stage
    if (currentStage !== 'tetris-break') {
      console.warn(`Warning: User accessed break page in incorrect stage: ${currentStage}`);
    }
  }, [currentStage]);
  
  // Handle completion separately
  const handleGameComplete = () => {
    if (isTransitioning) return; // Prevent double-transitions
    
    setIsTransitioning(true);
    console.log("Tetris game complete, proceeding to post-test...");
    
    // Add delay to ensure state updates complete before navigation
    setTimeout(() => {
      completeTetrisBreak();
    }, 500);
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] flex flex-col">
      <div className="container mx-auto p-8 flex-1 flex flex-col">
        <div className="bg-white bg-opacity-10 rounded-lg p-6 mb-6">
          <h1 className="text-3xl text-white font-bold mb-4">Take a Short Break</h1>
          <p className="text-white opacity-90 mb-2">
            Let's take a quick cognitive break before continuing.
          </p>
          <p className="text-white opacity-90">
            Play a quick game of Tetris, then we'll move on to the next section.
          </p>
        </div>
        
        <div className="flex-1 flex justify-center items-center">
          <TetrisGame onGameComplete={handleGameComplete} />
        </div>
      </div>
    </div>
  );
}