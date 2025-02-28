import React, { useState, useEffect, useRef } from 'react';

interface TypewriterTextProps {
  text: string;
  speed?: number;
  onComplete?: () => void;
  onCharacterTyped?: () => void;
}

export default function TypewriterText({
  text,
  speed = 30,
  onComplete,
  onCharacterTyped
}: TypewriterTextProps) {
  // Store rendered text
  const [displayedText, setDisplayedText] = useState("");

  // Store animation state in refs to prevent re-renders
  const animationRef = useRef<number | null>(null);
  const isAnimatingRef = useRef(true);
  const isMountedRef = useRef(true);
  const currentIndexRef = useRef(0);
  const hasCalledCompleteRef = useRef(false);

  useEffect(() => {
    // Reset state when text changes
    setDisplayedText("");
    currentIndexRef.current = 0;
    isAnimatingRef.current = true;
    hasCalledCompleteRef.current = false;
    isMountedRef.current = true;

    // Clean up any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    // Function to update text one character at a time
    const animate = () => {
      if (!isMountedRef.current || !isAnimatingRef.current) return;

      if (currentIndexRef.current < text.length) {
        // Get next character
        const nextChar = text.charAt(currentIndexRef.current);
        currentIndexRef.current++;

        // Update displayed text
        setDisplayedText(prev => prev + nextChar);

        // Call character typed callback if provided
        if (onCharacterTyped) {
          onCharacterTyped();
        }

        // Calculate delay based on character type
        let delay = speed;
        if (nextChar === ' ') delay = speed * 0.5;
        if (nextChar === '.' || nextChar === '!' || nextChar === '?') delay = speed * 3;
        if (nextChar === ',' || nextChar === ';' || nextChar === ':') delay = speed * 2;

        // Schedule next character
        animationRef.current = window.setTimeout(animate, delay) as any;
      } else {
        // Animation complete
        isAnimatingRef.current = false;

        // Call completion callback if provided
        if (!hasCalledCompleteRef.current && onComplete && isMountedRef.current) {
          hasCalledCompleteRef.current = true;
          setTimeout(onComplete, 50);
        }
      }
    };

    // Start animation with a small initial delay
    animationRef.current = window.setTimeout(animate, 50) as any;

    // Cleanup function
    return () => {
      isMountedRef.current = false;

      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }

      // IMPORTANT: Do NOT set full text on unmount
      // This was causing the jump to end

      // Call completion callback if not already called
      if (!hasCalledCompleteRef.current && onComplete) {
        hasCalledCompleteRef.current = true;
        onComplete();
      }
    };
  }, [text, speed, onComplete, onCharacterTyped]);

  return (
    <div className="whitespace-pre-wrap message-text">
      {displayedText}
      {isAnimatingRef.current && <span className="typing-cursor">▋</span>}
    </div>
  );
}