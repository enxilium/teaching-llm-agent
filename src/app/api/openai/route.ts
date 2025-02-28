import { NextResponse } from 'next/server';
import { AI_MODELS } from '@/services/AI';

// Don't expose API key on the client side - use server-side only
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export async function POST(request: Request) {
    try {
        const { messages, systemPrompt, model } = await request.json();

        // Find the model config or use the first OpenAI model as default
        const modelConfig = Object.values(AI_MODELS).find(m => m.id === model && m.provider === 'openai') ||
            Object.values(AI_MODELS).find(m => m.provider === 'openai');

        if (!modelConfig) {
            throw new Error('No OpenAI model configuration found');
        }

        const openAIMessages = [
            {
                role: 'system',
                content: systemPrompt || 'You are a helpful teaching assistant named Bob who helps students with math problems.'
            },
            ...messages.map((msg: any) => ({
                role: msg.sender === 'user' ? 'user' : 'assistant',
                content: msg.text
            }))
        ];

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                model: modelConfig.id,
                max_tokens: modelConfig.maxTokens,
                temperature: modelConfig.temperature,
                messages: openAIMessages
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        return NextResponse.json({ message: data.choices[0].message.content });
    } catch (error) {
        console.error('Error calling OpenAI API:', error);
        return NextResponse.json(
            { error: "Failed to get response from OpenAI" },
            { status: 500 }
        );
    }
}