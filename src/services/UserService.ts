export interface UserData {
  userId: string;
  flowStage?: string;
  lessonType?: string;
  lessonQuestionIndex?: number;
  tempRecord?: boolean;
}

class UserService {
  async createOrUpdateUser(userData: UserData): Promise<{ success: boolean; data?: UserData; error?: string }> {
    try {
      console.log(`Updating user ${userData.userId}, temp: ${userData.tempRecord !== false}`);
      
      const response = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(userData),
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error in createOrUpdateUser:', error);
      throw error;
    }
  }

  async getUser(userId: string): Promise<{ success: boolean; data?: UserData; error?: string }> {
    try {
      const response = await fetch(`/api/users/${userId}`);
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error in getUser:', error);
      throw error;
    }
  }
  
  async finalizeSessions(userId: string): Promise<{ success: boolean; error?: string }> {
    try {
      console.log(`Finalizing all sessions for user ${userId}`);
      
      const response = await fetch(`/api/users/${userId}/finalize`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error finalizing sessions:', error);
      throw error;
    }
  }
}

const userService = new UserService();
export default userService;