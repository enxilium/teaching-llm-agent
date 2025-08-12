"use client";

import { useState } from "react";
import Image from "next/image";
import { useFlow } from "@/context/FlowContext";
import CaptchaComponent from "@/components/Captcha";

export default function Terms() {
    const { agreeToTerms } = useFlow();
    const [checked, setChecked] = useState(false);
    const [checkedTwo, setCheckedTwo] = useState(false);
    const [captchaPassed, setCaptchaPassed] = useState(false);
    const [userCaptchaInput, setUserCaptchaInput] = useState("");
    const [captchaSolution, setCaptchaSolution] = useState("");

    const handleCheck = () => setChecked(!checked);
    const handleCheckTwo = () => setCheckedTwo(!checkedTwo);

    const handleCaptchaVerification = (e: React.FormEvent) => {
        e.preventDefault();
        if (
            userCaptchaInput.trim().toUpperCase() ===
            captchaSolution.toUpperCase()
        ) {
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
                    <h1 className="text-2xl font-bold mb-4 text-center">
                        Captcha Verification
                    </h1>
                    <p className="mb-4">
                        Please solve the following captcha to continue:
                    </p>
                    <CaptchaComponent
                        onChange={(solution) => setCaptchaSolution(solution)}
                    />
                    <form onSubmit={handleCaptchaVerification}>
                        <input
                            type="text"
                            value={userCaptchaInput}
                            onChange={(e) =>
                                setUserCaptchaInput(e.target.value)
                            }
                            className="w-full p-2 mb-4 rounded text-black"
                            placeholder="Enter The Captcha"
                        />
                        <button
                            type="submit"
                            className="w-full p-2 bg-blue-600 hover:bg-blue-700 rounded text-white"
                        >
                            Verify
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    // Once captcha is passed, display Terms and Conditions page
    return (
        <div className="min-h-screen bg-gradient-to-b from-[#2D0278] to-[#0A001D] p-8">
            <div className="max-w-3xl mx-auto text-white">
                <h1 className="text-3xl font-bold text-white text-center mb-6">
                    Terms and Conditions
                </h1>
                <div className="mb-6">
                    {/* Your original terms and conditions content */}
                    <p className="mb-4 font-bold">
                        University of Toronto Research Project Participation
                        Consent Form
                    </p>
                    <p className="mb-4">
                        Researchers at the University of Toronto are studying
                        how different types of feedback affect people&apos;s
                        ability to solve multiple choice mathematical problems.
                        Researchers will vary the types of information offered
                        to different participants in a Lesson round, and then
                        study how they answer similar questions in a final Test round.
                    </p>

                    <p className="mb-4">
                        In this task, you will solve multiple-choice math
                        problems about exponents. After some practice questions,
                        you will receive feedback in a &quot;Lesson&quot; round, then move
                        on to more similar questions in a final &quot;Test&quot; round. The
                        problems are similar to those commonly found on
                        standardized tests.
                    </p>

                    <p className="mb-4">
                        By clicking the survey, you agree that:
                        <br />
                        • You have read and understood the information on this
                        sheet;
                        <br />
                        • You are at least 18 years of age;
                        <br />
                        • You consent to participation and data collection for
                        the aforementioned purposes;
                        <br />
                        • You may freely withdraw until the aforementioned date;
                        <br />• You assign to the researchers all copyright of
                        your survey contributions for use in all current and
                        future work stemming from this project.
                    </p>

                    <div className="text-2xl mb-4">
                        <div className="text-red-700 font-bold">
                            Important: Please do not take screenshots, copy any
                            text, or consult external tools (e.g.,
                            &quot;ChatGPT&quot;).
                        </div>
                        We&apos;re just interested in your best effort and what
                        you learn. The experiment will be ruined if you take
                        screenshots or use external tools to do this task. So
                        please do not do so! In fact, you have no reason to do
                        so because you are not paid based on performance.
                    </div>

                    <div className="text-2xl text-red-700 font-bold mb-8">
                        Please do not refresh the page or use the browser&apos;s
                        back/forward buttons. Refreshing the page will lose any
                        progress you have made and you may not receive any
                        compensation
                    </div>

                    <div className="text-center mb-8">
                        <Image
                            src="/cheat-icon.png"
                            alt="No screenshots or external tools allowed"
                            width={500}
                            height={500}
                            style={{
                                maxWidth: "40%",
                                height: "auto",
                                display: "block",
                                margin: "0px auto",
                            }}
                        />
                    </div>

                    <hr style={{ marginTop: "20px", marginBottom: "20px" }} />
                </div>
                <div className="flex flex-col space-y-4 mb-6">
                    <label className="text-xl mt-2 flex items-start text-white">
                        <input
                            type="checkbox"
                            checked={checked}
                            onChange={handleCheck}
                            className="mr-3 h-5 w-5 mt-1"
                        />
                        <span>
                            <b>
                                I promise not to take screenshots, pictures, or
                                use external tools to do this study. I
                                understand that I will not be paid more if I do
                                so and it will only ruin the experiment*
                            </b>
                        </span>
                    </label>
                    <label className="text-xl mt-2 flex items-start text-white">
                        <input
                            type="checkbox"
                            checked={checkedTwo}
                            onChange={handleCheckTwo}
                            className="mr-3 h-5 w-5 mt-1"
                        />
                        <span>
                            <b>
                                I understand the instructions above and am ready
                                to continue*
                            </b>
                        </span>
                    </label>
                </div>
                <div className="flex justify-center">
                    <button
                        onClick={agreeToTerms}
                        disabled={!checked || !checkedTwo}
                        className={`px-8 py-3 rounded-lg ${
                            checked && checkedTwo
                                ? "bg-purple-600 hover:bg-purple-700 text-white"
                                : "bg-gray-500 text-gray-300 cursor-not-allowed"
                        }`}
                    >
                        Continue to Introduction
                    </button>
                </div>
            </div>
        </div>
    );
}
