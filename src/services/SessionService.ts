import { Message } from '@/utils/types';

export interface SessionData {
  userId: string;
  questionId: number;
  questionText: string;
  startTime?: Date;
  endTime?: Date;
  duration?: number;
  finalAnswer: string;
  scratchboardContent: string;
  messages: Message[];
  isCorrect?: boolean;
  timeoutOccurred: boolean;
}

export const SessionService = {
  async createSession(sessionData: SessionData): Promise<any> {
    try {
      console.log(`Creating session for user ${sessionData.userId} with ${sessionData.messages?.length || 0} messages`);
      
      // Ensure messages are properly formatted
      if (sessionData.messages) {
        // Print detailed message info for debugging
        console.log(`Message details before formatting: ${JSON.stringify(sessionData.messages.slice(0, 1))}`);
        
        // Make sure each message has the required fields
        sessionData.messages = sessionData.messages.map((msg: any) => ({
          id: Number(msg.id) || 0,
          sender: String(msg.sender || ''),
          agentId: msg.agentId || null,
          text: String(msg.text || ''),
          timestamp: msg.timestamp ? new Date(msg.timestamp).toISOString() : new Date().toISOString()
        }));
        
        console.log(`Formatted ${sessionData.messages.length} messages`);
      }
      
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionData),
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error in createSession:', error);
      throw error;
    }
  },
  
  async getUserSessions(userId: string, includeTemp: boolean = false): Promise<any[]> {
    try {
      // Build URL with proper parameters
      const url = includeTemp 
        ? `/api/sessions?userId=${userId}` 
        : `/api/sessions?userId=${userId}&tempRecord=false`;
      
      console.log(`Fetching sessions from: ${url}`);
      
      const response = await fetch(url);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch sessions');
      }
      
      console.log(`Received ${data.data?.length || 0} sessions for user ${userId}`);
      
      return data.data || [];
    } catch (error) {
      console.error('Error fetching user sessions:', error);
      return [];
    }
  }
};

export default SessionService;