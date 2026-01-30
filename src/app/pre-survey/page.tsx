"use client";

import { useState } from "react";
import { useFlow } from "@/context/FlowContext";

export default function PreSurveyPage() {
    const { completePreSurvey } = useFlow();
    const [mathInterest, setMathInterest] = useState<number | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = () => {
        if (mathInterest === null) return;
        
        setIsSubmitting(true);
        completePreSurvey(mathInterest);
    };

    const interestLabels = [
        { value: 1, label: "Not interested at all" },
        { value: 2, label: "Slightly interested" },
        { value: 3, label: "Moderately interested" },
        { value: 4, label: "Very interested" },
        { value: 5, label: "Extremely interested" },
    ];

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-8">
            <div className="max-w-2xl mx-auto">
                <div className="bg-purple-900 bg-opacity-50 p-8 rounded-lg border border-purple-500">
                    <h1 className="text-3xl font-bold text-white text-center mb-6">
                        Before We Begin
                    </h1>
                    
                    <p className="text-gray-300 text-center mb-8">
                        Please answer the following question before starting the practice problems.
                    </p>

                    <div className="mb-8">
                        <h2 className="text-xl text-white font-semibold mb-4 text-center">
                            How interested are you in mathematics?
                        </h2>
                        
                        <div className="space-y-3">
                            {interestLabels.map(({ value, label }) => (
                                <button
                                    key={value}
                                    onClick={() => setMathInterest(value)}
                                    className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                                        mathInterest === value
                                            ? "border-purple-400 bg-purple-600 text-white"
                                            : "border-gray-600 bg-white/10 text-gray-300 hover:border-purple-400 hover:bg-white/20"
                                    }`}
                                >
                                    <div className="flex items-center">
                                        <div className={`w-6 h-6 rounded-full border-2 mr-4 flex items-center justify-center ${
                                            mathInterest === value
                                                ? "border-white bg-white"
                                                : "border-gray-400"
                                        }`}>
                                            {mathInterest === value && (
                                                <div className="w-3 h-3 rounded-full bg-purple-600" />
                                            )}
                                        </div>
                                        <span className="text-lg">
                                            <span className="font-bold mr-2">{value}.</span>
                                            {label}
                                        </span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex justify-center">
                        <button
                            onClick={handleSubmit}
                            disabled={mathInterest === null || isSubmitting}
                            className={`px-8 py-3 rounded-lg text-lg font-bold transition-all ${
                                mathInterest !== null && !isSubmitting
                                    ? "bg-green-600 hover:bg-green-700 text-white"
                                    : "bg-gray-700 text-gray-400 cursor-not-allowed"
                            }`}
                        >
                            {isSubmitting ? "Continuing..." : "Continue to Practice Problems"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
