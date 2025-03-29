'use client'

import { useEffect } from 'react';
import { useFlow } from '@/context/FlowContext';

export default function CompletedPage() {
    const { currentStage } = useFlow();
    
    // Ensure user has completed the study
    useEffect(() => {
        if (currentStage !== 'completed') {
            // This prevents direct navigation to the completed page
            window.location.href = '/';
        }
    }, [currentStage]);
    
    return (
        <div className="min-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] flex flex-col items-center justify-center p-4">
            <div className="bg-white bg-opacity-10 rounded-lg p-8 max-w-2xl w-full text-center">
                <div className="mb-6">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500 text-white mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                    </div>
                    
                    <h1 className="text-3xl font-bold text-white mb-4">Study Completed!</h1>
                    
                    <p className="text-white text-lg opacity-80 mb-6">
                        Thank you for participating in our mathematics learning research study. Your contribution is incredibly valuable.
                    </p>
                    
                    <div className="bg-black bg-opacity-20 rounded-lg p-6 text-left mb-6">
                        <h2 className="text-xl font-semibold text-white mb-3">What happens next?</h2>
                        <ul className="text-white opacity-80 space-y-2 list-disc pl-5">
                            <li>Your responses have been recorded</li>
                            <li>The data will be analyzed as part of our research</li>
                            <li>All information is kept confidential</li>
                            <li>You may now close this window</li>
                        </ul>
                    </div>
                    
                    <p className="text-white opacity-70">
                        If you have any questions about this study, please contact the research team.
                    </p>
                </div>
            </div>
        </div>
    );
}