import { NextResponse } from 'next/server';
import { AI_MODELS } from '@/services/AI';

// Don't expose API key on the client side - use server-side only
const ANTHROPIC_API_KEY = process.env.CLAUDE_API_KEY;

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { messages, systemPrompt, model } = body;

        console.log("Request received for model:", model);

        // First, validate that we have messages
        if (!messages || !Array.isArray(messages) || messages.length === 0) {
            return NextResponse.json(
                { error: 'No messages provided' },
                { status: 400 }
            );
        }

        // Try using a known working model ID as a fallback
        // claude-2.0 is more widely available and stable
        const modelToUse = model || 'claude-2.0';
        console.log("Using model:", modelToUse);

        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': process.env.ANTHROPIC_API_KEY || '',
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: modelToUse,
                max_tokens: 4000,
                temperature: 0.7,
                system: systemPrompt || 'You are a helpful teaching assistant named Bob who helps students with math problems.',
                messages: messages
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Claude API error ${response.status}:`, errorText);

            // If we get a 404 for the model, try with claude-2.0 as fallback
            if (response.status === 404 && modelToUse !== 'claude-2.0') {
                console.log("Retrying with fallback model claude-2.0");

                const fallbackResponse = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model: 'claude-2.0',
                        max_tokens: 4000,
                        temperature: 0.7,
                        system: systemPrompt || 'You are a helpful teaching assistant named Bob who helps students with math problems.',
                        messages: messages
                    })
                });

                if (fallbackResponse.ok) {
                    const fallbackData = await fallbackResponse.json();
                    return NextResponse.json({
                        message: fallbackData.content[0].text,
                        usedFallbackModel: true
                    });
                }
            }

            return NextResponse.json(
                { error: `Claude API error: ${response.status} - ${errorText}` },
                { status: response.status }
            );
        }

        const data = await response.json();
        return NextResponse.json({ message: data.content[0].text });
    } catch (error) {
        console.error('Error in Claude API route:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Unknown error" },
            { status: 500 }
        );
    }
}