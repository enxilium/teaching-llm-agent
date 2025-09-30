export interface Agent {
    id: string;
    name: string;
    alias: string;
    avatar: string;
    systemPrompt: string;
    model?: string; 
}

/**
 * Loads agent configurations from the main agents.json file.
 * @param agentIds An optional array of agent IDs to load. If not provided, all agents are loaded.
 * @returns A promise that resolves to an array of Agent objects.
 */
export const loadAgents = async (agentIds?: string[]): Promise<Agent[]> => {
    try {
        const response = await fetch('/agents.json');
        if (!response.ok) {
            throw new Error(`Failed to fetch agent prompts from /agents.json`);
        }
        const allAgents: Agent[] = await response.json();
        
        if (agentIds) {
            // Preserve the order specified in agentIds array
            return agentIds
                .map(id => allAgents.find(agent => agent.id === id))
                .filter((agent): agent is Agent => agent !== undefined);
        }

        return allAgents;
    } catch (error) {
        console.error("Error loading agent prompts:", error);
        return [];
    }
};
