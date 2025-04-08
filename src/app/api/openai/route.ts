import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { messages, model, temperature = 0 } = await request.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: 'Invalid messages format' },
        { status: 400 }
      );
    }

    // Set default model if not provided - always use gpt-4o-2024-08-06
    const modelId = 'gpt-4o-2024-08-06';

    // Call OpenAI API with temperature=0 for consistency
    const completion = await openai.chat.completions.create({
      model: modelId,
      messages,
      temperature: 0, // Force temperature=0 for deterministic responses
      max_tokens: 4096,
    });

    // Extract the response content
    const message = completion.choices[0]?.message?.content || '';

    return NextResponse.json({ message });
  } catch (error: any) {
    console.error('OpenAI API error:', error);
    return NextResponse.json(
      { error: error.message || 'Error calling OpenAI API' },
      { status: 500 }
    );
  }
}