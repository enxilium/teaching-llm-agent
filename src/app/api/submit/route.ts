import { NextRequest, NextResponse } from "next/server";
import { saveExperimentData } from "@/lib/storage-service";
import { ExperimentData } from "@/utils/types";

export async function POST(request: NextRequest) {
    try {
        console.log(
            "🔍 /api/submit endpoint called - handling complete data submission"
        );

        // Get raw request body first for debugging
        let rawBody: string;
        try {
            rawBody = await request.text();
            console.log(`Raw data received: ${rawBody.length} bytes`);
        } catch (jsonError: unknown) {
            console.error("❌ Failed to read raw request:", jsonError);
            return NextResponse.json(
                { success: false, error: "Failed to read request body" },
                { status: 400 }
            );
        }

        // Parse the request body with enhanced error handling
        let completeData: ExperimentData;
        try {
            completeData = JSON.parse(rawBody);
            console.log("📊 Complete data keys:", Object.keys(completeData));
        } catch (jsonError: unknown) {
            console.error("❌ Failed to parse JSON:", jsonError);
            return NextResponse.json(
                { success: false, error: "Invalid JSON in request body" },
                { status: 400 }
            );
        }

        // Validate required fields
        if (!completeData.userId) {
            console.error("❌ Missing required userId field");
            return NextResponse.json(
                { success: false, error: "Missing required field: userId" },
                { status: 400 }
            );
        }

        console.log(`Starting submission for user: ${completeData.userId}`);

        // Use our storage service to save to Firebase
        const results = await saveExperimentData(completeData);

        // Return successful response with detailed results
        return NextResponse.json({
            success: true,
            message: "Data saved successfully to Firebase",
            results,
        });
    } catch (error: unknown) {
        console.error("❌ Error in complete data submission:", error);
        const errorMessage =
            error instanceof Error ? error.message : String(error);
        return NextResponse.json(
            {
                success: false,
                error: "Failed to save data",
                details: errorMessage,
            },
            { status: 500 }
        );
    }
}
