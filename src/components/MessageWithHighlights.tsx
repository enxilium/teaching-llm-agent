import React from 'react';
import RenderMathExpression from './RenderMathExpression';

interface MessageWithHighlightsProps {
    text: string;
}

const MessageWithHighlights: React.FC<MessageWithHighlightsProps> = ({ text }) => {
    // Define colors for each participant
    const mentionColors: Record<string, string> = {
        '@User': 'text-blue-400 font-semibold',
        '@Alice': 'text-green-400 font-semibold', 
        '@Charlie': 'text-purple-400 font-semibold',
        '@Bob': 'text-orange-400 font-semibold'
    };

    // Function to parse text and highlight @ mentions
    const parseTextWithHighlights = (inputText: string) => {
        // Regex to find @mentions
        const mentionRegex = /@(User|Alice|Charlie|Bob)/g;
        const parts: Array<{ text: string; isMention: boolean; mentionType?: string }> = [];
        let lastIndex = 0;
        let match;

        // Split text by @ mentions
        while ((match = mentionRegex.exec(inputText)) !== null) {
            // Add text before mention
            if (match.index > lastIndex) {
                parts.push({
                    text: inputText.slice(lastIndex, match.index),
                    isMention: false
                });
            }
            
            // Add the mention
            parts.push({
                text: match[0], // @User, @Alice, etc.
                isMention: true,
                mentionType: match[0]
            });
            
            lastIndex = match.index + match[0].length;
        }
        
        // Add remaining text after last mention
        if (lastIndex < inputText.length) {
            parts.push({
                text: inputText.slice(lastIndex),
                isMention: false
            });
        }
        
        // If no mentions found, return the original text
        if (parts.length === 0) {
            parts.push({
                text: inputText,
                isMention: false
            });
        }
        
        return parts;
    };

    const textParts = parseTextWithHighlights(text);

    return (
        <div className="whitespace-pre-wrap break-words text-message">
            {textParts.map((part, index) => {
                if (part.isMention && part.mentionType) {
                    const colorClass = mentionColors[part.mentionType];
                    return (
                        <span
                            key={index}
                            className={`${colorClass} bg-opacity-20 bg-gray-700 px-1 rounded`}
                        >
                            <RenderMathExpression text={part.text} />
                        </span>
                    );
                } else {
                    return (
                        <span key={index}>
                            <RenderMathExpression text={part.text} />
                        </span>
                    );
                }
            })}
        </div>
    );
};

export default MessageWithHighlights;
