import { Message, AIProvider } from '@/utils/types';

export class ClaudeProvider implements AIProvider {
    async generateResponse(
        messages: Message[],
        systemPrompt: string,
        modelId: string
    ): Promise<string> {
        try {
            const response = await fetch('/api/claude', {
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
                throw new Error(`Claude API error: ${response.status}`);
            }

            const data = await response.json();
            return data.message;
        } catch (error) {
            console.error('Error calling Claude API:', error);
            return "I'm sorry, I encountered an error processing your request.";
        }
    }
}