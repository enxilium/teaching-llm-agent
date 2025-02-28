'use client'

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import CaptchaComponent from '@/components/Captcha';

export default function Terms() {
    const router = useRouter();
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
            <div className="w-full max-w-3xl bg-white bg-opacity-10 rounded-xl p-8 shadow-lg">
                <h1 className="text-3xl font-bold text-white text-center mb-6">Terms and Conditions</h1>
                <div className="h-64 overflow-y-auto bg-white bg-opacity-5 p-6 rounded-lg mb-6 text-white">
                    {/* Paste your terms content here */}
                    <p className="mb-4 font-bold">
                        University of Toronto Research Project Participation Consent Form
                    </p>
                    <p className="mb-4">
                        Researchers at the University of Toronto are studying how people’s usage of Artificial Intelligence impacts their creative thinking abilities. Nowadays, people are often offloading tedious cognitive tasks to various AI tools to boost productivity and save time. Our project investigates the implications this has on human creativity.
                    </p>
                    {/* ... additional terms content ... */}
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

                <div className="flex items-center mb-8">
                    <input
                        type="checkbox"
                        id="accept-terms"
                        checked={termsAccepted}
                        onChange={() => setTermsAccepted(!termsAccepted)}
                        className="mr-3 h-5 w-5"
                    />
                    <label htmlFor="accept-terms" className="text-white">
                        I have read and agree to the terms and conditions
                    </label>
                </div>

                <div className="flex flex-col items-center space-y-6">
                    <h2 className="text-2xl font-bold text-white text-center">
                        Choose Your Learning Experience
                    </h2>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                        {/* Single AI teacher option */}
                        <button
                            onClick={() => router.push('/single')}
                            disabled={!termsAccepted}
                            className={`flex flex-col items-center p-6 rounded-xl border-2 transition-all ${termsAccepted
                                    ? 'bg-blue-600 hover:bg-blue-700 border-white cursor-pointer'
                                    : 'bg-gray-700 border-gray-600 cursor-not-allowed opacity-50'
                                }`}
                        >
                            <Image
                                src="bob_avatar.svg"
                                alt="Bob"
                                width={80}
                                height={80}
                                className="rounded-full mb-4"
                            />
                            <h3 className="text-xl font-bold text-white mb-2">Single AI Teacher</h3>
                            <p className="text-white text-center text-sm">
                                Learn with Bob, your personal AI math teacher
                            </p>
                        </button>

                        {/* Multiple AI agents option */}
                        <button
                            onClick={() => router.push('/multi')}
                            disabled={!termsAccepted}
                            className={`flex flex-col items-center p-6 rounded-xl border-2 transition-all ${termsAccepted
                                    ? 'bg-purple-600 hover:bg-purple-700 border-white cursor-pointer'
                                    : 'bg-gray-700 border-gray-600 cursor-not-allowed opacity-50'
                                }`}
                        >
                            <div className="flex mb-4">
                                <Image
                                    src="logic_avatar.png"
                                    alt="Logic Bot"
                                    width={60}
                                    height={60}
                                    className="rounded-full border-2 border-white -mr-3"
                                />
                                <Image
                                    src="bob_avatar.svg"
                                    alt="Bob"
                                    width={60}
                                    height={60}
                                    className="rounded-full border-2 border-white"
                                />
                                <Image
                                    src="pattern_avatar.png"
                                    alt="Pattern Bot"
                                    width={60}
                                    height={60}
                                    className="rounded-full border-2 border-white -ml-3"
                                />
                            </div>
                            <h3 className="text-xl font-bold text-white mb-2">Multiple AI Assistants</h3>
                            <p className="text-white text-center text-sm">
                                Learn with Bob and specialized AI assistants
                            </p>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}