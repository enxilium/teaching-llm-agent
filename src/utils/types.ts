export type FlowStage =
    | "terms"
    | "intro"
    | "pre-test-survey"
    | "pre-test"
    | "lesson"
    | "tetris-break"
    | "post-test"
    | "final-test"
    | "completed";

export type LessonType = "group" | "multi" | "single" | "solo";

export interface Message {
    id: number;
    sender: string;
    agentId?: string | null;
    text: string;
    timestamp: string;
}

export interface SessionData {
    questionId: number;
    questionText: string;
    startTime: Date;
    endTime: Date;
    duration: number;
    finalAnswer: string;
    scratchboardContent: string;
    messages: Message[];
    isCorrect: boolean;
    timeoutOccurred: boolean;
    lessonType?: LessonType | null;
}

export interface TestQuestion {
    questionId: number;
    question: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
    scratchboardContent?: string;
    duration: number;
    options?: Record<string, string | number>;
}

export interface TestData {
    testType: "pre" | "post" | "final";
    submissionId?: string;
    questions: TestQuestion[];
    score: number;
    completedAt: Date;
    timeoutOccurred?: boolean;
    duration: number;
}

export interface SurveyData {
    confusionLevel?: string;
    testDifficulty?: string;
    perceivedCorrectness?: string;
    learningAmount?: string;
    feedback?: string;
    submittedAt?: string;
    age?: string;
    gender?: string;
    educationLevel?: string;
    preTestMathInterest?: string; // Pre-test math interest
    postTestMathInterest?: string; // Post-test math interest
    // Legacy field for backward compatibility
    mathInterest?: string;
}

export interface Question {
    id?: number;
    question: string;
    options?: Record<string, string> | string[];
    answer: string;
    correctAnswer?: string;
}

export interface ExperimentData {
    userId: string;
    testId?: string;
    surveyData: SurveyData | null;
    sessionData: SessionData[];
    testData: TestData[];
    sessionId?: string;
    questions?: Question[];
    currentStage?: FlowStage;
    lessonType: LessonType | null;
    lessonQuestionIndex?: number;
    testQuestionIndex?: number;
    scenarioFixed?: boolean;
    hitId?: string;
    assignmentId?: string;
    messages?: Message[];
    completedAt?: string | Date;
}

export interface AIModelConfig {
    id: string;
    name: string;
    provider: string;
    maxTokens: number;
    temperature: number;
}

export interface AIServiceOptions {
    model?: string;
    systemPrompt?: string | null;
    temperature?: number;
}

export interface AIProvider {
    generateResponse(
        messages: Message[],
        systemPrompt: string,
        modelId: string
    ): Promise<string>;
}

export interface Piece {
    shape: number[][];
    x: number;
    y: number;
    color: number;
}

export interface AgentThought {
    id: string;
    timestamp: string;
    content: string;
    type: "reasoning" | "question" | "response";
}

export interface AIAgent {
    id: string;
    name: string;
    avatar: string;
    type: "assistant" | "teacher";
    systemPrompt: string;
    model: string;
    thoughts: AgentThought[];
}
