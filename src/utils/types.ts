// =============================================================================
// FLOW STAGES AND LESSON TYPES
// =============================================================================

export type FlowStage =
    | "terms"
    | "intro"
    | "pre-survey"    // Pre-contextual survey before practice
    | "lesson"        // Practice section
    | "game"          // Break/Tetris
    | "test"          // Test section
    | "completed";    // Post-survey + completion

// Condition types - note: "group" internally maps to "peers" in output schema
export type LessonType = "group" | "multi" | "single" | "solo";

// Output condition type for Firebase (group -> peers)
export type ConditionType = "multi" | "single" | "peers" | "solo";

// =============================================================================
// CHAT MESSAGES
// =============================================================================

export interface Message {
    id: number;
    sender: string;       // 'user' or 'ai'
    agentId?: string | null;  // Agent ID if sender is 'ai' (bob, alice, charlie)
    text: string;
    timestamp: string;    // ISO date string
}

// =============================================================================
// QUESTION RESPONSES (matches Firebase schema QuestionResponse)
// =============================================================================

export interface QuestionResponse {
    question_index: number;           // 0 for Q1, 1 for Q2
    category_id: string;              // Category ID (e.g., "probability", "algebra")
    question_text: string;
    correct_answer: string;
    answer_text: string;              // User's typed answer (validated as number)
    is_correct: boolean;
    question_load_time: string;       // ISO timestamp when question was displayed
    answer_submit_time: string;       // ISO timestamp when answer was submitted
    skip_button_click_time: string | null;  // ISO timestamp or null if not skipped
    duration_seconds: number;
    scratchboard_content: string;
    chat_messages: Message[];         // Chat messages (empty for test section)
}

// =============================================================================
// SURVEY DATA
// =============================================================================

export interface PreSurveyData {
    math_interest: number;            // 1-5 scale
    completed_at: string;             // ISO timestamp
}

export interface AgentPerception {
    competence: string;
    warmth: string;
    helpfulness: string;
    trustworthiness: string;
}

export interface PostSurveyData {
    confusion_level?: string;
    difficulty_level?: string;
    correctness_perception?: string;
    learning_amount?: string;
    pros_and_cons?: string;
    age?: string;
    gender?: string;
    education_level?: string;
    post_math_interest?: number;      // 1-5 scale
    passed_attention_check?: boolean; // True if user answered "4" to question count
    agent_perceptions?: {
        bob?: AgentPerception;
        alice?: AgentPerception;
        charlie?: AgentPerception;
    };
    completed_at?: string;
}

// =============================================================================
// SECTIONS
// =============================================================================

export interface PracticeSection {
    questions: QuestionResponse[];    // Exactly 2 questions
}

export interface TestSection {
    questions: QuestionResponse[];    // Exactly 2 questions
}

// =============================================================================
// METADATA
// =============================================================================

export interface CategoryVariation {
    category_index: number;
    practice_variation: number;       // Which variation used in practice (0 or 1)
    test_variation: number;           // Which variation used in test (opposite of practice)
}

export interface ExperimentMetadata {
    hit_id?: string;
    assignment_id?: string;
    category_indices: number[];       // Which 2 categories were selected
    category_variations: CategoryVariation[];
}

// =============================================================================
// COMPLETE FIREBASE SUBMISSION (matches firebase-schema.json)
// =============================================================================

export interface FirebaseSubmission {
    user_id: string;
    condition: ConditionType;
    pre_survey: PreSurveyData;
    practice_section: PracticeSection;
    test_section: TestSection;
    post_survey: PostSurveyData;
    submitted_at: string;             // ISO timestamp
    metadata: ExperimentMetadata;
}

// =============================================================================
// INTERNAL FLOW STATE (used by FlowContext)
// =============================================================================

export interface FlowState {
    userId: string;
    currentStage: FlowStage;
    lessonType: LessonType | null;
    
    // Question tracking
    lessonQuestionIndex: number;      // 0 or 1 (which practice question)
    testQuestionIndex: number;        // 0 or 1 (which test question)
    
    // Category selection (determined at start)
    selectedCategoryIndices: number[];
    categoryVariations: CategoryVariation[];
    scenarioFixed: boolean;
    
    // Collected data
    preSurvey: PreSurveyData | null;
    practiceResponses: QuestionResponse[];
    testResponses: QuestionResponse[];
    postSurvey: PostSurveyData | null;
    
    // MTurk fields
    hitId: string;
    assignmentId: string;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Validates that a string is a valid numeric answer
 */
export function isValidNumericAnswer(answer: string): boolean {
    if (!answer || typeof answer !== 'string') return false;
    const trimmed = answer.trim();
    if (trimmed === '') return false;
    // Allow integers, decimals, negative numbers
    return !isNaN(parseFloat(trimmed)) && isFinite(parseFloat(trimmed));
}

/**
 * Compares user answer to correct answer for is_correct determination
 */
export function checkAnswerCorrectness(userAnswer: string, correctAnswer: string): boolean {
    if (!isValidNumericAnswer(userAnswer)) return false;
    
    const userNum = parseFloat(userAnswer.trim());
    const correctNum = parseFloat(correctAnswer.trim());
    
    // Allow for small floating point differences
    return Math.abs(userNum - correctNum) < 0.0001;
}

/**
 * Converts internal lessonType to output condition type
 */
export function lessonTypeToCondition(lessonType: LessonType | null): ConditionType {
    switch (lessonType) {
        case 'group': return 'peers';
        case 'multi': return 'multi';
        case 'single': return 'single';
        case 'solo': return 'solo';
        default: return 'solo';
    }
}

// =============================================================================
// LEGACY INTERFACES (for backwards compatibility during migration)
// =============================================================================

// Old QuestionSubmission format - used during migration
export interface QuestionSubmission {
    questionId: number;           // Category index
    categoryId: string;           // Category string ID (e.g., "prob", "algebra")
    phase: "lesson" | "test";     // Which phase this submission belongs to
    questionIndex: number;        // 0 or 1 (first or second question in phase)
    questionText: string;
    correctAnswer: string;
    userAnswer: string;
    scratchboardContent: string;
    messages: Message[];          // Chat messages (empty for test/solo)
    startTime: string;            // ISO string
    endTime: string;              // ISO string
    durationSeconds: number;      // Time spent on this question
    isCorrect: boolean;
    timeoutOccurred: boolean;
    skipTime?: string | null;     // NEW: When skip button was clicked
    lessonType?: LessonType | null;
}

// Old SessionData format - DO NOT USE FOR NEW CODE
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
    preTestMathInterest?: string;
    postTestMathInterest?: string;
    mathInterest?: string;
}

export interface Question {
    id?: number;
    question: string;
    options?: Record<string, string> | string[];
    answer: string;
    correctAnswer?: string;
}

// Legacy CategoryVariation with old naming
export interface LegacyCategoryVariation {
    categoryIndex: number;
    lessonVariation: number;
    testVariation: number;
}

export interface ExperimentData {
    userId: string;
    lessonType: LessonType | null;
    selectedCategoryIndices?: number[];
    categoryVariations?: LegacyCategoryVariation[];
    
    // NEW: Pre-survey data (math interest before lessons)
    preSurvey?: PreSurveyData | null;
    
    // Core data - unified question submissions
    questionSubmissions: QuestionSubmission[];
    
    // Legacy arrays for backwards compatibility
    sessionData: SessionData[];
    testData: TestData[];
    surveyData: SurveyData | null;
    
    // Flow state
    currentStage?: FlowStage;
    lessonQuestionIndex?: number;
    testQuestionIndex?: number;
    scenarioFixed?: boolean;
    
    // MTurk fields
    hitId?: string;
    assignmentId?: string;
    
    // Metadata
    testId?: string;
    sessionId?: string;
    questions?: Question[];
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
