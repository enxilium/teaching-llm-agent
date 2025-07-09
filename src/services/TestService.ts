export interface TestData {
  userId: string;
  testType: 'pre' | 'post' | 'final';
  questions: {
    questionId: number;
    question: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
  }[];
  score: number;
}

export const TestService = {
  async saveTestAttempt(testData: TestData): Promise<{ success: boolean; data?: TestData; error?: string }> {
    try {
      const response = await fetch('/api/tests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testData),
      });
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to save test attempt');
      }
      
      return data;
    } catch (error) {
      console.error('Error saving test attempt:', error);
      throw error;
    }
  },
  
  async getUserTestResults(userId: string): Promise<TestData[]> {
    try {
      const response = await fetch(`/api/tests?userId=${userId}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch test results');
      }
      
      return data.data;
    } catch (error) {
      console.error('Error fetching test results:', error);
      return [];
    }
  },
  
  async getUserTestResult(userId: string, testType: 'pre' | 'post' | 'final'): Promise<TestData | null> {
    try {
      const response = await fetch(`/api/tests?userId=${userId}&testType=${testType}`);
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || 'Failed to fetch test result');
      }
      
      if (data.data && data.data.length > 0) {
        return data.data[0];
      }
      
      return null;
    } catch (error) {
      console.error('Error fetching test result:', error);
      return null;
    }
  }
};

export default TestService;