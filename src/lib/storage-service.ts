/**
 * Storage service for saving experiment data to Firebase.
 */

import { retryWithBackoff } from "./retry";
import { ExperimentData } from "@/utils/types";

// Define types for the results object
interface StorageResult {
    success: boolean;
    error: null | unknown;
    data?: Record<string, unknown> | null;
}

/**
 * Save experimental data to Firebase with a retry mechanism.
 */
export async function saveExperimentData(
    data: ExperimentData
): Promise<StorageResult> {
    // Validate that sessionData exists and is not empty
    if (
        !data.sessionData ||
        !Array.isArray(data.sessionData) ||
        data.sessionData.length === 0
    ) {
        console.error("❌ Critical: sessionData is missing or empty!");
        throw new Error(
            "Missing sessionData: Cannot save experiment data without valid sessionData array"
        );
    }

    // Verify that required fields are in data
    if (!data.userId || !data.lessonType) {
        console.error(
            "❌ Critical: Missing required fields: userId or lessonType"
        );
        throw new Error("Missing required fields: userId or lessonType");
    }

    // Log data structure for debugging
    console.log("📊 Data structure check for Firebase submission:", {
        userId: data.userId,
        sessionDataCount: data.sessionData?.length || 0,
        hasMessages:
            data.sessionData?.some(
                (s) => s.messages && s.messages.length > 0
            ) || false,
        lessonType: data.lessonType,
    });

    const result: StorageResult = { success: false, error: null };

    try {
        // Save to Firebase with retries
        await retryWithBackoff(async () => {
            const payload = {
                userId: data.userId,
                hitId: data.hitId,
                assignmentId: data.assignmentId,
                sessionData: data.sessionData,
                testData: data.testData || [],
                surveyData: data.surveyData || null,
                lessonType: data.lessonType,
                completedAt: new Date().toISOString(),
                _meta: {
                    source: "storage_service",
                    timestamp: new Date().toISOString(),
                },
            };

            const response = await fetch("/api/firebase-submit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
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
                        data,
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
