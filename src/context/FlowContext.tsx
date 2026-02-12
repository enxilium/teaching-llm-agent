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
    QuestionSubmission,
    LegacyCategoryVariation,
    PreSurveyData,
    checkAnswerCorrectness,
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
    flowData: ExperimentData;
    selectedCategoryIndices: number[];
    categoryVariations: LegacyCategoryVariation[];

    // Session management methods
    saveQuestionSubmission: (submission: QuestionSubmission) => void;
    saveSessionData: (sessionData: SessionData) => void;
    saveTestData: (testData: TestData) => void;
    saveSurveyData: (surveyData: SurveyData) => void;
    savePreSurvey: (data: PreSurveyData) => void;

    // Flow progression methods
    agreeToTerms: () => void;
    completeIntro: () => void;
    completePreSurvey: (mathInterest: number) => void;
    completeLesson: () => void;
    completeGame: () => void;
    completeTest: () => Promise<boolean>;
    resetFlow: () => void;

    // Final data submission method
    submitAllDataToDatabase: () => Promise<void>;

    // Development only - scenario override
    overrideLessonType: (lessonType: LessonType) => void;
}

// Default flow data
const defaultFlowData: ExperimentData = {
    userId: "",
    currentStage: "terms",
    lessonType: null,
    lessonQuestionIndex: 0,
    testQuestionIndex: 0,
    selectedCategoryIndices: [],
    categoryVariations: [],
    scenarioFixed: false,
    preSurvey: null,
    questionSubmissions: [],
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
    flowData: defaultFlowData,
    selectedCategoryIndices: [],
    categoryVariations: [],

    saveQuestionSubmission: () => {},
    saveSessionData: () => {},
    saveTestData: () => {},
    saveSurveyData: () => {},
    savePreSurvey: () => {},

    agreeToTerms: () => {},
    completeIntro: () => {},
    completePreSurvey: () => {},
    completeLesson: () => {},
    completeGame: () => {},
    completeTest: async () => true,
    resetFlow: () => {},
    submitAllDataToDatabase: async () => {},
    overrideLessonType: () => {},
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
        lessonQuestionIndex = 0,
        testQuestionIndex = 0,
        selectedCategoryIndices = [],
        categoryVariations = [],
        hitId,
        assignmentId,
    } = flowData;

    // Clear flow and start fresh
    const resetFlow = useCallback(() => {
        console.log("🔄 RESETFLOW CALLED - Starting fresh flow initialization");
        
        let newUserId = "test" + Math.floor(Math.random() * 10000);
        let hitId = "hit" + Math.floor(Math.random() * 10000);
        let assignmentId = "";

        if (typeof window !== "undefined") {
            const urlParams = new URLSearchParams(window.location.search);
            const workerIdParam = urlParams.get("workerId");
            const hitIdParam = urlParams.get("hitId");
            const assignmentIdParam = urlParams.get("assignmentId");

            if (workerIdParam) newUserId = workerIdParam;
            if (hitIdParam) hitId = hitIdParam;
            if (assignmentIdParam) assignmentId = assignmentIdParam;
        }

        // Randomly assign scenario (assuming users won't refresh)
        const lessonTypes: LessonType[] = ["group", "multi", "single", "solo"];
        const lessonTypeIndex = Math.floor(Math.random() * lessonTypes.length);
        const selectedLessonType = lessonTypes[lessonTypeIndex];

        // Generate seed for category selection based on userId
        let scenarioSeed = 5381;
        for (let i = 0; i < newUserId.length; i++) {
            scenarioSeed = ((scenarioSeed << 5) + scenarioSeed) ^ newUserId.charCodeAt(i);
        }
        scenarioSeed = Math.abs(scenarioSeed);

        // Randomly sample 2 types of questions from a pool of 5
        // We use a seeded random generator based on userId to ensure consistency
        const totalCategories = 5;
        const indices = Array.from({ length: totalCategories }, (_, i) => i);
        
        // Fisher-Yates shuffle seeded with scenarioSeed
        let seed = scenarioSeed;
        const random = () => {
             const x = Math.sin(seed++) * 10000;
             return x - Math.floor(x);
        };

        for (let i = indices.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [indices[i], indices[j]] = [indices[j], indices[i]];
        }
        
        const selectedCategories = indices.slice(0, 2);
        console.log(`QUESTIONS SELECTED: Categories ${selectedCategories.join(", ")}`);

        // Randomly assign variations (0 or 1) for the lesson phase
        // testVariation is the opposite of lessonVariation
        const categoryVariations = selectedCategories.map(catIndex => {
            const lessonVar = Math.floor(random() * 2);
            return {
                categoryIndex: catIndex,
                lessonVariation: lessonVar,
                testVariation: lessonVar === 0 ? 1 : 0
            };
        });

        const newFlowData: ExperimentData = {
            ...defaultFlowData,
            userId: newUserId,
            hitId: hitId,
            assignmentId: assignmentId,
            lessonType: selectedLessonType,
            lessonQuestionIndex: 0,
            testQuestionIndex: 0,
            selectedCategoryIndices: selectedCategories,
            categoryVariations: categoryVariations,
            scenarioFixed: true,
        };

        setFlowData(newFlowData);

        if (typeof window !== "undefined") {
            localStorage.setItem("flowData", JSON.stringify(newFlowData));
        }

        if (router) {
            router.push("/");
        }
    }, [router]);

    // Development only - override lesson type
    const overrideLessonType = useCallback((newLessonType: LessonType) => {
        const updatedFlowData = {
            ...flowData,
            lessonType: newLessonType,
        };
        setFlowData(updatedFlowData);
        if (typeof window !== "undefined") {
            localStorage.setItem("flowData", JSON.stringify(updatedFlowData));
        }
    }, [flowData]);

    // Initialize or reset flow on load
    useEffect(() => {
        // Prevent double initialization
        if (initialized) return;

        if (typeof window !== "undefined") {
            // Clear localStorage on every page load to allow testing different scenarios
            localStorage.removeItem("flowData");
            console.log("🧹 Cleared flowData from localStorage for fresh start");
            
            resetFlow();
            setInitialized(true);
        }
    }, [initialized, resetFlow]);

    // Update localStorage
    useEffect(() => {
        if (initialized && typeof window !== "undefined") {
            localStorage.setItem("flowData", JSON.stringify(flowData));
        }
    }, [flowData, initialized]);

    // New unified save method for question submissions
    const saveQuestionSubmission = useCallback((submission: QuestionSubmission) => {
        // Sanitize messages
        const sanitizedMessages = Array.isArray(submission.messages)
            ? submission.messages.map((msg: Message) => ({
                    ...msg,
                    text: typeof msg.text === "string" ? msg.text : String(msg.text || ""),
                    timestamp: typeof msg.timestamp === 'string'
                        ? msg.timestamp
                        : new Date().toISOString(),
                }))
            : [];

        const sanitizedSubmission: QuestionSubmission = {
            ...submission,
            messages: sanitizedMessages,
            scratchboardContent: submission.scratchboardContent || "",
            lessonType: lessonType,
        };

        setFlowData((prev) => {
            // Check if we already have a submission for this phase+index
            const existingIndex = (prev.questionSubmissions || []).findIndex(
                (s) => s.phase === submission.phase && s.questionIndex === submission.questionIndex
            );

            let updatedSubmissions;
            if (existingIndex >= 0) {
                updatedSubmissions = [...(prev.questionSubmissions || [])];
                updatedSubmissions[existingIndex] = sanitizedSubmission;
            } else {
                updatedSubmissions = [...(prev.questionSubmissions || []), sanitizedSubmission];
            }

            return {
                ...prev,
                questionSubmissions: updatedSubmissions,
            };
        });
    }, [lessonType]);

    // Legacy method - still works but converts to new format internally
    const saveSessionData = (sessionData: SessionData) => {
        // Sanitize messages
        const messagesCopy = Array.isArray(sessionData.messages)
            ? sessionData.messages.map((msg: Message) => ({
                    ...msg,
                    text: typeof msg.text === "string" ? msg.text : String(msg.text || ""),
                    timestamp: typeof msg.timestamp === 'string'
                        ? msg.timestamp
                        : new Date(msg.timestamp || Date.now()).toISOString(),
                }))
            : [];

        const sanitizedSessionData = {
            ...sessionData,
            scratchboardContent: sessionData.scratchboardContent || "",
            messages: messagesCopy,
            lessonType: lessonType,
            hitId: hitId,
        };

        setFlowData((prev) => {
            const existingEntryIndex = prev.sessionData?.findIndex(
                (entry) => entry.questionId === sessionData.questionId
            );

            let updatedSessionData;
            if (existingEntryIndex >= 0) {
                updatedSessionData = [...(prev.sessionData || [])];
                updatedSessionData[existingEntryIndex] = {
                    ...sanitizedSessionData,
                    userId,
                    _savedAt: new Date().toISOString(),
                } as SessionData;
            } else {
                updatedSessionData = [
                    ...(prev.sessionData || []),
                    {
                        ...sanitizedSessionData,
                        userId,
                        _savedAt: new Date().toISOString(),
                    } as SessionData,
                ];
            }

            return {
                ...prev,
                sessionData: updatedSessionData,
            };
        });
    };

    const saveTestData = (testData: TestData) => {
        const normalizedTestData = {
            ...testData,
            submissionId: testData.submissionId || Date.now().toString(),
            questions: Array.isArray(testData.questions)
                ? testData.questions.map((q: TestQuestion) => ({
                      ...q,
                      userAnswer: q.userAnswer || "No answer provided",
                      isCorrect: Boolean(q.isCorrect),
                  }))
                : [],
        };

        setFlowData((prev) => {
            // Append to test data (since we might have multiple test entries now)
             return {
                ...prev,
                testData: [...prev.testData, normalizedTestData],
            };
        });
    };

    const saveSurveyData = useCallback((data: SurveyData) => {
        setFlowData((prev) => ({
            ...prev,
            surveyData: { ...(prev.surveyData || {}), ...data, completedAt: new Date().toISOString() },
        }));
    }, []);

    // Save pre-survey data (math interest before lessons)
    const savePreSurvey = useCallback((data: PreSurveyData) => {
        setFlowData((prev) => ({
            ...prev,
            preSurvey: data,
        }));
    }, []);

    // Flow progression
    const agreeToTerms = () => {
        setFlowData((prev) => ({ ...prev, currentStage: "intro" }));
        router.push("/intro");
    };

    const completeIntro = () => {
        // After intro, go to pre-survey first
        setFlowData((prev) => ({ ...prev, currentStage: "pre-survey" }));
        router.push("/pre-survey");
    };

    // Complete pre-survey and save math interest
    const completePreSurvey = useCallback((mathInterest: number) => {
        const preSurveyData: PreSurveyData = {
            math_interest: mathInterest,
            completed_at: new Date().toISOString(),
        };
        
        setFlowData((prev) => ({ 
            ...prev, 
            preSurvey: preSurveyData,
            currentStage: "lesson", 
            lessonQuestionIndex: 0 
        }));
        router.push(`/${flowData.lessonType || "solo"}`);
    }, [router, flowData.lessonType]);

    const completeLesson = () => {
        if (lessonQuestionIndex < 1) { // 2 questions total (0 and 1)
            // Move to next question
            setFlowData((prev) => ({ 
                ...prev, 
                lessonQuestionIndex: (prev.lessonQuestionIndex || 0) + 1 
            }));
            // Navigate to the lesson page to force component remount with fresh state
            // Using router.push instead of window.location.reload to preserve app state (like captcha)
            router.push(`/${flowData.lessonType || "solo"}?q=${lessonQuestionIndex + 1}`);
        } else {
            // Lesson phase complete, go to Game
            setFlowData((prev) => ({ ...prev, currentStage: "game" }));
            router.push("/break"); // Reuse break folder as game
        }
    };

    const completeGame = () => {
        setFlowData((prev) => ({ ...prev, currentStage: "test", testQuestionIndex: 0 }));
        router.push("/test"); // New test page
    };

    const completeTest = async () => {
        if (testQuestionIndex < 1) { // 2 questions total
            setFlowData((prev) => ({ 
                ...prev, 
                testQuestionIndex: (prev.testQuestionIndex || 0) + 1 
            }));
            // Navigate to test page with query param to force component remount
            // Using router.push instead of window.location.reload to preserve app state
            router.push(`/test?q=${testQuestionIndex + 1}`);
            return false; // Not finished yet
        } else {
            setFlowData((prev) => ({ ...prev, currentStage: "completed" }));
            router.push("/completed");
            return true;
        }
    };

    const submitAllDataToDatabase = async () => {
        // Simplified submission using current state
        let currentFlowData = flowData;
        if (typeof window !== "undefined") {
             const stored = localStorage.getItem("flowData");
             if (stored) currentFlowData = JSON.parse(stored);
        }

        const completeData = {
            ...currentFlowData,
            completedAt: new Date().toISOString(),
        };

        try {
            await saveExperimentData(completeData);
            if (typeof window !== "undefined") {
                localStorage.removeItem("flowData");
            }
        } catch (error) {
            console.error("Submission error", error);
        }
    };

    const value = useMemo(
        () => ({
            userId,
            currentStage: currentStage || 'terms',
            lessonType,
            lessonQuestionIndex: lessonQuestionIndex || 0,
            testQuestionIndex: testQuestionIndex || 0,
            hitId: hitId || '',
            assignmentId: assignmentId || '',
            flowData,
            selectedCategoryIndices,
            categoryVariations,

            saveQuestionSubmission,
            saveSessionData,
            saveTestData,
            saveSurveyData,
            savePreSurvey,

            agreeToTerms,
            completeIntro,
            completePreSurvey,
            completeLesson,
            completeGame,
            completeTest,
            resetFlow,
            submitAllDataToDatabase,
            overrideLessonType,
        }),
        [
            currentStage,
            userId,
            lessonType,
            lessonQuestionIndex,
            testQuestionIndex,
            selectedCategoryIndices,
            categoryVariations,
            hitId,
            assignmentId,
            flowData,
            agreeToTerms,
            completeIntro,
            completePreSurvey,
            completeLesson,
            completeGame,
            completeTest,
            resetFlow,
            saveQuestionSubmission,
            saveSessionData,
            saveSurveyData,
            savePreSurvey,
            saveTestData,
            submitAllDataToDatabase,
            overrideLessonType,
        ]
    );

    return (
        <FlowContext.Provider value={value}>{children}</FlowContext.Provider>
    );
}
