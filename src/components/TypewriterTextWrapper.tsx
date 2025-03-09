import React, { useEffect, useState, useRef, memo } from 'react';
import TypewriterText from './TypewriterText';

interface TypewriterTextWrapperProps {
    text?: string;
    content?: string; // Add content as an alternative to text
    speed?: number;
    messageId: number;
    onTypingProgress?: (progress: number) => void;
    onTypingComplete?: () => void;
}

// This component "locks in" the text and prevents parent re-renders from restarting the animation
const TypewriterTextWrapper = ({
    text,
    content,
    speed = 50, // Much faster speed for LLM-like generation
    messageId,
    onTypingProgress,
    onTypingComplete
}: TypewriterTextWrapperProps) => {
    // Use refs to track animation state to prevent race conditions
    const isTypingRef = useRef(true);
    const isCompletedRef = useRef(false);
    const isMountedRef = useRef(true);
    
    // Ensure text is a string - prioritize content if both are provided
    const displayText = content || text || "";
    const safeText = typeof displayText === 'string' ? displayText : "";
    
    // Use a ref to store the original text to prevent animation restart on re-renders
    const textRef = useRef(safeText);
    
    // Track progress for callbacks
    const [progress, setProgress] = useState(0);
    const totalLengthRef = useRef(safeText.length);
    const progressCounterRef = useRef(0);
    
    useEffect(() => {
        // Store original text reference
        textRef.current = safeText;
        totalLengthRef.current = safeText.length;
        
        // Set mounted flag
        isMountedRef.current = true;
        isTypingRef.current = true;
        isCompletedRef.current = false;
        progressCounterRef.current = 0;
        
        return () => {
            // Cleanup on unmount
            isMountedRef.current = false;
        };
    }, [safeText]);
    
    const handleChunkTyped = () => {
        if (!isMountedRef.current || !isTypingRef.current) return;
        
        // Increment progress counter - estimate based on chunks
        // We'll increment by approx. 5-10% each time a chunk is typed
        progressCounterRef.current += Math.min(10, Math.floor(totalLengthRef.current * 0.08));
        
        // Calculate progress as a percentage and clamp it to 100%
        const newProgress = Math.min(100, Math.floor(progressCounterRef.current * 100 / totalLengthRef.current));
        setProgress(newProgress);
        
        // Call progress callback
        if (onTypingProgress) {
            onTypingProgress(newProgress);
        }
    };
    
    const handleComplete = () => {
        if (!isMountedRef.current || isCompletedRef.current) return;
        
        // Mark as completed to prevent duplicate callbacks
        isTypingRef.current = false;
        isCompletedRef.current = true;
        
        // Update progress to 100%
        setProgress(100);
        
        // Call complete callback
        if (onTypingComplete) {
            onTypingComplete();
        }
    };
    
    // Use the original text to prevent animation restart
    return (
        <TypewriterText
            key={`typewriter-${messageId}`} // Stable key based on message ID
            text={textRef.current}
            speed={speed} 
            onComplete={handleComplete}
            onCharacterTyped={handleChunkTyped} // Now this is called for each chunk
        />
    );
};

export default TypewriterTextWrapper;