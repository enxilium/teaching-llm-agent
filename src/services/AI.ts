import { Message } from '@/utils/types';

// Define AI models with their configuration
export const AI_MODELS = {
    CLAUDE_HAIKU: {
        id: 'claude-3-haiku-20240307',
        name: 'Claude Haiku',
        provider: 'claude',
        maxTokens: 1000,
        temperature: 0.7
    },
    CLAUDE_SONNET: {
        id: 'claude-3-sonnet-20240229',
        name: 'Claude Sonnet',
        provider: 'claude',
        maxTokens: 4000,
        temperature: 0.7
    },
    CLAUDE_OPUS: {
        id: 'claude-3-opus-20240229',
        name: 'Claude Opus',
        provider: 'claude',
        maxTokens: 4000,
        temperature: 0.7
    },
    // Add Claude 2 as a fallback
    CLAUDE_2: {
        id: 'claude-2.0',
        name: 'Claude 2',
        provider: 'claude',
        maxTokens: 4000,
        temperature: 0.7
    }
};

export const DEFAULT_MODEL = AI_MODELS.CLAUDE_HAIKU;

// Updated backward compatibility mapping
const MODEL_ID_MAPPING = {
    'claude-haiku': 'claude-3-haiku-20240307',
    'claude-sonnet': 'claude-3-sonnet-20240229',
    'claude-opus': 'claude-3-opus-20240229',
    // Add any other aliases that might be used
    'claude-3-sonnet': 'claude-3-sonnet-20240229',
    'claude-3-haiku': 'claude-3-haiku-20240307',
    'claude-3-opus': 'claude-3-opus-20240229'
};

interface AIServiceOptions {
    systemPrompt?: string;
    model?: string;
}

/**
 * AI service for generating responses from different AI providers
 */
export const aiService = {
    generateResponse: async (
        messages: Message[],
        options: AIServiceOptions = {}
    ): Promise<string> => {
        // Get the model or default to Claude Haiku
        const rawModelId = options.model || AI_MODELS.CLAUDE_HAIKU.id;
        
        // Handle old model IDs with backward compatibility
        const modelId = (rawModelId in MODEL_ID_MAPPING)
            ? MODEL_ID_MAPPING[rawModelId as keyof typeof MODEL_ID_MAPPING]
            : rawModelId;

        const modelConfig = Object.values(AI_MODELS).find(m => m.id === modelId);

        if (!modelConfig) {
            console.error(`Model ID lookup failed: ${rawModelId} -> ${modelId}`);
            // Fall back to default model instead of crashing
            const defaultConfig = Object.values(AI_MODELS).find(m => m.id === AI_MODELS.CLAUDE_HAIKU.id);
            if (!defaultConfig) {
                throw new Error(`Model ${modelId} not found and default model is invalid`);
            }
            console.log(`Falling back to default model: ${defaultConfig.id}`);
            return aiService.generateResponse(messages, {
                ...options,
                model: defaultConfig.id
            });
        }

        // Rest of your code remains the same
        const formattedMessages = messages.map(msg => ({
            role: msg.sender === 'user' ? 'user' : 'assistant',
            content: msg.text
        }));

        // Ensure there's at least one message and it's from the user
        if (formattedMessages.length === 0 || formattedMessages.every(m => m.role !== 'user')) {
            // Add a default user message if needed
            formattedMessages.unshift({
                role: 'user',
                content: 'Please help with this.'
            });
        }

        try {
            // Call the appropriate API endpoint based on provider
            if (modelConfig.provider === 'claude') {
                const response = await fetch('/api/claude', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        messages: formattedMessages, // Use formattedMessages instead of messages
                        systemPrompt: options.systemPrompt || '',
                        model: modelId // Use the resolved model ID
                    }),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    throw new Error(`API error ${response.status}: ${errorText}`);
                }

                const data = await response.json();
                return data.message;
            } else {
                throw new Error(`Provider ${modelConfig.provider} not supported`);
            }
        } catch (error) {
            console.error('Error generating AI response:', error);
            throw error;
        }
    }
};