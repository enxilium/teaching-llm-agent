import React, { useState, useEffect } from 'react';
import { InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';

interface TypewriterTextWrapperProps {
  text: string;
  speed?: number;
  messageId: number;
  onTypingComplete?: () => void;
  onTypingProgress?: (progress: number) => void;
  formatMath?: boolean;
  skip?: boolean; // Add skip prop
}

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

export default function TypewriterTextWrapper({
    text,
    speed = 20,
    messageId,
    onTypingComplete,
    onTypingProgress,
    formatMath = false,
    skip = false // Default to false
}: TypewriterTextWrapperProps) {
    const [displayText, setDisplayText] = useState("");
    const [isTyping, setIsTyping] = useState(true);
    const [charIndex, setCharIndex] = useState(0);
    
    // Handle skip prop changes to immediately complete typing
    useEffect(() => {
        if (skip && isTyping) {
            // Immediately complete the typing animation
            setDisplayText(text);
            setCharIndex(text.length);
            setIsTyping(false);
            
            // Call the completion callback
            if (onTypingComplete) {
                onTypingComplete();
            }
        }
    }, [skip, text, isTyping, onTypingComplete]);
    
    useEffect(() => {
        // Skip the normal typing if skip is true
        if (skip) return;
        
        if (charIndex < text.length) {
            const timer = setTimeout(() => {
                setDisplayText(text.substring(0, charIndex + 1));
                setCharIndex(charIndex + 1);
                
                if (onTypingProgress) {
                    onTypingProgress(charIndex / text.length);
                }
            }, speed);
            
            return () => clearTimeout(timer);
        } else {
            setIsTyping(false);
            
            if (onTypingComplete) {
                onTypingComplete();
            }
        }
    }, [charIndex, text, speed, onTypingComplete, onTypingProgress, skip]);
    
    return (
        <div className="whitespace-pre-wrap">
            {formatMath ? formatMathExpression(displayText) : displayText}
            {isTyping && <span className="animate-pulse">▋</span>}
        </div>
    );
}