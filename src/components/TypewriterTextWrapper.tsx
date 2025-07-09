import React, { useState, useEffect, useRef } from "react";
import RenderMathExpression from "./RenderMathExpression";
import "katex/dist/katex.min.css";

interface TypewriterTextWrapperProps {
    text: string;
    speed?: number;
    messageId: number;
    onTypingComplete?: (messageId: number) => void;
    onTypingProgress?: () => void;
    formatMath?: boolean;
    skip?: boolean;
}

export default function TypewriterTextWrapper({
    text,
    speed = 50,
    messageId,
    onTypingComplete,
    onTypingProgress,
    formatMath = false,
    skip = false,
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
        chatContainerRef.current = document.querySelector(".chat-messages");
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
                onTypingComplete(messageId);
            }
        }
    }, [skip, text, isTyping, onTypingComplete, messageId]);

    // Word-based typing effect
    useEffect(() => {
        if (skip) return;

        if (wordIndex < wordsRef.current.length) {
            const timer = setTimeout(() => {
                // Add the next chunk of words (1-3 words at a time for more natural flow)
                const chunkSize = Math.min(
                    3,
                    wordsRef.current.length - wordIndex
                );
                const nextChunk = wordsRef.current
                    .slice(wordIndex, wordIndex + chunkSize)
                    .join("");

                setDisplayText((prev) => prev + nextChunk);
                setWordIndex(wordIndex + chunkSize);

                if (onTypingProgress) {
                    onTypingProgress();
                }

                // Scroll after adding new content
                setTimeout(scrollDuringTyping, 10);

                // Additional scroll check for line breaks
                if (nextChunk.includes("\n")) {
                    setTimeout(scrollDuringTyping, 50);
                }
            }, speed * 2); // Adjust timing to feel right for word groups

            return () => clearTimeout(timer);
        } else {
            setIsTyping(false);

            if (onTypingComplete) {
                onTypingComplete(messageId);
            }
        }
    }, [wordIndex, speed, onTypingComplete, onTypingProgress, skip, messageId]);

    // Make sure onTypingComplete is reliably called
    useEffect(() => {
        if (!isTyping && !completedRef.current) {
            completedRef.current = true;
            if (onTypingComplete) {
                console.log(`Typing complete for message ${messageId}`);
                onTypingComplete(messageId);
            }
        }
    }, [isTyping, onTypingComplete, messageId]);

    // Ensure the completion callback is always called and reset on text change
    useEffect(() => {
        const prevText = prevTextRef.current;
        if (!isTyping && !completedRef.current) {
            completedRef.current = true;
            if (onTypingComplete) {
                console.log(
                    `TypewriterTextWrapper: Typing complete for message ${messageId}`
                );
                onTypingComplete(messageId);
            }
        }

        return () => {
            if (text !== prevText) {
                completedRef.current = false;
            }
        };
    }, [isTyping, text, messageId, onTypingComplete]);

    return (
        <div
            ref={textRef}
            className="whitespace-pre-wrap break-words text-message"
        >
            {formatMath ? (
                <RenderMathExpression text={displayText} />
            ) : (
                displayText
            )}
            {isTyping && <span className="typing-cursor">▋</span>}
        </div>
    );
}
