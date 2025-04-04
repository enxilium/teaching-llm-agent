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
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sessionData),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to save session');
      }
      
      return data;
    } catch (error) {
      console.error('Error saving session data:', error);
      throw error;
    }
  },
  
  async getUserSessions(userId: string): Promise<any[]> {
    try {
      const response = await fetch(`/api/sessions?userId=${userId}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch sessions');
      }
      
      return data.data;
    } catch (error) {
      console.error('Error fetching user sessions:', error);
      return [];
    }
  }
};

export default SessionService;