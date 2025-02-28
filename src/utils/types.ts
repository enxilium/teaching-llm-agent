export interface Message {
    id: number;
    sender: "user" | "ai" | string;
    text: string;
    agentId?: string;
    onComplete?: () => void;
}

export interface AIModelConfig {
    id: string;
    name: string;
    provider: string;
    maxTokens: number;
    temperature: number;
}

export interface AIServiceOptions {
    systemPrompt?: string;
    model?: string;
}

export interface AIProvider {
    generateResponse(messages: Message[], systemPrompt: string, modelId: string): Promise<string>;
}

export interface Piece {
    shape: number[][];
    x: number;
    y: number;
    color: number;
}

export interface AgentThought {
    id: string;
    timestamp: string;
    content: string;
    type: 'reasoning' | 'question' | 'response';
}

export interface AIAgent {
    id: string;
    name: string;
    avatar: string;
    type: 'assistant' | 'teacher';
    systemPrompt: string;
    model: string;
    thoughts: AgentThought[];
}