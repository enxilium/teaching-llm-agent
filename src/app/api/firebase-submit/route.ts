import { NextResponse } from "next/server";
import * as admin from "firebase-admin";
import { FirebaseSubmission } from "@/utils/types";
import { validateFirebaseSubmission } from "@/lib/storage-service";

// Initialize Firebase Admin SDK using service account JSON
const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY as string
);

if (admin.apps.length === 0) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
    });
}

// Get Firestore instance
const db = admin.firestore();
const collectionName = "math_data";

export async function POST(request: Request) {
    try {
        const data: FirebaseSubmission = await request.json();

        // Validate against schema using shared validation function
        const validation = validateFirebaseSubmission(data);
        if (!validation.valid) {
            console.error("Schema validation failed:", validation.errors);
            return NextResponse.json(
                { 
                    success: false, 
                    error: "Schema validation failed", 
                    details: validation.errors 
                },
                { status: 400 }
            );
        }
        
        if (validation.warnings.length > 0) {
            console.warn("Validation warnings:", validation.warnings);
        }

        // Log the received data structure
        console.log("Firebase API received valid data:", {
            user_id: data.user_id,
            condition: data.condition,
            practice_questions: data.practice_section?.questions?.length || 0,
            practice_q1_messages: data.practice_section?.questions?.[0]?.chat_messages?.length || 0,
            practice_q2_messages: data.practice_section?.questions?.[1]?.chat_messages?.length || 0,
            test_questions: data.test_section?.questions?.length || 0,
            has_pre_survey: !!data.pre_survey?.math_interest,
        });

        // Add server timestamp
        const enrichedData = {
            ...data,
            _meta: {
                savedAt: admin.firestore.FieldValue.serverTimestamp(),
                source: "firebase_api",
                schema_version: "2.0",
            },
        };

        // Construct a unique document ID
        const docId = `${data.user_id}_${Date.now()}`;

        // Save to Firestore
        const docRef = db.collection(collectionName).doc(docId);
        await docRef.set(enrichedData);

        console.log(`Firebase: Successfully saved data with ID: ${docId}`);

        return NextResponse.json({
            success: true,
            message: "Data saved to Firebase",
            id: docId,
        });
    } catch (error) {
        console.error("Firebase save error:", error);
        return NextResponse.json(
            {
                success: false,
                error: "Failed to save data to Firebase",
                details: error instanceof Error ? error.message : String(error),
            },
            { status: 500 }
        );
    }
}