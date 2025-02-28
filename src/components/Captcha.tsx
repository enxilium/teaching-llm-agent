import React, { useEffect, useRef, useState } from 'react';

interface CaptchaComponentProps {
    onChange: (solution: string) => void;
}

const CaptchaComponent: React.FC<CaptchaComponentProps> = ({ onChange }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [captchaText, setCaptchaText] = useState('');

    const generateCaptcha = () => {
        const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
        let text = '';
        for (let i = 0; i < 5; i++) {
            text += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        setCaptchaText(text);
        onChange(text);
    };

    useEffect(() => {
        generateCaptcha();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (canvasRef.current) {
            const canvas = canvasRef.current;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                // Clear canvas and fill background
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = "#f0f0f0";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                // Draw captcha text with some random rotation per character
                ctx.font = "24px Arial";
                ctx.fillStyle = "#000";
                ctx.textBaseline = "middle";
                const charSpacing = 24;
                const x0 = (canvas.width - captchaText.length * charSpacing) / 2;
                const y = canvas.height / 2;
                for (let i = 0; i < captchaText.length; i++) {
                    const char = captchaText[i];
                    const angle = (Math.random() - 0.5) * 0.4; // random rotation between -0.2 and 0.2 radians
                    ctx.save();
                    ctx.translate(x0 + i * charSpacing, y);
                    ctx.rotate(angle);
                    ctx.fillText(char, 0, 0);
                    ctx.restore();
                }
                // Draw random random lines through the CAPTCHA
                for (let i = 0; i < 5; i++) {
                    ctx.beginPath();
                    ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
                    ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
                    ctx.strokeStyle = "#888";
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }
            }
        }
    }, [captchaText]);

    return (
        <div className="flex flex-col items-center">
            <canvas
                ref={canvasRef}
                width={150}
                height={50}
                className="border-2 border-gray-300 rounded mb-2"
            />
            <button onClick={generateCaptcha} className="text-sm text-blue-600 underline">
                Refresh Captcha
            </button>
        </div>
    );
};

export default CaptchaComponent;