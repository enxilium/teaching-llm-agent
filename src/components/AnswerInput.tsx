import React from "react";
import RenderMathExpression from "./RenderMathExpression";

interface AnswerInputProps {
    options: Record<string, string> | undefined;
    finalAnswer: string;
    setFinalAnswer: (answer: string) => void;
    handleSend: () => void;
    hasSubmittedAnswer: boolean;
    canSubmit: boolean;
    timeElapsed: number;
    typingMessageIds: number[];
}

const AnswerInput: React.FC<AnswerInputProps> = ({
    options,
    finalAnswer,
    setFinalAnswer,
    handleSend,
    hasSubmittedAnswer,
    canSubmit,
    timeElapsed,
    typingMessageIds,
}) => {
    // Generate letter labels for options (A, B, C, etc.)
    const getLetterLabels = (options: Record<string, string>) => {
        return Object.keys(options).map((key, index) => ({
            letter: String.fromCharCode(65 + index), // A, B, C, etc.
            key,
            value: options[key]
        }));
    };

    const letterLabels = options ? getLetterLabels(options) : [];
    return (
        <div className="bg-white bg-opacity-15 p-4 rounded-md mb-4 border border-blue-500 flex-grow">
            <h3 className="text-lg text-white font-semibold mb-4">
                Select Your Answer
            </h3>
            {options ? (
                <div className="grid grid-cols-2 gap-3 mb-6">
                    {letterLabels.map(({ letter, key, value }) => (
                        <div
                            key={key}
                            onClick={() =>
                                !hasSubmittedAnswer &&
                                setFinalAnswer(value)
                            }
                            className={`cursor-pointer p-4 rounded-md border-2 transition-all ${
                                finalAnswer === value
                                    ? "bg-blue-500 bg-opacity-30 border-blue-500"
                                    : "bg-white bg-opacity-10 border-gray-600 hover:bg-white hover:bg-opacity-20"
                            }`}
                        >
                            <div className="flex items-center">
                                <div
                                    className={`w-6 h-6 mr-3 rounded-full border-2 flex items-center justify-center font-bold ${
                                        finalAnswer === value
                                            ? "border-blue-500 bg-blue-500 text-white"
                                            : "border-gray-400 text-gray-400"
                                    }`}
                                >
                                    {finalAnswer === value ? "✓" : letter}
                                </div>
                                <div className="text-white text-lg">
                                    <RenderMathExpression text={value} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <input
                    type="text"
                    value={finalAnswer}
                    onChange={(e) => setFinalAnswer(e.target.value)}
                    placeholder="Type your final answer here..."
                    className="w-full bg-white bg-opacity-10 text-white border-gray-600 rounded-md px-3 py-2"
                    disabled={hasSubmittedAnswer}
                />
            )}

            {!hasSubmittedAnswer && (
                <div className="flex justify-center">
                    <button
                        onClick={handleSend}
                        disabled={
                            !finalAnswer.trim() ||
                            typingMessageIds.length > 0 ||
                            !canSubmit
                        }
                        className={`px-8 py-3 rounded-lg text-lg font-bold transition-all ${
                            finalAnswer.trim() &&
                            typingMessageIds.length === 0 &&
                            canSubmit
                                ? "bg-green-600 hover:bg-green-700 text-white"
                                : "bg-gray-700 text-gray-400 cursor-not-allowed"
                        }`}
                    >
                        {canSubmit
                            ? "Submit Final Answer"
                            : `Wait ${Math.max(1, 10 - timeElapsed)}s...`}
                    </button>
                </div>
            )}
        </div>
    );
};

export default AnswerInput;
