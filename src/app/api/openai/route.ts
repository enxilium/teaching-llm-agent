import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
    try {
        const { messages, model, temperature } = await request.json();

        if (!messages || !Array.isArray(messages)) {
            return NextResponse.json(
                { error: "Invalid messages format" },
                { status: 400 }
            );
        }

        // Use GPT-5.2 as the default model
        const modelId = model || "gpt-5.2"
        // Call OpenAI API with appropriate temperature
        const completion = await openai.chat.completions.create({
            model: modelId,
            messages,
            temperature: temperature || 0.8,
            max_completion_tokens: 4096,
            presence_penalty: 0.6,
            frequency_penalty: 0.3,
        });

        // Extract the response content
        const message = completion.choices[0]?.message?.content || "";

        return NextResponse.json({ message });
    } catch (error) {
        console.error("OpenAI API error:", error);
        return NextResponse.json(
            { error: (error as Error).message || "Error calling OpenAI API" },
            { status: 500 }
        );
    }
}
