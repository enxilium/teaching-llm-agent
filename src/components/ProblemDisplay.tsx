import React from "react";
import { formatTime } from "@/lib/utils";
import RenderMathExpression from "./RenderMathExpression";

interface ProblemDisplayProps {
    question: string;
    timeLeft: number;
    timeElapsed: number;
    hasSubmittedAnswer: boolean;
    isMultiScenario: boolean;
    canSkip?: boolean;
    onSkip?: () => void;
}

const ProblemDisplay: React.FC<ProblemDisplayProps> = ({
    question,
    timeLeft,
    timeElapsed,
    hasSubmittedAnswer,
    isMultiScenario,
    canSkip = false,
    onSkip,
}) => {
    // Only show timer after submission (5-minute countdown)
    const shouldShowTimer = hasSubmittedAnswer;
    const timeToDisplay = timeLeft;

    return (
        <div className="bg-white bg-opacity-20 p-4 rounded-md mb-4 border-2 border-purple-400">
            <div className="flex justify-between items-start mb-2">
                <h2 className="text-xl text-white font-semibold">Problem:</h2>
                <div className="flex items-center gap-2">
                    {shouldShowTimer && (
                        <div className="bg-purple-900 bg-opacity-50 rounded-lg px-3 py-1 text-white">
                            Time: {formatTime(timeToDisplay)}
                        </div>
                    )}
                    {canSkip && onSkip && (
                        <button
                            onClick={onSkip}
                            className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1 rounded-lg text-sm font-semibold transition-colors"
                        >
                            Skip to Next Stage
                        </button>
                    )}
                </div>
            </div>
            <p className="text-white text-lg">
                <RenderMathExpression text={question} />
            </p>
        </div>
    );
};

export default ProblemDisplay;
