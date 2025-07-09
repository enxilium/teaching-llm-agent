"use client";

import { useState, useEffect } from "react";
import { useFlow } from "@/context/FlowContext";

export default function CompletedPage() {
    const { userId, submitAllDataToDatabase, saveSurveyData } = useFlow();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [hasSubmitted, setHasSubmitted] = useState(false);

    // Add a useEffect to handle redirection to Prolific after submission
    useEffect(() => {
        if (hasSubmitted) {
            // Set a timeout to redirect to Prolific completion URL after 5 seconds
            const redirectTimer = setTimeout(() => {
                window.location.href =
                    "https://app.prolific.com/submissions/complete?cc=C14H5P95";
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
    });

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
            const formattedSurveyData = {
                confusionLevel: surveyAnswers.confusionLevel,
                testDifficulty: surveyAnswers.difficultyLevel,
                perceivedCorrectness: surveyAnswers.correctnessPerception,
                learningAmount: surveyAnswers.learningAmount,
                feedback: surveyAnswers.prosAndCons,
                age: surveyAnswers.age,
                gender: finalGender,
                educationLevel: finalEducation,
                submittedAt: new Date().toISOString(),
            };

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
                                    question?
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
                                    Do you think you got the test question
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
                                    How much did you learn from the lesson
                                    (after practice problems)?
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
                                <p>
                                    {" "}
                                    Thank you for participating in this study!{" "}
                                </p>
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
