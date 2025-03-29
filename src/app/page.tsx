'use client'

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { useFlow } from '@/context/FlowContext';
import CaptchaComponent from '@/components/Captcha';

type FlowStage = 'terms' | 'pre-test' | 'lesson' | 'tetris-break' | 'post-test' | 'final-test' | 'completed';

export default function Terms() {
    const { agreeToTerms, currentStage, resetFlow } = useFlow();
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [captchaPassed, setCaptchaPassed] = useState(false);
    const [userCaptchaInput, setUserCaptchaInput] = useState("");
    const [captchaSolution, setCaptchaSolution] = useState("");
    const [showResumeBanner, setShowResumeBanner] = useState(false);
    const [resumeDestination, setResumeDestination] = useState('');
    const [debugInfo, setDebugInfo] = useState({
        stage: '',
        lessonType: '',
        questionIndex: ''
    });
    
    // Refresh debug information
    const refreshDebugInfo = () => {
        if (typeof window !== 'undefined') {
            setDebugInfo({
                stage: localStorage.getItem('currentStage') || 'Not set',
                lessonType: localStorage.getItem('lessonType') || 'Not set',
                questionIndex: localStorage.getItem('lessonQuestionIndex') || 'Not set'
            });
        }
    };
    
    // Check if user has a session to resume, but don't redirect automatically
    useEffect(() => {
        refreshDebugInfo(); // Initialize debug info
        
        if (currentStage !== 'terms') {
            let destination = '';
            
            switch(currentStage) {
                case 'pre-test':
                    destination = '/test?stage=pre';
                    break;
                case 'lesson':
                    const lessonType = localStorage.getItem('lessonType') || 'solo';
                    destination = `/${lessonType}`;
                    break;
                case 'tetris-break':
                    destination = '/break';
                    break;
                case 'post-test':
                    destination = '/test?stage=post';
                    break;
                case 'final-test':
                    destination = '/test?stage=final';
                    break;
                case 'completed':
                    destination = '/completed';
                    break;
                default:
                    break;
            }
            
            if (destination) {
                setResumeDestination(destination);
                setShowResumeBanner(true);
            }
        }
    }, [currentStage]);
    
    // Function to handle resuming the session
    const handleResume = () => {
        if (resumeDestination) {
            window.location.href = resumeDestination;
        }
    };
    
    // Function to handle starting a new session
    const handleStartNew = () => {
        console.log("Starting new session...");
        
        // First clear localStorage directly
        localStorage.clear();
        console.log("LocalStorage cleared");
        
        // Then reset flow state
        resetFlow();
        
        // Clear UI state
        setShowResumeBanner(false);
        setResumeDestination('');
        
        // Refresh debug info immediately and again after a delay
        refreshDebugInfo();
        console.log("Debug info refreshed initially");
        
        // Set a longer timeout to ensure state updates are complete
        setTimeout(() => {
            console.log("Running delayed debug info refresh");
            refreshDebugInfo();
        }, 300);
    };
    
    // Add a debug panel
    const DebugPanel = () => (
        <div className="mt-8 bg-black bg-opacity-30 p-4 rounded-lg text-white text-left">
            <div className="flex justify-between items-center mb-3">
                <h3 className="font-bold text-lg text-center">Debug Panel</h3>
                <button 
                    onClick={refreshDebugInfo}
                    className="text-sm bg-blue-900 hover:bg-blue-800 px-2 py-1 rounded"
                >
                    Refresh
                </button>
            </div>
            
            <div className="mb-4">
                <p className="font-semibold">Current Flow State:</p>
                <ul className="ml-4 text-sm">
                    <li>Current Stage: <span className="text-yellow-300">{debugInfo.stage}</span></li>
                    <li>Lesson Type: <span className="text-yellow-300">{debugInfo.lessonType}</span></li>
                    <li>Question Index: <span className="text-yellow-300">{debugInfo.questionIndex}</span></li>
                </ul>
            </div>
            
            <div className="mb-4">
                <p className="font-semibold">Force Lesson Type:</p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                    {['solo', 'single', 'multi', 'group'].map(type => (
                        <button
                            key={type}
                            onClick={() => {
                                localStorage.setItem('lessonType', type);
                                localStorage.setItem('currentStage', 'lesson');
                                console.log(`Forced lesson type: ${type}`);
                                alert(`Lesson type set to ${type}. Click "Resume" in the banner to navigate there.`);
                                setResumeDestination(`/${type}`);
                                setShowResumeBanner(true);
                                refreshDebugInfo();
                            }}
                            className={`px-3 py-1 text-sm rounded-md ${
                                debugInfo.lessonType === type 
                                ? 'bg-green-700 border border-green-500' 
                                : 'bg-gray-700 hover:bg-gray-600'
                            }`}
                        >
                            {type}
                        </button>
                    ))}
                </div>
            </div>
            
            <div className="border-t border-gray-600 pt-3 mt-3">
                <button
                    onClick={() => {
                        // Generate truly random type
                        const types = ['solo', 'single', 'multi', 'group'];
                        // Use current time to create a "more random" selection
                        const seed = Date.now();
                        const randomIndex = Math.floor(seed % types.length);
                        const randomType = types[randomIndex];
                        
                        console.log(`Generated random type: ${randomType} (index ${randomIndex})`);
                        
                        // Clear all storage
                        localStorage.clear();
                        
                        // Set new random type
                        localStorage.setItem('lessonType', randomType);
                        localStorage.setItem('currentStage', 'lesson');
                        localStorage.setItem('lessonQuestionIndex', Math.floor(Math.random() * 2).toString());
                        
                        // Update UI
                        setResumeDestination(`/${randomType}`);
                        setShowResumeBanner(true);
                        refreshDebugInfo();
                        
                        alert(`Random lesson type: ${randomType}. Click "Resume" to navigate there.`);
                    }}
                    className="w-full bg-purple-800 hover:bg-purple-700 py-1 rounded-md text-sm"
                >
                    Generate Random Type
                </button>
            </div>
        </div>
    );
    
    const handleCaptchaVerification = (e: React.FormEvent) => {
        e.preventDefault();
        if (userCaptchaInput.trim().toUpperCase() === captchaSolution.toUpperCase()) {
            setCaptchaPassed(true);
        } else {
            alert("Incorrect captcha answer. Please try again.");
        }
    };

    // If captcha hasn't been passed yet, show the captcha test
    if (!captchaPassed) {
        return (
            <div className="min-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-8 flex flex-col items-center justify-center">
                <div className="w-full max-w-md bg-white bg-opacity-10 rounded-xl p-8 shadow-lg text-white">
                    <h1 className="text-2xl font-bold mb-4 text-center">Captcha Verification</h1>
                    <p className="mb-4">Please solve the following captcha to continue:</p>
                    <CaptchaComponent onChange={(solution) => setCaptchaSolution(solution)} />
                    <form onSubmit={handleCaptchaVerification}>
                        <input
                            type="text"
                            value={userCaptchaInput}
                            onChange={(e) => setUserCaptchaInput(e.target.value)}
                            className="w-full p-2 mb-4 rounded text-black"
                            placeholder="Enter The Captcha"
                        />
                        <button type="submit" className="w-full p-2 bg-blue-600 hover:bg-blue-700 rounded text-white">
                            Verify
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // If captcha passed, show the Terms and Conditions page as before
    return (
        <div className="min-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-8 flex flex-col items-center justify-center">
            {/* Resume Session Banner */}
            {showResumeBanner && (
                <div className="w-full max-w-3xl bg-blue-900 bg-opacity-70 rounded-xl p-4 mb-6 shadow-lg text-white">
                    <div className="flex justify-between items-center">
                        <div>
                            <h3 className="text-lg font-semibold">Resume Your Session?</h3>
                            <p className="text-sm opacity-90">
                                You have an unfinished session. Would you like to continue where you left off?
                            </p>
                        </div>
                        <div className="flex gap-3">
                            <button 
                                onClick={handleResume}
                                className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded text-white"
                            >
                                Resume
                            </button>
                            <button 
                                onClick={handleStartNew}
                                className="px-4 py-2 bg-gray-600 hover:bg-gray-700 rounded text-white"
                            >
                                Start New
                            </button>
                        </div>
                    </div>
                </div>
            )}
            
            <div className="w-full max-w-3xl bg-white bg-opacity-10 rounded-xl p-8 shadow-lg">
                <h1 className="text-3xl font-bold text-white text-center mb-6">Terms and Conditions</h1>
                <div className="h-64 overflow-y-auto bg-white bg-opacity-5 p-6 rounded-lg mb-6 text-white">
                    {/* Paste your terms content here */}
                    <p className="mb-4 font-bold">
                        University of Toronto Research Project Participation Consent Form
                    </p>
                    <p className="mb-4">
                        Researchers at the University of Toronto are studying how people's usage of Artificial Intelligence impacts their creative thinking abilities. Nowadays, people are often offloading tedious cognitive tasks to various AI tools to boost productivity and save time. Our project investigates the implications this has on human creativity.
                    </p>
                    <p className="mb-4">
                        By clicking the survey, you agree that:
                        <br />
                        • You have read and understood the information on this sheet;
                        <br />
                        • You are at least 18 years of age;
                        <br />
                        • You consent to participation and data collection for the aforementioned purposes;
                        <br />
                        • You may freely withdraw until the aforementioned date;
                        <br />
                        • You assign to the researchers all copyright of your survey contributions for use in all current and future work stemming from this project.
                    </p>
                </div>
                <div className="flex items-center mb-6">
                    <input
                        id="accept-terms"
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={() => setTermsAccepted(!termsAccepted)}
                        className="mr-3 h-5 w-5"
                    />
                    <label htmlFor="accept-terms" className="text-white">
                        I accept the terms and conditions
                    </label>
                </div>
                <div className="flex justify-center">
                    <button
                        onClick={agreeToTerms}
                        disabled={!termsAccepted}
                        className={`px-8 py-3 rounded-lg ${termsAccepted 
                            ? 'bg-purple-600 hover:bg-purple-700 text-white' 
                            : 'bg-gray-500 text-gray-300 cursor-not-allowed'
                        }`}
                    >
                        Begin Study
                    </button>
                </div>
                {/* Add reset button for breaking loops */}
                <div className="mt-8 text-center flex flex-col gap-2">
                    <button
                        onClick={() => {
                            resetFlow();
                            refreshDebugInfo();
                        }}
                        className="text-gray-400 hover:text-white text-sm underline"
                    >
                        Reset Study (Debug)
                    </button>
                    
                    <button
                        onClick={() => {
                            // Clear all localStorage items
                            localStorage.clear();
                            // Refresh debug info
                            refreshDebugInfo();
                            // Reload page with timestamp to prevent caching
                            window.location.href = '/?t=' + Date.now();
                        }}
                        className="text-gray-400 hover:text-white text-sm underline mt-4"
                    >
                        Start Fresh (Clear Data)
                    </button>
                </div>
                
                {/* Debug Panel */}
                <DebugPanel />
            </div>
        </div>
    );
}