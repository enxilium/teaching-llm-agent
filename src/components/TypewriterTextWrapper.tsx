import React, { useState, useEffect, useRef } from 'react';
import { InlineMath } from 'react-katex';
import 'katex/dist/katex.min.css';

interface TypewriterTextWrapperProps {
  text: string;
  speed?: number;
  messageId: number;
  onTypingComplete?: () => void;
  onTypingProgress?: (progress: number) => void;
  formatMath?: boolean;
  skip?: boolean;
}

// Helper function to process text with math expressions
const formatMathExpression = (text: string) => {
    if (!text) return text;
    
    // First replace display math \[ \] with $ $ for consistent processing
    text = text.replace(/\\\[(.*?)\\\]/g, '$$$1$');
    
    // Also replace $$ $$ with $ $ if present
    text = text.replace(/\$\$(.*?)\$\$/g, '$$$1$');
    
    // Handle all math delimiters now standardized to $ $
    if (text.includes('$')) {
        return text.split(/(\$.*?\$)/).map((part, index) => {
            if (part.startsWith('$') && part.endsWith('$')) {
                const mathExpression = part.slice(1, -1);
                try {
                    return <InlineMath key={index} math={mathExpression} />;
                } catch (e) {
                    console.error('LaTeX parsing error:', e);
                    return part; // Fallback to raw text if parsing fails
                }
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
    skip = false
}: TypewriterTextWrapperProps) {
    const [displayText, setDisplayText] = useState("");
    const [isTyping, setIsTyping] = useState(true);
    const [wordIndex, setWordIndex] = useState(0);
    const wordsRef = useRef<string[]>([]);
    const completedRef = useRef(false);
    const prevTextRef = useRef(text);
    const textRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLElement | null>(null);
    
    // Find and store the chat container reference
    useEffect(() => {
        // Look for the chat-messages container in the DOM
        chatContainerRef.current = document.querySelector('.chat-messages');
    }, []);
    
    // Helper function to scroll during typing if needed
    const scrollDuringTyping = () => {
        if (!chatContainerRef.current || !textRef.current) return;
        
        const container = chatContainerRef.current;
        const textElement = textRef.current;
        
        const containerBottom = container.scrollTop + container.clientHeight;
        const textBottom = textElement.offsetTop + textElement.clientHeight;
        
        // If the text extends below visible area, scroll to keep it visible
        if (textBottom > containerBottom) {
            container.scrollTop = textBottom - container.clientHeight + 40;
            console.log("Scrolling during typing animation");
        }
    };
    
    // Split text into words on component mount or text change
    useEffect(() => {
        // Split by spaces but keep punctuation with words
        wordsRef.current = text.match(/\S+\s*/g) || [];
    }, [text]);
    
    // Handle skip prop changes to immediately complete typing
    useEffect(() => {
        if (skip && isTyping) {
            setDisplayText(text);
            setWordIndex(wordsRef.current.length);
            setIsTyping(false);
            
            if (onTypingComplete) {
                onTypingComplete();
            }
        }
    }, [skip, text, isTyping, onTypingComplete]);
    
    // Word-based typing effect
    useEffect(() => {
        if (skip) return;
        
        if (wordIndex < wordsRef.current.length) {
            const timer = setTimeout(() => {
                // Add the next chunk of words (1-3 words at a time for more natural flow)
                const chunkSize = Math.min(3, wordsRef.current.length - wordIndex);
                const nextChunk = wordsRef.current.slice(wordIndex, wordIndex + chunkSize).join('');
                
                setDisplayText(prev => prev + nextChunk);
                setWordIndex(wordIndex + chunkSize);
                
                if (onTypingProgress) {
                    onTypingProgress(wordIndex / wordsRef.current.length);
                }
                
                // Scroll after adding new content
                setTimeout(scrollDuringTyping, 10);
                
                // Additional scroll check for line breaks
                if (nextChunk.includes('\n')) {
                    setTimeout(scrollDuringTyping, 50);
                }
            }, speed * 2); // Adjust timing to feel right for word groups
            
            return () => clearTimeout(timer);
        } else {
            setIsTyping(false);
            
            if (onTypingComplete) {
                onTypingComplete();
            }
        }
    }, [wordIndex, speed, onTypingComplete, onTypingProgress, skip]);

    // Make sure onTypingComplete is reliably called
    useEffect(() => {
        if (!isTyping && !completedRef.current) {
            completedRef.current = true;
            if (onTypingComplete) {
                console.log(`Typing complete for message ${messageId}`);
                onTypingComplete();
            }
        }
    }, [isTyping, onTypingComplete, messageId]);

    // Ensure the completion callback is always called and reset on text change
    useEffect(() => {
        if (!isTyping && !completedRef.current) {
            completedRef.current = true;
            if (onTypingComplete) {
                console.log(`TypewriterTextWrapper: Typing complete for message ${messageId}`);
                onTypingComplete();
            }
        }
        
        return () => {
            if (text !== prevTextRef.current) {
                completedRef.current = false;
            }
        };
    }, [isTyping, text, messageId, onTypingComplete]);
    
    return (
        <div 
            ref={textRef}
            className="whitespace-pre-wrap break-words text-message"
        >
            {formatMath ? formatMathExpression(displayText) : displayText}
            {isTyping && <span className="typing-cursor">▋</span>}
        </div>
    );
}