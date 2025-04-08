'use client'

import { useState } from 'react';
import Image from 'next/image';
import { useFlow } from '@/context/FlowContext';
import CaptchaComponent from '@/components/Captcha';

type FlowStage = 'terms' | 'pre-test' | 'lesson' | 'tetris-break' | 'post-test' | 'final-test' | 'completed';

export default function Terms() {
    const { agreeToTerms } = useFlow();
    const [termsAccepted, setTermsAccepted] = useState(false);
    const [captchaPassed, setCaptchaPassed] = useState(false);
    const [userCaptchaInput, setUserCaptchaInput] = useState("");
    const [captchaSolution, setCaptchaSolution] = useState("");

    const handleCaptchaVerification = (e: React.FormEvent) => {
        e.preventDefault();
        if (userCaptchaInput.trim().toUpperCase() === captchaSolution.toUpperCase()) {
            setCaptchaPassed(true);
        } else {
            alert("Incorrect captcha answer. Please try again.");
        }
    };

    // When captcha hasn't been passed, show captcha component
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

    // Once captcha is passed, display Terms and Conditions page
    return (
        <div className="min-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-8 flex flex-col items-center justify-center">
            <div className="w-full max-w-3xl bg-white bg-opacity-10 rounded-xl p-8 shadow-lg">
                <h1 className="text-3xl font-bold text-white text-center mb-6">Terms and Conditions</h1>
                <div className="h-64 overflow-y-auto bg-white bg-opacity-5 p-6 rounded-lg mb-6 text-white">
                    {/* Your original terms and conditions content */}
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
            </div>
        </div>
    );
}