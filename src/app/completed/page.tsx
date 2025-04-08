'use client'

import { useState, useEffect } from 'react';
import { useFlow } from '@/context/FlowContext';

export default function CompletedPage() {
  const { userId, submitAllDataToDatabase, saveSurveyData } = useFlow();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  
  const [surveyAnswers, setSurveyAnswers] = useState({
    confusionLevel: '',
    difficultyLevel: '',
    correctnessPerception: '',
    learningAmount: '',
    prosAndCons: ''
  });
  
  const handleInputChange = (e: { target: { name: any; value: any; }; }) => {
    const { name, value } = e.target;
    setSurveyAnswers(prev => ({
      ...prev,
      [name]: value
    }));
  };
  
  const handleSubmit = async (e: { preventDefault: () => void; }) => {
    e.preventDefault();
    
    if (isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      console.log("Submitting survey data:", surveyAnswers);
      
      // First save survey data to flow context
      saveSurveyData(surveyAnswers);
      
      // Log to confirm it was saved
      console.log("Survey data saved to flow context:", surveyAnswers);
      
      // Add a small delay to ensure the context is updated
      await new Promise(resolve => setTimeout(resolve, 300));
      
      // Then submit all data (sessions, tests, survey) to database
      await submitAllDataToDatabase();
      
      setHasSubmitted(true);
      console.log("All data successfully submitted");
    } catch (error) {
      console.error("Error submitting data:", error);
      alert("There was an error submitting your data. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-8">
      <div className="max-w-4xl mx-auto bg-white bg-opacity-10 p-8 rounded-xl text-white">
        <h1 className="text-4xl font-bold mb-6">Completed!</h1>
        
        {!hasSubmitted ? (
          <>
            <p className="mb-6">Thank you for participating in this study. Before you go, please complete this brief survey:</p>
            
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block mb-2">How confused did you feel during the lesson?</label>
                <select 
                  name="confusionLevel" 
                  value={surveyAnswers.confusionLevel}
                  onChange={handleInputChange}
                  required
                  className="w-full p-3 bg-white bg-opacity-10 rounded border border-gray-500 text-white"
                >
                  <option value="">Select an option</option>
                  <option value="not_at_all">Not at all confused</option>
                  <option value="slightly">Slightly confused</option>
                  <option value="moderately">Moderately confused</option>
                  <option value="very">Very confused</option>
                </select>
              </div>
              
              <div>
                <label className="block mb-2">How difficult did you find the test question?</label>
                <select 
                  name="difficultyLevel" 
                  value={surveyAnswers.difficultyLevel}
                  onChange={handleInputChange}
                  required
                  className="w-full p-3 bg-white bg-opacity-10 rounded border border-gray-500 text-white"
                >
                  <option value="">Select an option</option>
                  <option value="very_easy">Very easy</option>
                  <option value="somewhat_easy">Somewhat easy</option>
                  <option value="somewhat_difficult">Somewhat difficult</option>
                  <option value="very_difficult">Very difficult</option>
                </select>
              </div>
              
              <div>
                <label className="block mb-2">Do you think you got the test question right?</label>
                <select 
                  name="correctnessPerception" 
                  value={surveyAnswers.correctnessPerception}
                  onChange={handleInputChange}
                  required
                  className="w-full p-3 bg-white bg-opacity-10 rounded border border-gray-500 text-white"
                >
                  <option value="">Select an option</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              
              <div>
                <label className="block mb-2">How much did you learn from the lesson (after practice problems)?</label>
                <select 
                  name="learningAmount" 
                  value={surveyAnswers.learningAmount}
                  onChange={handleInputChange}
                  required
                  className="w-full p-3 bg-white bg-opacity-10 rounded border border-gray-500 text-white"
                >
                  <option value="">Select an option</option>
                  <option value="nothing">Nothing</option>
                  <option value="a_little">A little</option>
                  <option value="a_lot">A lot</option>
                </select>
              </div>
              
              <div>
                <label className="block mb-2">What were the pros and cons of the lesson round?</label>
                <textarea
                  name="prosAndCons"
                  value={surveyAnswers.prosAndCons}
                  onChange={handleInputChange}
                  required
                  rows={4}
                  className="w-full p-3 bg-white bg-opacity-10 rounded border border-gray-500 text-white"
                  placeholder="Please share your thoughts on what worked well and what could be improved..."
                />
              </div>
              
              <button
                type="submit"
                disabled={isSubmitting}
                className={`px-6 py-3 rounded-lg ${
                  isSubmitting 
                    ? 'bg-gray-500 cursor-not-allowed' 
                    : 'bg-blue-600 hover:bg-blue-700'
                } text-white font-medium flex items-center justify-center`}
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Submitting...
                  </>
                ) : (
                  'Submit Survey & Complete'
                )}
              </button>
            </form>
          </>
        ) : (
          <div className="text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-green-500 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <h2 className="text-2xl font-bold mb-4">Thank You!</h2>
            <p className="mb-6">Your responses have been successfully submitted.</p>
            <p>You may close this window now.</p>
          </div>
        )}
      </div>
    </div>
  );
}