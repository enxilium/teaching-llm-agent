import React, { useEffect, useState, useRef } from 'react';
import TypewriterText from './TypewriterText';

interface TypewriterTextWrapperProps {
    text: string;
    speed?: number;
    messageId: number;
    onTypingProgress?: () => void;
    onTypingComplete?: () => void;
}

// This component "locks in" the text and prevents parent re-renders from restarting the animation
const TypewriterTextWrapper = ({
    text,
    speed,
    messageId,
    onTypingProgress,
    onTypingComplete
}: TypewriterTextWrapperProps) => {
    // Store the initial text to prevent changes from affecting the animation
    const [initialText] = useState(text);
    const isCompletedRef = useRef(false);

    // When animation completes, update our completion status
    const handleComplete = () => {
        if (!isCompletedRef.current) {
            isCompletedRef.current = true;

            // This is critical - only call the parent's complete callback once
            if (onTypingComplete) {
                onTypingComplete();
            }
        }
    };

    // For debugging
    useEffect(() => {
        console.log(`TypewriterTextWrapper mounted for message ${messageId}`);
        return () => {
            console.log(`TypewriterTextWrapper unmounted for message ${messageId}`);
        };
    }, [messageId]);

    // The key part: we use initialText instead of text to prevent prop changes from restarting the animation
    return (
        <TypewriterText
            text={initialText}
            speed={speed}
            onCharacterTyped={onTypingProgress}
            onComplete={handleComplete}
        />
    );
};

export default TypewriterTextWrapper;