"use client";

import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useMemo,
    useCallback,
} from "react";
import { useRouter } from "next/navigation";
import { saveExperimentData } from "@/lib/storage-service";
import {
    FlowStage,
    LessonType,
    SessionData,
    TestData,
    SurveyData,
    ExperimentData,
    TestQuestion,
    Message,
} from "@/utils/types";

// Define context type
interface FlowContextType {
    userId: string;
    currentStage: FlowStage;
    lessonType: LessonType | null;
    lessonQuestionIndex: number;
    testQuestionIndex: number;
    hitId: string;
    assignmentId: string;

    // Session management methods
    saveSessionData: (sessionData: SessionData) => void;
    saveTestData: (testData: TestData) => void;
    saveSurveyData: (surveyData: SurveyData) => void;

    // Flow progression methods
    agreeToTerms: () => void;
    completeIntro: () => void;
    completePreTest: () => void;
    completeLesson: () => void;
    completeTetrisBreak: () => void;
    completePostTest: () => void;
    completeFinalTest: () => Promise<boolean>;
    resetFlow: () => void;

    // Final data submission method
    submitAllDataToDatabase: () => Promise<void>;
}

// Default flow data
const defaultFlowData: ExperimentData = {
    userId: "",
    currentStage: "terms",
    lessonType: null,
    lessonQuestionIndex: 0,
    testQuestionIndex: 0,
    scenarioFixed: false,
    sessionData: [],
    testData: [],
    surveyData: null,
    testId: "",
    sessionId: "",
    questions: [],
    hitId: "",
    assignmentId: "",
};

// Create context with default values
const FlowContext = createContext<FlowContextType>({
    userId: "",
    currentStage: "terms",
    lessonType: null,
    lessonQuestionIndex: 0,
    testQuestionIndex: 0,
    hitId: "",
    assignmentId: "",

    saveSessionData: () => {},
    saveTestData: () => {},
    saveSurveyData: () => {},

    agreeToTerms: () => {},
    completeIntro: () => {},
    completePreTest: () => {},
    completeLesson: () => {},
    completeTetrisBreak: () => {},
    completePostTest: () => {},
    completeFinalTest: async () => true,
    resetFlow: () => {},
    submitAllDataToDatabase: async () => {},
});

// Hook for accessing the flow context
export const useFlow = () => useContext(FlowContext);

// Create provider component
export function FlowProvider({ children }: { children: React.ReactNode }) {
    const router = useRouter();

    // State to track flow data
    const [flowData, setFlowData] = useState<ExperimentData>(defaultFlowData);
    const [initialized, setInitialized] = useState(false);

    // Extract common values from flowData for easier access
    const {
        userId,
        currentStage,
        lessonType,
        lessonQuestionIndex,
        testQuestionIndex,
        hitId,
        assignmentId,
    } = flowData;

    // Clear flow and start fresh
    const resetFlow = useCallback(() => {
        // Extract workerId, hitId, and assignmentId from URL query parameters if available
        let newUserId = "test" + Math.floor(Math.random() * 10000); // Default fallback for development
        let hitId = "hit" + Math.floor(Math.random() * 10000); // Default fallback for hitId
        let assignmentId = "";

        console.log("========== FLOW INITIALIZATION ==========");

        if (typeof window !== "undefined") {
            const urlParams = new URLSearchParams(window.location.search);
            const workerIdParam = urlParams.get("workerId");
            const hitIdParam = urlParams.get("hitId");
            const assignmentIdParam = urlParams.get("assignmentId");

            // Use workerId as userId if available
            if (workerIdParam) {
                newUserId = workerIdParam;
                console.log(
                    `📋 User ID: ${newUserId} (from workerId parameter)`
                );
            } else {
                console.log(
                    `📋 User ID: ${newUserId} (generated for development)`
                );
            }

            // Store hitId and assignmentId if available
            if (hitIdParam) {
                hitId = hitIdParam;
                console.log(`📋 HIT ID: ${hitId} (from hitId parameter)`);
            } else {
                console.log(`📋 HIT ID: ${hitId} (generated for development)`);
            }

            if (assignmentIdParam) {
                assignmentId = assignmentIdParam;
                console.log(`📋 Assignment ID: ${assignmentId}`);
            }
        }

        // Determine scenario and questions deterministically at the start
        // Use a consistent method based on userId to ensure the same selection across sessions
        let scenarioSeed = 0;
        for (let i = 0; i < newUserId.length; i++) {
            scenarioSeed += newUserId.charCodeAt(i);
        }
        console.log(
            `🔢 Scenario seed value: ${scenarioSeed} (derived from User ID)`
        );

        // Select lesson type (scenario) using deterministic approach
        const lessonTypes: LessonType[] = ["group", "multi", "single", "solo"];
        const lessonTypeIndex = scenarioSeed % lessonTypes.length;
        const selectedLessonType = lessonTypes[lessonTypeIndex];
        console.log(
            `🎯 SCENARIO SELECTION: ${selectedLessonType} (index ${lessonTypeIndex} of ${lessonTypes.length})`
        );

        // Generate a different seed for question selection to make it independent
        let questionSeed = 0;
        // Use a different part of the userId or combine it differently
        for (let i = newUserId.length - 1; i >= 0; i--) {
            questionSeed =
                (questionSeed * 31 + newUserId.charCodeAt(i)) % 1000000007;
        }

        // Select question indices deterministically but independently
        const sessionQuestionIndex = Math.abs(questionSeed % 2); // For small question pool, just use 0 or 1

        // Make sure test question is different from lesson question
        // If sessionQuestionIndex is 0, use 1; if it's 1, use 0
        const testQuestionIndex = sessionQuestionIndex === 0 ? 1 : 0;

        console.log(`❓ QUESTION SELECTIONS:`);
        console.log(
            `   - Lesson question index: ${sessionQuestionIndex} (used in ${selectedLessonType} scenario)`
        );
        console.log(
            `   - Test question index: ${testQuestionIndex} (used in final test)`
        );
        console.log("=========================================");

        const newFlowData: ExperimentData = {
            ...defaultFlowData,
            userId: newUserId,
            hitId: hitId,
            assignmentId: assignmentId,
            lessonType: selectedLessonType,
            lessonQuestionIndex: sessionQuestionIndex,
            testQuestionIndex: testQuestionIndex,
            scenarioFixed: true,
        };

        setFlowData(newFlowData);

        // Clear local storage and set new flow data
        if (typeof window !== "undefined") {
            localStorage.setItem("flowData", JSON.stringify(newFlowData));
        }

        // Navigate to home
        if (router) {
            router.push("/");
        }
    }, [router]);

    // Initialize or reset flow on load
    useEffect(() => {
        if (typeof window !== "undefined" && !initialized) {
            resetFlow();
            setInitialized(true);
        }
    }, [initialized, resetFlow]); // Explicitly listing dependencies

    // Update localStorage whenever flowData changes
    useEffect(() => {
        if (initialized && typeof window !== "undefined") {
            localStorage.setItem("flowData", JSON.stringify(flowData));
        }
    }, [flowData, initialized]);

    // Save session data method
    const saveSessionData = (sessionData: SessionData) => {
        console.log(
            `💾 Saving session data for question ${
                sessionData.questionId
            } with ${sessionData.messages?.length || 0} messages`
        );

        // Log scratchboardContent to debug
        console.log(
            `💾 Scratchboard content length: ${
                (sessionData.scratchboardContent || "").length
            } characters`
        );

        // CRITICAL: Log message count and validate data
        if (!sessionData.messages || sessionData.messages.length === 0) {
            console.warn(
                "⚠️ No messages in session data - this might indicate an issue"
            );
        } else {
            console.log(
                `💾 First message: ${
                    typeof sessionData.messages[0].text === "string"
                        ? sessionData.messages[0].text.substring(0, 30) + "..."
                        : "non-string content"
                }`
            );

            // Log all message fields for debugging
            console.log(
                `💾 Message fields: ${Object.keys(sessionData.messages[0]).join(
                    ", "
                )}`
            );

            // Check for any messages with missing required fields
            const invalidMessages = sessionData.messages.filter(
                (msg: Message) => !msg.text || !msg.sender || msg.id === undefined
            );

            if (invalidMessages.length > 0) {
                console.warn(
                    `⚠️ Found ${invalidMessages.length} messages with missing required fields`
                );
            }
        }

        // Deep clone messages to avoid mutation issues
        let messagesCopy: Message[] = [];
        try {
            messagesCopy = Array.isArray(sessionData.messages)
                ? sessionData.messages.map((msg: Message) => ({
                      ...msg,
                      // Ensure text is a string
                      text:
                          typeof msg.text === "string"
                              ? msg.text
                              : String(msg.text || ""),
                      // Convert timestamp to ISO string for consistency
                      timestamp:
                          typeof msg.timestamp === 'string'
                              ? msg.timestamp
                              : new Date(msg.timestamp || Date.now()).toISOString(),
                  }))
                : [];

            console.log(
                `💾 Processed ${messagesCopy.length} messages for storage`
            );
        } catch (error) {
            console.error("❌ Error processing messages:", error);
            messagesCopy = [];
        }

        // Ensure scratchboardContent is a string and not undefined/null
        const sanitizedSessionData = {
            ...sessionData,
            scratchboardContent: sessionData.scratchboardContent || "",
            messages: messagesCopy,
            lessonType: lessonType, // Add lessonType from the flow context
            hitId: hitId, // Add hitId from the flow context
        };

        // Update state with atomic operation
        setFlowData((prev) => {
            // Check if we already have an entry for this question
            const existingEntryIndex = prev.sessionData?.findIndex(
                (entry) => entry.questionId === sessionData.questionId
            );

            let updatedSessionData;

            if (existingEntryIndex >= 0) {
                // Update the existing entry instead of adding a new one
                console.log(
                    `💾 Updating existing session data for question ${sessionData.questionId}`
                );
                updatedSessionData = [...(prev.sessionData || [])];
                updatedSessionData[existingEntryIndex] = {
                    ...sanitizedSessionData,
                    userId,
                    lessonType: lessonType,
                    hitId: hitId,
                    _savedAt: new Date().toISOString(),
                    _updated: true, // Mark as updated for debugging
                } as SessionData;
            } else {
                // Add a new entry
                console.log(
                    `💾 Adding new session data for question ${sessionData.questionId}`
                );
                updatedSessionData = [
                    ...(prev.sessionData || []),
                    {
                        ...sanitizedSessionData,
                        userId,
                        lessonType: lessonType,
                        hitId: hitId,
                        _savedAt: new Date().toISOString(),
                    } as SessionData,
                ];
            }

            const updatedData = {
                ...prev,
                sessionData: updatedSessionData,
            };

            // Immediately update localStorage for resilience
            if (typeof window !== "undefined") {
                try {
                    localStorage.setItem(
                        "flowData",
                        JSON.stringify(updatedData)
                    );

                    // Also create a separate backup of this specific session
                    const sessionBackup = {
                        questionId: sanitizedSessionData.questionId,
                        messages: sanitizedSessionData.messages,
                        scratchboardContent:
                            sanitizedSessionData.scratchboardContent,
                        lessonType: lessonType, // Include lessonType in the backup
                        hitId: hitId, // Include hitId in the backup
                        _savedAt: new Date().toISOString(),
                    };
                    localStorage.setItem(
                        `session_backup_${sanitizedSessionData.questionId}`,
                        JSON.stringify(sessionBackup)
                    );

                    console.log(
                        `💾 Session ${sanitizedSessionData.questionId} backed up to localStorage with ${sanitizedSessionData.messages.length} messages, scenario type: ${lessonType}`
                    );
                } catch (e) {
                    console.error("Error saving to localStorage:", e);
                }
            }

            return updatedData;
        });
    };

    // Add this function after saveSessionData to explicitly create backups
    const createBackups = useCallback(() => {
        if (typeof window === "undefined") return;

        console.log("Creating emergency backups of all flow data");

        try {
            // Save full flow context
            localStorage.setItem(
                "flowData_backup",
                JSON.stringify({
                    ...flowData,
                    _backupTime: new Date().toISOString(),
                })
            );

            // Save survey data separately
            if (flowData.surveyData) {
                localStorage.setItem(
                    "surveyData_backup",
                    JSON.stringify({
                        ...flowData.surveyData,
                        _backupTime: new Date().toISOString(),
                    })
                );
            }

            // Save each session individually
            if (flowData.sessionData?.length > 0) {
                flowData.sessionData.forEach((session) => {
                    localStorage.setItem(
                        `session_backup_${session.questionId}`,
                        JSON.stringify({
                            ...session,
                            _backupTime: new Date().toISOString(),
                        })
                    );
                });
            }

            console.log("✅ All emergency backups created successfully");
        } catch (e) {
            console.error("Error creating backups:", e);
        }
    }, [flowData]);

    // Call this function before any major navigation
    useEffect(() => {
        // Create backups when the stage changes
        createBackups();
    }, [currentStage, createBackups]);

    // Update the saveTestData function to include scratchboardContent
    const saveTestData = (testData: TestData) => {
        console.log(`Saving ${testData.testType} test data to flow context`);

        // Create a normalized version of the test data with safe defaults
        const normalizedTestData = {
            testType: testData.testType,
            submissionId: testData.submissionId || Date.now().toString(),
            questions: Array.isArray(testData.questions)
                ? testData.questions.map((q: TestQuestion) => ({
                      questionId: q.questionId || 0,
                      question:
                          typeof q.question === "string" ? q.question : "",
                      userAnswer:
                          typeof q.userAnswer === "string"
                              ? q.userAnswer
                              : "No answer provided",
                      correctAnswer:
                          typeof q.correctAnswer === "string"
                              ? q.correctAnswer
                              : String(q.correctAnswer || ""),
                      isCorrect: Boolean(q.isCorrect),
                      scratchboardContent: q.scratchboardContent || "",
                      duration: q.duration,
                  }))
                : [],
            score: typeof testData.score === "number" ? testData.score : 0,
            completedAt: testData.completedAt || new Date(),
            timeoutOccurred: testData.timeoutOccurred,
            duration: testData.duration,
        };

        // Enhanced duplicate detection - check both test type AND submission ID
        const existingTest = flowData.testData.find(
            (test) => test.testType === normalizedTestData.testType
        );

        if (existingTest) {
            // If we have the same submission ID, it's truly a duplicate - ignore it
            if (existingTest.submissionId === normalizedTestData.submissionId) {
                console.warn(
                    `Ignoring duplicate test submission with ID ${normalizedTestData.submissionId}`
                );
                return; // Don't process the duplicate at all
            }

            // If the IDs differ, it's a replacement - log and proceed
            console.warn(
                `Replacing ${normalizedTestData.testType} test submission`
            );

            // Replace existing test of same type
            setFlowData((prev) => ({
                ...prev,
                testData: prev.testData.map((test) =>
                    test.testType === normalizedTestData.testType
                        ? normalizedTestData
                        : test
                ),
            }));
        } else {
            // Add new test data
            setFlowData((prev) => ({
                ...prev,
                testData: [...prev.testData, normalizedTestData],
            }));
        }

        // Update localStorage for resilience
        setTimeout(() => {
            if (typeof window !== "undefined") {
                try {
                    const updatedFlowData = {
                        ...flowData,
                        testData: [
                            ...flowData.testData.filter(
                                (t) =>
                                    t.testType !== normalizedTestData.testType
                            ),
                            normalizedTestData,
                        ],
                    };
                    localStorage.setItem(
                        "flowData",
                        JSON.stringify(updatedFlowData)
                    );
                    localStorage.setItem(
                        `test_backup_${normalizedTestData.testType}`,
                        JSON.stringify({
                            ...normalizedTestData,
                            _savedAt: new Date().toISOString(),
                        })
                    );
                    console.log(
                        `Updated localStorage with ${normalizedTestData.testType} test data`
                    );
                } catch (e) {
                    console.error(
                        "Failed to save test data to localStorage:",
                        e
                    );
                }
            }
        }, 0);
    };

    // Improve saveSurveyData with better debugging
    const saveSurveyData = useCallback((data: SurveyData) => {
        console.log("💾 Saving survey data:", data);

        // Create timestamp for when survey was completed
        const timestamp = new Date().toISOString();
        const surveyWithTimestamp = { ...data, completedAt: timestamp };

        // CRITICAL FIX: Update localStorage FIRST (synchronously) before React state update
        if (typeof window !== "undefined") {
            try {
                // Create dedicated backup of survey data
                localStorage.setItem(
                    "surveyData_backup",
                    JSON.stringify(surveyWithTimestamp)
                );
                console.log("✅ Created survey data backup in localStorage");

                // Also update the full flowData in localStorage with the new survey data
                const currentFlowData = localStorage.getItem("flowData");
                if (currentFlowData) {
                    const parsedFlowData = JSON.parse(currentFlowData);
                    const updatedFlowData = {
                        ...parsedFlowData,
                        surveyData: surveyWithTimestamp,
                        _lastUpdated: timestamp,
                    };
                    localStorage.setItem(
                        "flowData",
                        JSON.stringify(updatedFlowData)
                    );
                    console.log(
                        "✅ Updated flowData in localStorage with survey data"
                    );
                }
            } catch (e) {
                console.error(
                    "Failed to create survey backup in localStorage:",
                    e
                );
            }
        }

        // Update flow context with survey data
        setFlowData((prev) => {
            const updated = { ...prev, surveyData: surveyWithTimestamp };

            // Already updated localStorage above, but double-check here
            if (typeof window !== "undefined") {
                try {
                    // Verify localStorage was updated correctly
                    const storedSurveyData =
                        localStorage.getItem("surveyData_backup");
                    if (!storedSurveyData) {
                        console.warn(
                            "Survey data not found in localStorage, saving again"
                        );
                        localStorage.setItem(
                            "surveyData_backup",
                            JSON.stringify(surveyWithTimestamp)
                        );
                    }
                } catch (e) {
                    console.error(
                        "Failed to verify localStorage survey data:",
                        e
                    );
                }
            }

            return updated;
        });
    }, []);

    // Stage transition methods
    const agreeToTerms = () => {
        setFlowData((prev) => ({
            ...prev,
            currentStage: "intro",
        }));

        router.push("/intro");
    };

    // Handle the transition from intro to pre-test
    const completeIntro = () => {
        setFlowData((prev) => ({
            ...prev,
            currentStage: "pre-test",
        }));

        router.push("/pretest");
    };

    // Simplified completePreTest function
    const completePreTest = () => {
        console.log("Starting pre-test completion transition");
        
        // Extract the predetermined lesson type
        const selectedLessonType = flowData.lessonType || "solo"; // Default to solo if not set
        console.log(`🎯 Using predetermined lesson type: ${selectedLessonType}`);
        console.log(`🔄 Current flowData:`, {
            currentStage: flowData.currentStage,
            lessonType: flowData.lessonType,
            userId: flowData.userId
        });

        // Update state
        setFlowData((prev) => ({
            ...prev,
            currentStage: "lesson",
        }));

        // Update localStorage
        if (typeof window !== "undefined") {
            localStorage.setItem("currentStage", "lesson");
            console.log(`💾 Updated localStorage currentStage to: lesson`);
        }

        // Navigate with delay to allow state to update
        setTimeout(() => {
            console.log(`🚀 Attempting to navigate to: /${selectedLessonType}`);
            try {
                router.push(`/${selectedLessonType}`);
                console.log(`✅ Navigation command executed successfully`);
            } catch (error) {
                console.error("❌ Navigation error:", error);
                // Fallback direct navigation
                console.log(`🔄 Attempting fallback navigation to: /${selectedLessonType}`);
                window.location.href = `/${selectedLessonType}`;
            }
        }, 300);
    };

    const completeLesson = () => {
        console.log("Starting lesson completion transition...");

        try {
            // CRITICAL: Create backup of flow data before navigation
            if (typeof window !== "undefined") {
                console.log("Creating persistent backup before navigation");
                localStorage.setItem(
                    "flowData_preserved",
                    JSON.stringify(flowData)
                );
                localStorage.setItem("currentStage", "tetris-break");
            }

            // Update the state in a safer way
            setFlowData((prev) => {
                const updated = {
                    ...prev,
                    currentStage: "tetris-break" as FlowStage,
                };

                // Also update localStorage immediately to ensure data persistence
                if (typeof window !== "undefined") {
                    try {
                        localStorage.setItem(
                            "flowData",
                            JSON.stringify(updated)
                        );
                    } catch (e) {
                        console.error(
                            "Error saving to localStorage during transition:",
                            e
                        );
                    }
                }

                return updated;
            });

            // Add a significant delay before navigation to ensure state updates complete
            setTimeout(() => {
                try {
                    // Verify our stage was properly updated
                    const currentSavedStage =
                        localStorage.getItem("currentStage");
                    console.log(
                        `Stage before navigation: ${currentSavedStage}`
                    );

                    if (currentSavedStage !== "tetris-break") {
                        console.warn(
                            "Stage mismatch, forcing correction in localStorage"
                        );
                        localStorage.setItem("currentStage", "tetris-break");
                    }

                    console.log("Navigating to break page...");
                    router.push("/break");
                } catch (error) {
                    console.error("Navigation error:", error);
                    // Emergency fallback
                    window.location.href = "/break";
                }
            }, 600);
        } catch (error) {
            console.error("Error in completeLesson:", error);
            // Last resort emergency redirect
            window.location.href = "/break";
        }
    };

    // Simplified completePostTest function
    const completePostTest = () => {
        console.log("Starting post-test completion transition");

        // Update state
        setFlowData((prev) => ({
            ...prev,
            currentStage: "final-test",
        }));

        // Update localStorage
        if (typeof window !== "undefined") {
            localStorage.setItem("currentStage", "final-test");
        }

        // Navigate with delay
        setTimeout(() => {
            try {
                router.push("/finaltest");
            } catch (error) {
                console.error("Navigation error:", error);
                // Fallback direct navigation
                window.location.href = "/finaltest";
            }
        }, 300);
    };

    const completeTetrisBreak = () => {
        setFlowData((prev) => ({
            ...prev,
            currentStage: "post-test",
        }));

        router.push("/posttest");
    };

    // The most important method - store everything to database
    const completeFinalTest = async () => {
        console.log(
            "completeFinalTest called - starting final test completion process"
        );

        try {
            // Mark flow as completed with proper type assertion
            setFlowData((prev) => ({
                ...prev,
                currentStage: "completed" as FlowStage, // Add explicit type cast here
            }));

            // IMPORTANT: Just navigate to completed page WITHOUT writing to database
            // All data will be saved after survey submission
            setTimeout(() => {
                router.push("/completed");
            }, 300);

            return true; // Return success boolean as defined in interface
        } catch (error) {
            console.error("Error completing final test:", error);
            return false; // Return failure boolean in case of error
        }
    };

    // Update the submitAllDataToDatabase function with better logging
    const submitAllDataToDatabase = async () => {
        if (!flowData) {
            console.error("No flow data available for submission");
            return;
        }

        console.log("💾 Attempting to submit all data to database...");

        try {
            // Check if we have survey data in the flow context
            let surveyDataToSubmit = flowData.surveyData;

            // If no survey data in flow context, try to recover from dedicated backup
            if (!surveyDataToSubmit) {
                console.log(
                    "⚠️ No survey data found in flow context, attempting recovery from backup..."
                );

                // Try to get from dedicated backup in localStorage
                if (typeof window !== "undefined") {
                    try {
                        const backupData =
                            localStorage.getItem("surveyData_backup");
                        if (backupData) {
                            surveyDataToSubmit = JSON.parse(backupData);
                            console.log(
                                "✅ Recovered survey data from dedicated backup"
                            );
                        }
                    } catch (e) {
                        console.error("Failed to parse backup survey data:", e);
                    }
                }

                // If still no survey data, try to get from flowData in localStorage
                if (!surveyDataToSubmit && typeof window !== "undefined") {
                    try {
                        const storedFlowData = localStorage.getItem("flowData");
                        if (storedFlowData) {
                            const parsedFlowData = JSON.parse(storedFlowData);
                            if (parsedFlowData.surveyData) {
                                surveyDataToSubmit = parsedFlowData.surveyData;
                                console.log(
                                    "✅ Recovered survey data from localStorage flowData"
                                );
                            }
                        }
                    } catch (e) {
                        console.error(
                            "Failed to parse localStorage flowData:",
                            e
                        );
                    }
                }
            }

            // Get sessionData and ensure it's an array
            let sessionDataToSubmit = flowData.sessionData || [];

            // WARNING: Check if sessionData is empty - this shouldn't happen unless something went wrong
            if (!sessionDataToSubmit || sessionDataToSubmit.length === 0) {
                console.error(
                    "⚠️ CRITICAL: No session data found in flow context! Attempting recovery..."
                );

                // Try to get from localStorage backup
                if (typeof window !== "undefined") {
                    try {
                        const storedFlowData = localStorage.getItem("flowData");
                        if (storedFlowData) {
                            const parsedFlowData = JSON.parse(storedFlowData);
                            if (
                                parsedFlowData.sessionData &&
                                parsedFlowData.sessionData.length > 0
                            ) {
                                sessionDataToSubmit =
                                    parsedFlowData.sessionData;
                                console.log(
                                    `✅ Recovered ${sessionDataToSubmit.length} session entries from localStorage`
                                );
                            }
                        }
                    } catch (e) {
                        console.error(
                            "Failed to parse localStorage flowData for session recovery:",
                            e
                        );
                    }
                }

                // If still no session data, this is a serious problem
                if (sessionDataToSubmit.length === 0) {
                    console.error(
                        "❌ Failed to recover any session data. Creating emergency placeholder to prevent data loss."
                    );

                    // Create an emergency placeholder session to ensure we have at least some data
                    const emergencySession: SessionData = {
                        questionId: 0,
                        questionText:
                            "EMERGENCY RECOVERY - Session data was missing",
                        startTime: new Date(),
                        endTime: new Date(),
                        duration: 0,
                        finalAnswer: JSON.stringify({
                            error: "Session data missing",
                            flowDataKeys: Object.keys(flowData),
                            userId: flowData.userId,
                            lessonType: flowData.lessonType,
                            currentStage: flowData.currentStage,
                        }),
                        scratchboardContent: "",
                        messages: [],
                        isCorrect: false,
                        timeoutOccurred: false,
                    };

                    sessionDataToSubmit = [emergencySession];
                }
            }

            // Validate each session entry before submission
            console.log(
                `🔍 Validating ${sessionDataToSubmit.length} session entries before submission...`
            );

            // Make a deep copy to avoid modifying the original
            sessionDataToSubmit = sessionDataToSubmit.map((session) => {
                // Ensure all required fields are present with valid values
                return {
                    questionId: session.questionId || 0,
                    questionText: session.questionText || "No question text",
                    startTime: session.startTime || new Date(),
                    endTime: session.endTime || new Date(),
                    duration: session.duration || 0,
                    finalAnswer: session.finalAnswer || "",
                    scratchboardContent: session.scratchboardContent || "",
                    // Ensure messages is an array
                    messages: Array.isArray(session.messages)
                        ? session.messages
                        : [],
                    isCorrect: Boolean(session.isCorrect),
                    timeoutOccurred: Boolean(session.timeoutOccurred),
                };
            });

            // Check if questionResponses exists in flowData.questions
            if (
                flowData.questions &&
                Array.isArray(flowData.questions) &&
                flowData.questions.length > 0
            ) {
                // Create a dedicated sessionData entry for questionResponses
                console.log("📝 Adding questionResponses to sessionData");

                // Create a special session data entry that follows the required structure
                const questionResponsesEntry: SessionData = {
                    questionId: 9999, // Special ID to mark this as question responses data
                    questionText: "Question Responses Collection",
                    startTime: new Date(),
                    endTime: new Date(),
                    duration: 0,
                    finalAnswer: JSON.stringify(flowData.questions),
                    scratchboardContent: "",
                    messages: [], // Empty messages array
                    isCorrect: true,
                    timeoutOccurred: false,
                };

                sessionDataToSubmit.push(questionResponsesEntry);
            }

            // Prepare the complete data payload - no separate messages or questionResponses fields
            const completeData = {
                userId: flowData.userId,
                testId: flowData.testId,
                hitId: flowData.hitId,
                assignmentId: flowData.assignmentId,
                completedAt: new Date().toISOString(),
                surveyData: surveyDataToSubmit || {
                    error: "Survey data not found",
                    recoveryAttempted: true,
                },
                sessionId: flowData.sessionId,
                testData: flowData.testData || [],
                sessionData: sessionDataToSubmit,
                lessonType: flowData.lessonType,
            };

            console.log("📤 Submitting with data for user:", flowData.userId);
            console.log("📤 Scenario type (lessonType):", flowData.lessonType);
            console.log("📤 SessionData entries:", sessionDataToSubmit.length);

            // Additional debug logging - log unique question IDs to help debug
            if (sessionDataToSubmit.length > 0) {
                const questionIds = sessionDataToSubmit
                    .map((s) => s.questionId)
                    .sort((a, b) => a - b);
                console.log(
                    "📊 Session questionIds included:",
                    questionIds.join(", ")
                );
            }

            // Use our new failsafe storage service
            try {
                // Try to store data with our failsafe service
                const results = await saveExperimentData(completeData as ExperimentData);

                console.log(
                    "✅ Data successfully saved using failsafe approach:",
                    results
                );

                // Clear localStorage after successful submission
                if (typeof window !== "undefined") {
                    // Keep a backup copy just in case
                    localStorage.setItem(
                        "submitted_data_backup",
                        JSON.stringify({
                            flowData,
                            submittedAt: new Date().toISOString(),
                        })
                    );

                    // Remove working copies
                    localStorage.removeItem("flowData");
                    localStorage.removeItem("surveyData_backup");
                }
            } catch (error) {
                console.error("❌ Failed to submit data:", error);
            }
        } catch (error) {
            console.error("❌ Failed to prepare data for submission:", error);
        }
    };

    // Memoize the context value to prevent unnecessary re-renders
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const value = useMemo(
        () => ({
            userId,
            currentStage: currentStage || 'terms',
            lessonType,
            lessonQuestionIndex: lessonQuestionIndex || 0,
            testQuestionIndex: testQuestionIndex || 0,
            hitId: hitId || '',
            assignmentId: assignmentId || '',

            saveSessionData,
            saveTestData,
            saveSurveyData,

            agreeToTerms,
            completeIntro,
            completePreTest,
            completeLesson,
            completeTetrisBreak,
            completePostTest,
            completeFinalTest,
            resetFlow,
            submitAllDataToDatabase,
        }),
        [
            currentStage,
            userId,
            lessonType,
            lessonQuestionIndex,
            testQuestionIndex,
            hitId,
            assignmentId,
            agreeToTerms,
            completeIntro,
            completePreTest,
            completeLesson,
            completeTetrisBreak,
            completePostTest,
            completeFinalTest,
            resetFlow,
            saveSessionData,
            saveSurveyData,
            saveTestData,
            submitAllDataToDatabase,
        ]
    );

    return (
        <FlowContext.Provider value={value}>{children}</FlowContext.Provider>
    );
}
