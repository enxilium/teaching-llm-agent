/**
 * Storage service for saving experiment data to Firebase.
 * Transforms internal data format to the rigid Firebase schema.
 * Includes strict validation before submission.
 */

import { retryWithBackoff } from "./retry";
import { 
    ExperimentData, 
    QuestionSubmission, 
    FirebaseSubmission,
    QuestionResponse,
    ConditionType,
    lessonTypeToCondition,
    CategoryVariation,
    PreSurveyData,
    PostSurveyData,
    AgentPerception,
    Message,
} from "@/utils/types";

// =============================================================================
// STRICT DATA VALIDATION
// =============================================================================

export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

/**
 * Validate a single chat message matches the schema
 */
function validateChatMessage(msg: Message, idx: number, questionLabel: string): string[] {
    const errors: string[] = [];
    
    if (typeof msg.id !== "number") {
        errors.push(`${questionLabel} chat_message[${idx}]: id must be a number`);
    }
    if (!msg.sender || (msg.sender !== "user" && msg.sender !== "ai")) {
        errors.push(`${questionLabel} chat_message[${idx}]: sender must be 'user' or 'ai'`);
    }
    if (typeof msg.text !== "string") {
        errors.push(`${questionLabel} chat_message[${idx}]: text must be a string`);
    }
    if (!msg.timestamp || !isValidISODate(msg.timestamp)) {
        errors.push(`${questionLabel} chat_message[${idx}]: timestamp must be a valid ISO date string`);
    }
    // agent_id is optional but if present should be string or null
    if (msg.agentId !== undefined && msg.agentId !== null && typeof msg.agentId !== "string") {
        errors.push(`${questionLabel} chat_message[${idx}]: agentId must be string or null`);
    }
    
    return errors;
}

/**
 * Validate a single question response matches the schema
 */
function validateQuestionResponse(
    question: QuestionResponse, 
    idx: number, 
    section: "practice" | "test"
): string[] {
    const errors: string[] = [];
    const label = `${section}_section.questions[${idx}]`;
    
    // Required fields
    if (typeof question.question_index !== "number" || question.question_index < 0 || question.question_index > 1) {
        errors.push(`${label}: question_index must be 0 or 1`);
    }
    
    if (!question.category_id || typeof question.category_id !== "string") {
        errors.push(`${label}: category_id is required and must be a string`);
    }
    
    if (!question.question_text || typeof question.question_text !== "string") {
        errors.push(`${label}: question_text is required and must be a string`);
    }
    
    if (!question.correct_answer || typeof question.correct_answer !== "string") {
        errors.push(`${label}: correct_answer is required and must be a string`);
    }
    
    if (typeof question.answer_text !== "string") {
        errors.push(`${label}: answer_text is required and must be a string`);
    }
    
    if (typeof question.is_correct !== "boolean") {
        errors.push(`${label}: is_correct must be a boolean`);
    }
    
    // Timestamp validation
    if (!question.question_load_time || !isValidISODate(question.question_load_time)) {
        errors.push(`${label}: question_load_time must be a valid ISO date string`);
    }
    
    if (!question.answer_submit_time || !isValidISODate(question.answer_submit_time)) {
        errors.push(`${label}: answer_submit_time must be a valid ISO date string`);
    }
    
    // skip_button_click_time is nullable
    if (question.skip_button_click_time !== null && 
        question.skip_button_click_time !== undefined && 
        !isValidISODate(question.skip_button_click_time)) {
        errors.push(`${label}: skip_button_click_time must be a valid ISO date string or null`);
    }
    
    // Duration
    if (typeof question.duration_seconds !== "number" || question.duration_seconds < 0) {
        errors.push(`${label}: duration_seconds must be a non-negative number`);
    }
    
    // Scratchboard content
    if (typeof question.scratchboard_content !== "string") {
        errors.push(`${label}: scratchboard_content must be a string`);
    }
    
    // Chat messages validation
    if (!Array.isArray(question.chat_messages)) {
        errors.push(`${label}: chat_messages must be an array`);
    } else {
        // For practice section, validate each message
        question.chat_messages.forEach((msg, msgIdx) => {
            errors.push(...validateChatMessage(msg, msgIdx, label));
        });
    }
    
    return errors;
}

/**
 * Check if a string is a valid ISO date
 */
function isValidISODate(dateString: string): boolean {
    if (!dateString || typeof dateString !== "string") return false;
    const date = new Date(dateString);
    return !isNaN(date.getTime()) && dateString.includes("T");
}

/**
 * Strictly validate the complete Firebase submission before sending
 * This catches errors early, before hitting the API
 */
export function validateFirebaseSubmission(data: FirebaseSubmission): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // =========================================================================
    // TOP-LEVEL REQUIRED FIELDS
    // =========================================================================
    
    if (!data.user_id || typeof data.user_id !== "string" || data.user_id.trim() === "") {
        errors.push("user_id is required and must be a non-empty string");
    }
    
    if (!data.condition) {
        errors.push("condition is required");
    } else if (!["multi", "single", "peers", "solo"].includes(data.condition)) {
        errors.push(`condition must be one of: multi, single, peers, solo. Got: ${data.condition}`);
    }
    
    if (!data.submitted_at || !isValidISODate(data.submitted_at)) {
        errors.push("submitted_at must be a valid ISO date string");
    }
    
    // =========================================================================
    // PRE-SURVEY VALIDATION
    // =========================================================================
    
    if (!data.pre_survey) {
        errors.push("pre_survey is required");
    } else {
        if (typeof data.pre_survey.math_interest !== "number") {
            errors.push("pre_survey.math_interest must be a number");
        } else if (data.pre_survey.math_interest < 1 || data.pre_survey.math_interest > 5) {
            errors.push(`pre_survey.math_interest must be between 1 and 5. Got: ${data.pre_survey.math_interest}`);
        }
        
        if (data.pre_survey.completed_at && !isValidISODate(data.pre_survey.completed_at)) {
            errors.push("pre_survey.completed_at must be a valid ISO date string");
        }
    }
    
    // =========================================================================
    // PRACTICE SECTION VALIDATION
    // =========================================================================
    
    if (!data.practice_section) {
        errors.push("practice_section is required");
    } else if (!Array.isArray(data.practice_section.questions)) {
        errors.push("practice_section.questions must be an array");
    } else {
        if (data.practice_section.questions.length !== 2) {
            errors.push(`practice_section must have exactly 2 questions. Got: ${data.practice_section.questions.length}`);
        }
        
        // Validate each practice question
        data.practice_section.questions.forEach((q, idx) => {
            errors.push(...validateQuestionResponse(q, idx, "practice"));
        });
        
        // Validate question indices are 0 and 1
        const practiceIndices = data.practice_section.questions.map(q => q.question_index).sort();
        if (practiceIndices.length === 2 && (practiceIndices[0] !== 0 || practiceIndices[1] !== 1)) {
            errors.push("practice_section questions must have question_index 0 and 1");
        }
    }
    
    // =========================================================================
    // TEST SECTION VALIDATION
    // =========================================================================
    
    if (!data.test_section) {
        errors.push("test_section is required");
    } else if (!Array.isArray(data.test_section.questions)) {
        errors.push("test_section.questions must be an array");
    } else {
        if (data.test_section.questions.length !== 2) {
            errors.push(`test_section must have exactly 2 questions. Got: ${data.test_section.questions.length}`);
        }
        
        // Validate each test question
        data.test_section.questions.forEach((q, idx) => {
            errors.push(...validateQuestionResponse(q, idx, "test"));
        });
        
        // Validate question indices are 0 and 1
        const testIndices = data.test_section.questions.map(q => q.question_index).sort();
        if (testIndices.length === 2 && (testIndices[0] !== 0 || testIndices[1] !== 1)) {
            errors.push("test_section questions must have question_index 0 and 1");
        }
        
        // Test questions should have empty chat_messages
        data.test_section.questions.forEach((q, idx) => {
            if (q.chat_messages && q.chat_messages.length > 0) {
                warnings.push(`test_section.questions[${idx}] has ${q.chat_messages.length} chat messages (expected 0)`);
            }
        });
    }
    
    // =========================================================================
    // CROSS-SECTION VALIDATION
    // =========================================================================
    
    // Ensure practice and test questions use matching category_ids
    if (data.practice_section?.questions?.length === 2 && data.test_section?.questions?.length === 2) {
        const practiceCats = data.practice_section.questions
            .sort((a, b) => a.question_index - b.question_index)
            .map(q => q.category_id);
        const testCats = data.test_section.questions
            .sort((a, b) => a.question_index - b.question_index)
            .map(q => q.category_id);
        
        if (practiceCats[0] !== testCats[0]) {
            errors.push(`Q1 category mismatch: practice=${practiceCats[0]}, test=${testCats[0]}`);
        }
        if (practiceCats[1] !== testCats[1]) {
            errors.push(`Q2 category mismatch: practice=${practiceCats[1]}, test=${testCats[1]}`);
        }
    }
    
    // =========================================================================
    // POST-SURVEY VALIDATION (optional fields, just check types)
    // =========================================================================
    
    if (data.post_survey) {
        if (data.post_survey.post_math_interest !== undefined) {
            if (typeof data.post_survey.post_math_interest !== "number" ||
                data.post_survey.post_math_interest < 1 || 
                data.post_survey.post_math_interest > 5) {
                errors.push("post_survey.post_math_interest must be a number between 1 and 5");
            }
        }
        if (data.post_survey.passed_attention_check !== undefined) {
            if (typeof data.post_survey.passed_attention_check !== "boolean") {
                errors.push("post_survey.passed_attention_check must be a boolean");
            }
        }
    }
    
    return {
        valid: errors.length === 0,
        errors,
        warnings,
    };
}

// Define types for the results object
interface StorageResult {
    success: boolean;
    error: null | unknown;
    data?: Record<string, unknown> | null;
}

/**
 * Transform a QuestionSubmission to the Firebase QuestionResponse schema
 */
function transformToQuestionResponse(submission: QuestionSubmission): QuestionResponse {
    return {
        question_index: submission.questionIndex,
        category_id: submission.categoryId,
        question_text: submission.questionText,
        correct_answer: submission.correctAnswer,
        answer_text: submission.userAnswer,
        is_correct: submission.isCorrect,
        question_load_time: submission.startTime,
        answer_submit_time: submission.endTime,
        skip_button_click_time: submission.skipTime || null,
        duration_seconds: submission.durationSeconds,
        scratchboard_content: submission.scratchboardContent || "",
        chat_messages: submission.messages || [],
    };
}

/**
 * Transform internal ExperimentData to the rigid FirebaseSubmission schema
 */
function transformToFirebaseSchema(data: ExperimentData): FirebaseSubmission {
    // Transform condition (group -> peers)
    const condition: ConditionType = lessonTypeToCondition(data.lessonType);
    
    // Extract practice and test submissions
    const practiceSubmissions = (data.questionSubmissions || [])
        .filter(s => s.phase === "lesson")
        .sort((a, b) => a.questionIndex - b.questionIndex);
    
    const testSubmissions = (data.questionSubmissions || [])
        .filter(s => s.phase === "test")
        .sort((a, b) => a.questionIndex - b.questionIndex);
    
    // Transform to QuestionResponse format
    const practiceQuestions: QuestionResponse[] = practiceSubmissions.map(transformToQuestionResponse);
    const testQuestions: QuestionResponse[] = testSubmissions.map(transformToQuestionResponse);
    
    // Build pre-survey data
    const preSurvey: PreSurveyData = data.preSurvey || {
        math_interest: 0,
        completed_at: new Date().toISOString(),
    };
    
    // Build post-survey data from legacy surveyData
    const postSurvey: PostSurveyData = {};
    if (data.surveyData) {
        postSurvey.confusion_level = data.surveyData.confusionLevel;
        postSurvey.difficulty_level = data.surveyData.testDifficulty;
        postSurvey.correctness_perception = data.surveyData.perceivedCorrectness;
        postSurvey.learning_amount = data.surveyData.learningAmount;
        postSurvey.pros_and_cons = data.surveyData.feedback;
        postSurvey.age = data.surveyData.age;
        postSurvey.gender = data.surveyData.gender;
        postSurvey.education_level = data.surveyData.educationLevel;
        
        // Convert post_math_interest from text to 1-5 scale
        // Values: "very-interested"=5, "somewhat-interested"=4, "neutral"=3, 
        //         "somewhat-uninterested"=2, "very-uninterested"=1
        const interestValue = data.surveyData.postTestMathInterest;
        if (interestValue) {
            const interestMap: Record<string, number> = {
                "very-interested": 5,
                "somewhat-interested": 4,
                "neutral": 3,
                "somewhat-uninterested": 2,
                "very-uninterested": 1,
            };
            // Try mapping first, fallback to parseInt for numeric strings
            if (interestMap[interestValue]) {
                postSurvey.post_math_interest = interestMap[interestValue];
            } else {
                const parsed = parseInt(interestValue, 10);
                if (!isNaN(parsed) && parsed >= 1 && parsed <= 5) {
                    postSurvey.post_math_interest = parsed;
                }
                // If neither works, leave undefined (field is optional)
            }
        }
        
        postSurvey.completed_at = data.surveyData.submittedAt;
        
        // Transform agent perceptions from legacy format (bobPerception, etc.)
        // to the schema format (agent_perceptions.bob, etc.)
        const legacySurvey = data.surveyData as Record<string, unknown>;
        if (legacySurvey.bobPerception || legacySurvey.alicePerception || legacySurvey.charliePerception) {
            postSurvey.agent_perceptions = {};
            if (legacySurvey.bobPerception) {
                postSurvey.agent_perceptions.bob = legacySurvey.bobPerception as AgentPerception;
            }
            if (legacySurvey.alicePerception) {
                postSurvey.agent_perceptions.alice = legacySurvey.alicePerception as AgentPerception;
            }
            if (legacySurvey.charliePerception) {
                postSurvey.agent_perceptions.charlie = legacySurvey.charliePerception as AgentPerception;
            }
        }
        
        // Convert attention check answer to boolean (correct answer is 4)
        const attentionAnswer = legacySurvey.attentionCheckAnswer as string | undefined;
        if (attentionAnswer !== undefined && attentionAnswer !== "") {
            const parsedAnswer = parseInt(attentionAnswer, 10);
            postSurvey.passed_attention_check = !isNaN(parsedAnswer) && parsedAnswer === 4;
        }
    }
    
    // Transform category variations to new naming
    const categoryVariations: CategoryVariation[] = (data.categoryVariations || []).map(cv => ({
        category_index: cv.categoryIndex,
        practice_variation: cv.lessonVariation,
        test_variation: cv.testVariation,
    }));
    
    return {
        user_id: data.userId,
        condition: condition,
        pre_survey: preSurvey,
        practice_section: {
            questions: practiceQuestions,
        },
        test_section: {
            questions: testQuestions,
        },
        post_survey: postSurvey,
        submitted_at: new Date().toISOString(),
        metadata: {
            hit_id: data.hitId,
            assignment_id: data.assignmentId,
            category_indices: data.selectedCategoryIndices || [],
            category_variations: categoryVariations,
        },
    };
}

/**
 * Save experimental data to Firebase with a retry mechanism.
 * Transforms data to the rigid Firebase schema before submission.
 */
export async function saveExperimentData(
    data: ExperimentData
): Promise<StorageResult> {
    // Validate that we have question submissions
    const hasQuestionSubmissions = data.questionSubmissions && 
        Array.isArray(data.questionSubmissions) && 
        data.questionSubmissions.length > 0;
    
    const hasLegacySessionData = data.sessionData && 
        Array.isArray(data.sessionData) && 
        data.sessionData.length > 0;

    if (!hasQuestionSubmissions && !hasLegacySessionData) {
        console.error("❌ Critical: No question data found!");
        throw new Error(
            "Missing question data: Cannot save experiment data without questionSubmissions or sessionData"
        );
    }

    // Verify that required fields are in data
    if (!data.userId || !data.lessonType) {
        console.error(
            "❌ Critical: Missing required fields: userId or lessonType"
        );
        throw new Error("Missing required fields: userId or lessonType");
    }

    // Transform to Firebase schema
    const firebasePayload = transformToFirebaseSchema(data);

    // ==========================================================================
    // STRICT VALIDATION BEFORE SUBMISSION
    // ==========================================================================
    const validation = validateFirebaseSubmission(firebasePayload);
    
    if (!validation.valid) {
        console.error("❌ VALIDATION FAILED - Data does not match schema:");
        validation.errors.forEach((err, idx) => console.error(`  ${idx + 1}. ${err}`));
        throw new Error(`Schema validation failed with ${validation.errors.length} error(s): ${validation.errors.join("; ")}`);
    }
    
    if (validation.warnings.length > 0) {
        console.warn("⚠️ Validation warnings:");
        validation.warnings.forEach((warn, idx) => console.warn(`  ${idx + 1}. ${warn}`));
    }
    
    console.log("✅ Schema validation passed");

    // Log data structure for debugging
    console.log("📊 Firebase submission details:", {
        user_id: firebasePayload.user_id,
        condition: firebasePayload.condition,
        practice_questions: firebasePayload.practice_section.questions.length,
        practice_q1_messages: firebasePayload.practice_section.questions[0]?.chat_messages?.length || 0,
        practice_q2_messages: firebasePayload.practice_section.questions[1]?.chat_messages?.length || 0,
        test_questions: firebasePayload.test_section.questions.length,
        has_pre_survey: !!firebasePayload.pre_survey.math_interest,
        category_indices: firebasePayload.metadata.category_indices,
    });

    const result: StorageResult = { success: false, error: null };

    try {
        // Save to Firebase with retries
        await retryWithBackoff(async () => {
            const response = await fetch("/api/firebase-submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(firebasePayload),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Firebase API returned ${response.status}: ${errorText}`
                );
            }

            const responseData = await response.json();

            if (!responseData.success) {
                throw new Error(
                    responseData.message || "Firebase server save failed"
                );
            }

            result.success = true;
            result.data = responseData;
            console.log(
                "✅ Successfully saved to Firebase via secure Admin SDK"
            );
        }, 3); // 3 retries

        return result;
    } catch (error) {
        console.error("❌ Failed to save to Firebase after retries:", error);
        result.error = error;

        // Last resort: Save to localStorage as emergency backup
        if (typeof window !== "undefined") {
            try {
                const emergencyBackupKey = `emergency_backup_${Date.now()}`;
                localStorage.setItem(
                    emergencyBackupKey,
                    JSON.stringify({
                        data: firebasePayload,
                        originalData: data,
                        storageError: error,
                        timestamp: new Date().toISOString(),
                    })
                );
                console.log(
                    `📦 Created emergency backup in localStorage: ${emergencyBackupKey}`
                );
            } catch (localStorageError) {
                console.error(
                    "Even localStorage backup failed:",
                    localStorageError
                );
            }
        }

        // Re-throw the error to be caught by the calling function
        throw error;
    }
}
