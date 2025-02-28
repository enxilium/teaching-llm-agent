import { Message, AIProvider } from '@/utils/types';

export class OpenAIProvider implements AIProvider {
    async generateResponse(
        messages: Message[],
        systemPrompt: string,
        modelId: string
    ): Promise<string> {
        try {
            const response = await fetch('/api/openai', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages,
                    systemPrompt,
                    model: modelId
                }),
            });

            if (!response.ok) {
                throw new Error(`OpenAI API error: ${response.status}`);
            }

            const data = await response.json();
            return data.message;
        } catch (error) {
            console.error('Error calling OpenAI API:', error);
            return "I'm sorry, I encountered an error processing your request.";
        }
    }
}