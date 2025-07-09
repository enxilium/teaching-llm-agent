import React from "react";
import "katex/dist/katex.min.css";
import { InlineMath } from "react-katex";

interface RenderMathExpressionProps {
    text: string;
}

const RenderMathExpression: React.FC<RenderMathExpressionProps> = ({
    text,
}) => {
    if (!text) return null;

    // Standardize delimiters to single $
    let processedText = text.replace(/\\\[(.*?)\\\]/g, "$$$1$");
    processedText = processedText.replace(/\$\$(.*?)\$\$/g, "$$$1$");

    if (processedText.includes("$")) {
        return (
            <>
                {processedText.split(/(\$.*?\$)/).map((part, index) => {
                    if (part.startsWith("$") && part.endsWith("$")) {
                        const mathExpression = part.slice(1, -1);
                        try {
                            return (
                                <InlineMath key={index} math={mathExpression} />
                            );
                        } catch (e) {
                            console.error("LaTeX parsing error:", e);
                            return <span key={index}>{part}</span>; // Fallback for invalid math
                        }
                    }
                    return <span key={index}>{part}</span>;
                })}
            </>
        );
    }

    return <>{text}</>;
};

export default RenderMathExpression;
