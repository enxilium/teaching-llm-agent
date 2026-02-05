"use client";

import { useState, useEffect } from "react";
import { useFlow } from "@/context/FlowContext";

export default function CompletedPage() {
    const { userId, submitAllDataToDatabase, saveSurveyData, flowData } = useFlow();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);

    // Add a useEffect to handle redirection to Prolific after submission
    useEffect(() => {
        if (hasSubmitted) {
            // Only redirect to Prolific in production mode
            if (process.env.NODE_ENV === "development") {
                console.log("🔧 DEV MODE: Prolific redirect disabled");
                return;
            }
            
            // Set a timeout to redirect to Prolific completion URL after 5 seconds
            const redirectTimer = setTimeout(() => {
                window.location.href =
                    "https://app.prolific.com/submissions/complete?cc=C1LIGXU8";
            }, 5000);

            // Clean up timer if component unmounts
            return () => clearTimeout(redirectTimer);
        }
    }, [hasSubmitted]);

    // Add separate state for "other" specifications
    const [otherGender, setOtherGender] = useState("");
    const [otherEducation, setOtherEducation] = useState("");

    const [surveyAnswers, setSurveyAnswers] = useState({
        confusionLevel: "",
        difficultyLevel: "",
        correctnessPerception: "",
        learningAmount: "",
        prosAndCons: "",
        age: "",
        gender: "",
        educationLevel: "",
        postTestMathInterest: "", // Post-experiment math interest
        attentionCheckAnswer: "", // Attention check: how many questions were asked
    });

    // Add agent perception state
    const [agentPerceptions, setAgentPerceptions] = useState({
        bob: {
            competence: "",
            warmth: "",
            helpfulness: "",
            trustworthiness: "",
        },
        charlie: {
            competence: "",
            warmth: "",
            helpfulness: "",
            trustworthiness: "",
        },
        alice: {
            competence: "",
            warmth: "",
            helpfulness: "",
            trustworthiness: "",
        },
    });

    // Determine which agents were present based on lesson type
    const getAgentsInScenario = () => {
        const lessonType = flowData?.lessonType;
        switch (lessonType) {
            case "group":
                return ["charlie", "alice"];
            case "multi":
                return ["bob", "alice", "charlie"];
            case "single":
                return ["bob"];
            case "solo":
                return [];
            default:
                return [];
        }
    };

    const agentsPresent = getAgentsInScenario();
    
    // Debug logging to see which agents are present
    useEffect(() => {
        console.log("🤖 Lesson type:", flowData?.lessonType);
        console.log("🤖 Agents present in scenario:", agentsPresent);
        if (flowData?.sessionData?.[0]?.messages) {
            const agentIds = flowData.sessionData[0].messages
                .filter((msg: any) => msg.sender === "ai")
                .map((msg: any) => msg.agentId);
            console.log("🤖 Agent IDs found in messages:", [...new Set(agentIds)]);
        }
    }, [flowData, agentsPresent]);

    const handleInputChange = (
        e: React.ChangeEvent<
            HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
        >
    ) => {
        const { name, value } = e.target;
        setSurveyAnswers((prev) => {
            const updated = {
                ...prev,
                [name]: value,
            };
            console.log(`[DEBUG] Survey answer updated: ${name} = ${value}`);
            return updated;
        });
    };

    const handleAgentPerceptionChange = (
        agentId: string,
        dimension: string,
        value: string
    ) => {
        setAgentPerceptions((prev) => ({
            ...prev,
            [agentId]: {
                ...prev[agentId as keyof typeof prev],
                [dimension]: value,
            },
        }));
        console.log(`[DEBUG] Agent perception updated: ${agentId}.${dimension} = ${value}`);
    };

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();

        if (isSubmitting) return;
        setIsSubmitting(true);

        try {
            // Format the gender and education level if "other" was selected
            let finalGender = surveyAnswers.gender;
            let finalEducation = surveyAnswers.educationLevel;

            if (surveyAnswers.gender === "other" && otherGender) {
                finalGender = `other: ${otherGender}`;
            }

            if (surveyAnswers.educationLevel === "other" && otherEducation) {
                finalEducation = `other: ${otherEducation}`;
            }

            console.log(
                "✅ Survey submission initiated with data:",
                JSON.stringify({
                    ...surveyAnswers,
                    gender: finalGender,
                    educationLevel: finalEducation,
                })
            );

            // MAP field names to match database schema - these are already correct
            // CRITICAL FIX: Get existing survey data and merge with new data to preserve pre-test data
            const existingSurveyData = flowData?.surveyData || {};
            console.log("🔍 Existing survey data before merge:", existingSurveyData);
            
            // Prepare agent perception data - only include perceptions for agents that were present
            const agentPerceptionData: Record<string, any> = {};
            agentsPresent.forEach(agentId => {
                if (agentPerceptions[agentId as keyof typeof agentPerceptions]) {
                    agentPerceptionData[`${agentId}Perception`] = agentPerceptions[agentId as keyof typeof agentPerceptions];
                }
            });
            
            const newSurveyData = {
                confusionLevel: surveyAnswers.confusionLevel,
                testDifficulty: surveyAnswers.difficultyLevel,
                perceivedCorrectness: surveyAnswers.correctnessPerception,
                learningAmount: surveyAnswers.learningAmount,
                feedback: surveyAnswers.prosAndCons,
                age: surveyAnswers.age,
                gender: finalGender,
                educationLevel: finalEducation,
                postTestMathInterest: surveyAnswers.postTestMathInterest, // Post-experiment math interest
                attentionCheckAnswer: surveyAnswers.attentionCheckAnswer, // Raw answer for attention check
                ...agentPerceptionData, // Include agent perception data
                submittedAt: new Date().toISOString(),
            };
            
            // Merge existing survey data with new survey data
            const formattedSurveyData = {
                ...existingSurveyData, // Preserve existing data (like preTestMathInterest)
                ...newSurveyData, // Add new post-test data
            };
            
            console.log("🔍 New survey data:", newSurveyData);
            console.log("🔍 Agent perception data included:", agentPerceptionData);
            console.log("🔍 Final merged survey data:", formattedSurveyData);

            // First save survey data
            saveSurveyData(formattedSurveyData);
            console.log(
                "Survey data saved to context, waiting to ensure state update..."
            );

            // CRITICAL FIX: Add a short delay to ensure state is updated before database submission
            // This helps prevent race conditions where submission happens before React state updates
            await new Promise((resolve) => setTimeout(resolve, 500));

            try {
                // Verify the survey data has been saved in the flow data
                if (typeof window !== "undefined") {
                    try {
                        const flowDataStr = localStorage.getItem("flowData");
                        if (flowDataStr) {
                            const flowData = JSON.parse(flowDataStr);
                            console.log("Pre-submission flow data:", {
                                hasSurveyData: !!flowData.surveyData,
                                surveyFields: flowData.surveyData
                                    ? Object.keys(flowData.surveyData)
                                    : [],
                                testCount: (flowData.testData || []).length,
                            });

                            // Double-check that survey data exists
                            if (!flowData.surveyData) {
                                // If it doesn't exist, try saving it again
                                console.warn(
                                    "Survey data wasn't found in flowData, saving again..."
                                );
                                saveSurveyData(formattedSurveyData);
                                await new Promise((resolve) =>
                                    setTimeout(resolve, 500)
                                );
                            }
                        }
                    } catch (e) {
                        console.error("Error reading flow data:", e);
                    }
                }

                // Now submit all data to database
                console.log("Starting database submission...");
                await submitAllDataToDatabase();
                console.log("✅ Database submission completed successfully");
                setHasSubmitted(true);
            } catch (submitError) {
                console.error(
                    "❌ Error during database submission:",
                    submitError
                );

                // Last resort - attempt direct API call with verbose error handling
                try {
                    console.log(
                        "Attempting direct survey submission as fallback"
                    );
                    const response = await fetch("/api/submit-survey", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            userId,
                            section: "post-test",
                            data: formattedSurveyData,
                        }),
                    });

                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error(
                            "❌ Direct survey submission failed:",
                            errorText
                        );
                    } else {
                        console.log("✅ Direct survey submission successful");
                        setHasSubmitted(true);
                    }
                } catch (directError) {
                    console.error(
                        "❌ Direct submission also failed:",
                        directError
                    );
                }
            }
        } catch (error) {
            console.error("❌ Error in survey submission process:", error);
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-8">
            <div className="max-w-4xl mx-auto bg-white bg-opacity-10 p-8 rounded-xl text-white">
                {!hasSubmitted ? (
                    <>
                        <p className="mb-6">
                            Please answer the following questions. You must
                            complete these and click submit below to complete
                            the task and get paid.
                        </p>
                        <form onSubmit={handleSubmit} className="space-y-6">
                            <div>
                                <label className="block mb-2">
                                    How confused did you feel during the lesson?
                                </label>
                                <select
                                    name="confusionLevel"
                                    value={surveyAnswers.confusionLevel}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full p-3 bg-white bg-opacity-20 rounded border border-gray-400 text-white"
                                >
                                    <option value="">Select an option</option>
                                    <option value="not_at_all">
                                        Not at all confused
                                    </option>
                                    <option value="slightly">
                                        Slightly confused
                                    </option>
                                    <option value="moderately">
                                        Moderately confused
                                    </option>
                                    <option value="very">Very confused</option>
                                </select>
                            </div>

                            <div>
                                <label className="block mb-2">
                                    How difficult did you find the test
                                    questions?
                                </label>
                                <select
                                    name="difficultyLevel"
                                    value={surveyAnswers.difficultyLevel}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full p-3 bg-white bg-opacity-20 rounded border border-gray-400 text-white"
                                >
                                    <option value="">Select an option</option>
                                    <option value="very_easy">Very easy</option>
                                    <option value="somewhat_easy">
                                        Somewhat easy
                                    </option>
                                    <option value="somewhat_difficult">
                                        Somewhat difficult
                                    </option>
                                    <option value="very_difficult">
                                        Very difficult
                                    </option>
                                </select>
                            </div>

                            <div>
                                <label className="block mb-2">
                                    Do you think you got any of the test questions
                                    right?
                                </label>
                                <select
                                    name="correctnessPerception"
                                    value={surveyAnswers.correctnessPerception}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full p-3 bg-white bg-opacity-20 rounded border border-gray-400 text-white"
                                >
                                    <option value="">Select an option</option>
                                    <option value="yes">Yes</option>
                                    <option value="no">No</option>
                                </select>
                            </div>

                            <div>
                                <label className="block mb-2">
                                    How much did you learn from the lesson?
                                </label>
                                <select
                                    name="learningAmount"
                                    value={surveyAnswers.learningAmount}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full p-3 bg-white bg-opacity-20 rounded border border-gray-400 text-white"
                                >
                                    <option value="">Select an option</option>
                                    <option value="nothing">Nothing</option>
                                    <option value="a_little">A little</option>
                                    <option value="a_lot">A lot</option>
                                </select>
                            </div>

                            <div>
                                <label className="block mb-2">
                                    What were the pros and cons of the lesson
                                    round?
                                </label>
                                <textarea
                                    name="prosAndCons"
                                    value={surveyAnswers.prosAndCons}
                                    onChange={handleInputChange}
                                    required
                                    rows={4}
                                    className="w-full p-3 bg-white bg-opacity-20 rounded border border-gray-400 text-white"
                                    placeholder="Please share your thoughts on how helpful the lesson was and what could be improved..."
                                />
                            </div>

                            <div>
                                <label className="block mb-2">
                                    How interested are you in mathematics?
                                </label>
                                <select
                                    name="postTestMathInterest"
                                    value={surveyAnswers.postTestMathInterest}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full p-3 bg-white bg-opacity-20 rounded border border-gray-400 text-white"
                                >
                                    <option value="">Select an option</option>
                                    <option value="very-interested">Very interested</option>
                                    <option value="somewhat-interested">Somewhat interested</option>
                                    <option value="neutral">Neutral</option>
                                    <option value="somewhat-uninterested">Somewhat uninterested</option>
                                    <option value="very-uninterested">Very uninterested</option>
                                </select>
                            </div>

                            <div>
                                <label className="block mb-2">
                                    How many math questions did you answer in total during this study? (Enter a number)
                                </label>
                                <input
                                    type="number"
                                    name="attentionCheckAnswer"
                                    value={surveyAnswers.attentionCheckAnswer}
                                    onChange={handleInputChange}
                                    required
                                    min="0"
                                    max="20"
                                    className="w-full p-3 bg-white bg-opacity-20 rounded border border-gray-400 text-white"
                                    placeholder="Enter the total number of questions..."
                                />
                            </div>

                            {/* Agent Perception Section - only show if agents were present */}
                            {agentsPresent.length > 0 && (
                                <div className="bg-white bg-opacity-5 p-6 rounded-lg border border-gray-600">
                                    <h3 className="text-xl font-semibold mb-4">
                                        Please rate your perceptions of the learning partners you worked with:
                                    </h3>
                                    
                                    {agentsPresent.map((agentId) => {
                                        const agentNames = {
                                            bob: "Bob (the tutor)",
                                            charlie: "Charlie",
                                            alice: "Alice"
                                        };
                                        
                                        const agentName = agentNames[agentId as keyof typeof agentNames];
                                        
                                        return (
                                            <div key={agentId} className="mb-6 p-4 bg-white bg-opacity-5 rounded">
                                                <h4 className="text-lg font-medium mb-3">{agentName}</h4>
                                                
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div>
                                                        <label className="block mb-2 text-sm">
                                                            How competent did {agentId === 'bob' ? 'Bob' : agentId === 'charlie' ? 'Charlie' : 'Alice'} seem at mathematics?
                                                        </label>
                                                        <select
                                                            value={agentPerceptions[agentId as keyof typeof agentPerceptions].competence}
                                                            onChange={(e) => handleAgentPerceptionChange(agentId, 'competence', e.target.value)}
                                                            required
                                                            className="w-full p-2 bg-white bg-opacity-20 rounded border border-gray-400 text-white text-sm"
                                                        >
                                                            <option value="">Select...</option>
                                                            <option value="very_competent">Very competent</option>
                                                            <option value="somewhat_competent">Somewhat competent</option>
                                                            <option value="neutral">Neutral</option>
                                                            <option value="somewhat_incompetent">Somewhat incompetent</option>
                                                            <option value="very_incompetent">Very incompetent</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block mb-2 text-sm">
                                                            How warm and friendly did {agentId === 'bob' ? 'Bob' : agentId === 'charlie' ? 'Charlie' : 'Alice'} seem?
                                                        </label>
                                                        <select
                                                            value={agentPerceptions[agentId as keyof typeof agentPerceptions].warmth}
                                                            onChange={(e) => handleAgentPerceptionChange(agentId, 'warmth', e.target.value)}
                                                            required
                                                            className="w-full p-2 bg-white bg-opacity-20 rounded border border-gray-400 text-white text-sm"
                                                        >
                                                            <option value="">Select...</option>
                                                            <option value="very_warm">Very warm and friendly</option>
                                                            <option value="somewhat_warm">Somewhat warm and friendly</option>
                                                            <option value="neutral">Neutral</option>
                                                            <option value="somewhat_cold">Somewhat cold and unfriendly</option>
                                                            <option value="very_cold">Very cold and unfriendly</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block mb-2 text-sm">
                                                            How helpful was {agentId === 'bob' ? 'Bob' : agentId === 'charlie' ? 'Charlie' : 'Alice'} to your learning?
                                                        </label>
                                                        <select
                                                            value={agentPerceptions[agentId as keyof typeof agentPerceptions].helpfulness}
                                                            onChange={(e) => handleAgentPerceptionChange(agentId, 'helpfulness', e.target.value)}
                                                            required
                                                            className="w-full p-2 bg-white bg-opacity-20 rounded border border-gray-400 text-white text-sm"
                                                        >
                                                            <option value="">Select...</option>
                                                            <option value="very_helpful">Very helpful</option>
                                                            <option value="somewhat_helpful">Somewhat helpful</option>
                                                            <option value="neutral">Neutral</option>
                                                            <option value="somewhat_unhelpful">Somewhat unhelpful</option>
                                                            <option value="very_unhelpful">Very unhelpful</option>
                                                        </select>
                                                    </div>

                                                    <div>
                                                        <label className="block mb-2 text-sm">
                                                            How trustworthy did you find {agentId === 'bob' ? 'Bob' : agentId === 'charlie' ? 'Charlie' : 'Alice'}?
                                                        </label>
                                                        <select
                                                            value={agentPerceptions[agentId as keyof typeof agentPerceptions].trustworthiness}
                                                            onChange={(e) => handleAgentPerceptionChange(agentId, 'trustworthiness', e.target.value)}
                                                            required
                                                            className="w-full p-2 bg-white bg-opacity-20 rounded border border-gray-400 text-white text-sm"
                                                        >
                                                            <option value="">Select...</option>
                                                            <option value="very_trustworthy">Very trustworthy</option>
                                                            <option value="somewhat_trustworthy">Somewhat trustworthy</option>
                                                            <option value="neutral">Neutral</option>
                                                            <option value="somewhat_untrustworthy">Somewhat untrustworthy</option>
                                                            <option value="very_untrustworthy">Very untrustworthy</option>
                                                        </select>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            <div>
                                <label className="block mb-2">
                                    What is your age?
                                </label>
                                <input
                                    type="number"
                                    name="age"
                                    value={surveyAnswers.age}
                                    onChange={handleInputChange}
                                    required
                                    min="18"
                                    max="100"
                                    className="w-full p-3 bg-white bg-opacity-20 rounded border border-gray-400 text-white"
                                    placeholder="Enter your age..."
                                />
                            </div>

                            <div>
                                <label className="block mb-2">
                                    What is your gender?
                                </label>
                                <select
                                    name="gender"
                                    value={surveyAnswers.gender}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full p-3 bg-white bg-opacity-20 rounded border border-gray-400 text-white"
                                >
                                    <option value="">Select an option</option>
                                    <option value="male">Male</option>
                                    <option value="female">Female</option>
                                    <option value="other">
                                        Other (please specify)
                                    </option>
                                    <option value="prefer_not_to_answer">
                                        Prefer not to answer
                                    </option>
                                </select>
                                {surveyAnswers.gender === "other" && (
                                    <input
                                        type="text"
                                        name="otherGender"
                                        value={otherGender}
                                        onChange={(e) =>
                                            setOtherGender(e.target.value)
                                        }
                                        required
                                        className="w-full mt-2 p-3 bg-white bg-opacity-20 rounded border border-gray-400 text-white"
                                        placeholder="Please specify your gender..."
                                    />
                                )}
                            </div>

                            <div>
                                <label className="block mb-2">
                                    Highest level of education completed
                                </label>
                                <select
                                    name="educationLevel"
                                    value={surveyAnswers.educationLevel}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full p-3 bg-white bg-opacity-20 rounded border border-gray-400 text-white"
                                >
                                    <option value="">Select an option</option>
                                    <option value="high_school">
                                        High School
                                    </option>
                                    <option value="some_college">
                                        Some College
                                    </option>
                                    <option value="associates">
                                        Associate&apos;s Degree
                                    </option>
                                    <option value="bachelors">
                                        Bachelor&apos;s Degree
                                    </option>
                                    <option value="masters">
                                        Master&apos;s Degree
                                    </option>
                                    <option value="doctorate">
                                        Doctorate or Professional Degree
                                    </option>
                                    <option value="other">
                                        Other (please specify)
                                    </option>
                                </select>
                                {surveyAnswers.educationLevel === "other" && (
                                    <input
                                        type="text"
                                        name="otherEducation"
                                        value={otherEducation}
                                        onChange={(e) =>
                                            setOtherEducation(e.target.value)
                                        }
                                        required
                                        className="w-full mt-2 p-3 bg-white bg-opacity-20 rounded border border-gray-400 text-white"
                                        placeholder="Please specify your education level..."
                                    />
                                )}
                            </div>

                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className={`px-6 py-3 rounded-lg ${
                                    isSubmitting
                                        ? "bg-gray-500 cursor-not-allowed"
                                        : "bg-blue-600 hover:bg-blue-700"
                                } text-white font-medium flex items-center justify-center`}
                            >
                                {isSubmitting ? (
                                    <>
                                        <svg
                                            className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                                            xmlns="http://www.w3.org/2000/svg"
                                            fill="none"
                                            viewBox="0 0 24 24"
                                        >
                                            <circle
                                                className="opacity-25"
                                                cx="12"
                                                cy="12"
                                                r="10"
                                                stroke="currentColor"
                                                strokeWidth="4"
                                            ></circle>
                                            <path
                                                className="opacity-75"
                                                fill="currentColor"
                                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                                            ></path>
                                        </svg>
                                        Submitting...
                                    </>
                                ) : (
                                    "Submit Survey & Complete"
                                )}
                            </button>
                        </form>
                    </>
                ) : (
                    <div className="text-center">
                        <h1 className="text-4xl font-bold mb-4">
                            Submission Successful
                        </h1>
                        <p className="text-lg opacity-90">
                            You&apos;ve successfully completed the study.
                        </p>
                        <p className="text-lg opacity-90">
                            Your data has been submitted, and you&apos;ll be
                            redirected to Prolific shortly.
                        </p>
                        <p className="text-lg opacity-90">
                            Thank you for your participation!
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}
