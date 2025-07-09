import { NextResponse } from "next/server";
import { initializeApp, cert, getApps, getApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Proper Firebase Admin SDK initialization that handles multiple calls safely
let app;
const FIREBASE_APP_NAME = "math-data-app";

try {
    // Check if any Firebase apps are already initialized
    if (getApps().length === 0) {
        app = initializeApp(
            {
                credential: cert({
                    projectId: process.env.FIREBASE_PROJECT_ID,
                    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(
                        /\\n/g,
                        "\n"
                    ),
                }),
            },
            FIREBASE_APP_NAME
        );
    } else {
        // App(s) already initialized, get the named app or the default one
        console.log(
            "Firebase Admin app already initialized, retrieving existing app"
        );
        try {
            app = getApp(FIREBASE_APP_NAME);
        } catch {
            // If named app doesn't exist, get the default app
            app = getApp();
        }
    }
} catch (error) {
    console.error("Firebase Admin initialization error:", error);
    throw error;
}

// Get Firestore instance
const db = getFirestore(app);
const collectionName = "math_data";

// Firebase-specific API endpoint
export async function POST(request: Request) {
    try {
        // Parse request body
        const data = await request.json();

        // Log the received data structure (without sensitive content)
        console.log("Firebase API received data with structure:", {
            hasUserId: !!data.userId,
            hasSessionData:
                !!data.sessionData && Array.isArray(data.sessionData),
            sessionDataCount: data.sessionData?.length || 0,
        });

        // Add metadata
        const enrichedData = {
            ...data,
            _meta: {
                savedAt: new Date(),
                source: "firebase_api",
            },
        };

        // Construct a unique document ID
        const docId = `${data.userId || "unknown"}_${Date.now()}`;

        // Save to Firestore
        const docRef = db.collection(collectionName).doc(docId);
        await docRef.set(enrichedData);

        console.log(`Firebase: Successfully saved data with ID: ${docId}`);

        // Return success
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
