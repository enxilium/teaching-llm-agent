import React, { useState, useEffect, useRef } from 'react';

interface TypewriterTextProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
  onCharacterTyped?: () => void;
  skip?: boolean; // Add skip prop
}

export default function TypewriterText({
  text,
  speed = 30,
  onComplete,
  onCharacterTyped,
  skip = false // Default to false
}: TypewriterTextProps) {
  const [displayText, setDisplayText] = useState('');
  const [isComplete, setIsComplete] = useState(false);
  const animationRef = useRef<number | null>(null);
  const isMountedRef = useRef(true);
  const chunkIndexRef = useRef(0);
  const chunksRef = useRef<string[]>([]);

  // Create natural chunks for text display
  const createNaturalChunks = (text: string): string[] => {
    const tokens = text.match(/\S+\s*/g) || [];
    let chunks: string[] = [];
    let i = 0;
    while (i < tokens.length) {
      const groupSize = Math.floor(Math.random() * 4) + 2; // 2 to 5 tokens
      const chunk = tokens.slice(i, i + groupSize).join('');
      chunks.push(chunk);
      i += groupSize;
    }
    return chunks;
  };

  // Handle skip prop changes
  useEffect(() => {
    if (skip && !isComplete) {
      // Cancel any ongoing animation
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      
      // Immediately display full text
      setDisplayText(text);
      setIsComplete(true);
      
      // Call completion callback
      if (onComplete) {
        onComplete();
      }
    }
  }, [skip, text, isComplete, onComplete]);

  useEffect(() => {
    // Don't start animation if skip is true
    if (skip) return;
    
    isMountedRef.current = true;
    chunkIndexRef.current = 0;
    setDisplayText('');
    setIsComplete(false);
    chunksRef.current = createNaturalChunks(text);
    startAnimation();
    
    return () => {
      isMountedRef.current = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [text, skip]);

  const startAnimation = () => {
    let lastTime = performance.now();
    const animate = (time: number) => {
      if (!isMountedRef.current) return;
      const elapsed = time - lastTime;
      const currentChunk = chunksRef.current[chunkIndexRef.current] || '';
      
      // Base interval depends on the length of the current chunk plus random factor
      const randomFactor = Math.random() * 0.5 + 0.5;
      const baseInterval = Math.max(20, 100 - (speed * 2));
      const interval = baseInterval * randomFactor * (currentChunk.length > 15 ? 1.2 : 0.8);
      
      if (elapsed > interval) {
        lastTime = time;
        if (chunkIndexRef.current < chunksRef.current.length) {
          setDisplayText(prev => prev + chunksRef.current[chunkIndexRef.current]);
          chunkIndexRef.current++;
          if (onCharacterTyped) onCharacterTyped();
        } else if (!isComplete) {
          setIsComplete(true);
          if (onComplete) onComplete();
          return;
        }
      }
      animationRef.current = requestAnimationFrame(animate);
    };
    animationRef.current = requestAnimationFrame(animate);
  };

  return <div className="whitespace-pre-wrap">{displayText}</div>;
}