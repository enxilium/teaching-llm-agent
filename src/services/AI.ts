import { Message } from '@/utils/types';

// Define AI model with GPT-4o configuration
export const AI_MODELS = {
  GPT4O: {
    id: 'gpt-4o-2024-08-06',
    name: 'GPT-4o',
    provider: 'openai',
    maxTokens: 4096,
    temperature: 0 // Set temperature to 0 for deterministic responses
  }
};

export const DEFAULT_MODEL = AI_MODELS.GPT4O;

interface AIServiceOptions {
  systemPrompt?: string;
  model?: string;
}

/**
 * AI service for generating responses from GPT-4o
 */
export const aiService = {
  generateResponse: async (
    messages: Message[],
    options: AIServiceOptions = {}
  ): Promise<string> => {
    // Always use the GPT-4o model
    const modelId = options.model || AI_MODELS.GPT4O.id;
    
    // Format messages for OpenAI API
    const formattedMessages = [];
    
    // Add system message if provided
    if (options.systemPrompt) {
      formattedMessages.push({
        role: 'system',
        content: options.systemPrompt
      });
    }
    
    // Add conversation messages
    messages.forEach(msg => {
      formattedMessages.push({
        role: msg.sender === 'user' ? 'user' : 'assistant',
        content: msg.text
      });
    });

    // Ensure there's at least one user message
    if (formattedMessages.length === 0 || 
        (formattedMessages.length === 1 && formattedMessages[0].role === 'system') ||
        formattedMessages.every(m => m.role !== 'user')) {
      formattedMessages.push({
        role: 'user',
        content: 'Please help with this.'
      });
    }

    try {
      const response = await fetch('/api/openai', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: formattedMessages,
          model: modelId,
          temperature: 0 // Explicitly set temperature to 0
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      return data.message;
    } catch (error) {
      console.error('Error generating AI response:', error);
      throw error;
    }
  }
};