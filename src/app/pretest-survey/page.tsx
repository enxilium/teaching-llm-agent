"use client";

import { useState } from "react";
import { useFlow } from "@/context/FlowContext";

export default function PreTestSurveyPage() {
    const { completePreTestSurvey, saveSurveyData } = useFlow();
    const [mathInterest, setMathInterest] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!mathInterest) {
            alert("Please answer the question before continuing.");
            return;
        }

        console.log("🔄 Form submission started");

        // Save the pre-test survey data
        const surveyData = {
            preTestMathInterest: mathInterest,
            submittedAt: new Date().toISOString(),
        };

        // Save to flow context (will be merged with post-test survey data later)
        saveSurveyData(surveyData);
        console.log("Pre-test survey data saved:", surveyData);

        // Use a longer delay to ensure everything is processed
        setTimeout(() => {
            console.log("🔄 About to call completePreTestSurvey");
            completePreTestSurvey();
        }, 200);
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-8">
            <div className="max-w-2xl mx-auto text-white">
                <h1 className="text-3xl font-bold text-center mb-8">
                    Pre-Test Survey
                </h1>
                
                <div className="bg-white bg-opacity-10 rounded-xl p-8 shadow-lg">
                    <p className="text-lg mb-6">
                        Before we begin the mathematics problems, we'd like to know a little about your background with mathematics.
                    </p>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-xl font-semibold mb-4">
                                How interested are you in mathematics?
                            </label>
                            <div className="space-y-3">
                                {[
                                    { value: "very-interested", label: "Very interested" },
                                    { value: "somewhat-interested", label: "Somewhat interested" },
                                    { value: "neutral", label: "Neutral" },
                                    { value: "somewhat-uninterested", label: "Somewhat uninterested" },
                                    { value: "very-uninterested", label: "Very uninterested" }
                                ].map((option) => (
                                    <label key={option.value} className="flex items-center space-x-3 cursor-pointer">
                                        <input
                                            type="radio"
                                            name="mathInterest"
                                            value={option.value}
                                            checked={mathInterest === option.value}
                                            onChange={(e) => setMathInterest(e.target.value)}
                                            className="w-4 h-4 text-purple-600"
                                        />
                                        <span className="text-lg">{option.label}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="pt-6">
                            <button
                                type="submit"
                                className={`w-full px-8 py-3 rounded-lg text-lg font-semibold ${
                                    mathInterest
                                        ? "bg-purple-600 hover:bg-purple-700 text-white"
                                        : "bg-gray-500 text-gray-300 cursor-not-allowed"
                                }`}
                                disabled={!mathInterest}
                            >
                                Continue to Pre-Test
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
