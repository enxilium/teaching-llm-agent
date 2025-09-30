import { Message } from "@/utils/types";

// Define AI model with GPT-5 configuration
export const AI_MODELS = {
    GPT5: {
        id: "gpt-5",
        name: "GPT5",
        provider: "openai",
        maxTokens: 4096,
        temperature: 0.3, // Set temperature to 0.3 for more diverse responses while staying focused
    },
};

export const DEFAULT_MODEL = AI_MODELS.GPT5;

// Interface for AI service options
interface AIServiceOptions {
    model?: string;
    systemPrompt?: string | null;
    temperature?: number;
}

/**
 * AI service for generating responses from GPT-5
 */
export const aiService = {
    generateResponse: async (
        messages: Message[],
        options: AIServiceOptions = {}
    ): Promise<string> => {
        const modelId = options.model || AI_MODELS.GPT5.id;

        // Format messages for OpenAI API
        const formattedMessages = [];

        // Add system message if provided
        if (options.systemPrompt) {
            formattedMessages.push({
                role: "system",
                content: options.systemPrompt,
            });
        }

        // Add conversation messages
        messages.forEach((msg) => {
            // Skip system context messages with special IDs
            if (msg.sender === "system" && msg.id < 0) return;
            
            formattedMessages.push({
                role: msg.sender === "user" ? "user" : "assistant",
                content: msg.text,
            });
        });

        // Ensure there's at least one user message
        if (
            formattedMessages.length === 0 ||
            (formattedMessages.length === 1 &&
                formattedMessages[0].role === "system") ||
            formattedMessages.every((m) => m.role !== "user")
        ) {
            formattedMessages.push({
                role: "user",
                content: "Please help with this.",
            });
        }

        try {
            const response = await fetch("/api/openai", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    messages: formattedMessages,
                    model: modelId,
                    temperature: options.temperature ?? 0.3, // Use passed temperature or default to 0.3
                }),
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`API error ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            return data.message;
        } catch (error) {
            console.error("Error generating AI response:", error);
            throw error;
        }
    },
};
