import { NextResponse } from 'next/server';
import { AI_MODELS } from '@/services/AI';

// Don't expose API key on the client side - use server-side only
const ANTHROPIC_API_KEY = process.env.CLAUDE_API_KEY;

// Helper function for delay
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Try to call Claude API with exponential backoff
async function callClaudeWithRetry(body: any, retries = 3, initialDelay = 1000) {
  let lastError;
  let delay = initialDelay;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      // Add a small delay even on first attempt to avoid rate limiting
      if (attempt > 0) {
        console.log(`Retry attempt ${attempt}, waiting ${delay}ms...`);
        await sleep(delay);
        // Exponential backoff with jitter
        delay = delay * 1.5 + Math.random() * 1000;
      }
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY || '',
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
      });
      
      if (response.ok) {
        const data = await response.json();
        return { success: true, data };
      }
      
      // Handle specific error codes
      if (response.status === 429 || response.status === 529) {
        const errorText = await response.text();
        console.log(`Rate limited (${response.status}): ${errorText}`);
        lastError = { status: response.status, text: errorText };
        // Continue to retry with backoff
        continue;
      }
      
      // Other errors - return immediately
      const errorText = await response.text();
      return { 
        success: false, 
        error: { status: response.status, message: errorText } 
      };
    } catch (error) {
      lastError = error;
      // Network errors are retried
    }
  }
  
  // All retries failed
  return { 
    success: false, 
    error: { status: 500, message: lastError?.toString() || "Max retries exceeded" } 
  };
}

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
    const modelToUse = model || 'claude-2.0';
    console.log("Using model:", modelToUse);

    const apiBody = {
      model: modelToUse,
      max_tokens: 1500, // Reduce token count to avoid overload
      temperature: 0.7,
      system: systemPrompt || 'You are a helpful teaching assistant named Bob who helps students with math problems.',
      messages: messages
    };
    
    // Call with retry logic
    const result = await callClaudeWithRetry(apiBody);
    
    if (result.success) {
      return NextResponse.json({ message: result.data.content[0].text });
    }
    
    // If failed, try fallback model
    if (modelToUse !== 'claude-2.0') {
      console.log("Retrying with fallback model claude-2.0");
      
      const fallbackBody = {
        ...apiBody,
        model: 'claude-2.0'
      };
      
      const fallbackResult = await callClaudeWithRetry(fallbackBody);
      
      if (fallbackResult.success) {
        return NextResponse.json({
          message: fallbackResult.data.content[0].text,
          usedFallbackModel: true
        });
      }
    }
    
    // All attempts failed
    return NextResponse.json(
      { error: `Claude API error: ${result.error?.status} - ${result.error?.message}` },
      { status: result.error?.status || 500 }
    );
  } catch (error) {
    console.error('Error in Claude API route:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}