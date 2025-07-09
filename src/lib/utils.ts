import "katex/dist/katex.min.css";

// Helper function to format time as MM:SS
export const formatTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds < 10 ? "0" : ""}${remainingSeconds}`;
};

// Helper function to format message for display (UI only)
export const formatMessageForDisplay = (text: string): string => {
    if (!text) return text;

    // Check if message has the reasoning pattern with "No work shown" placeholder
    if (text.includes("My reasoning:") && text.includes("No work shown")) {
        // Replace the entire reasoning section with empty string to hide it
        return text.replace(/\n\nMy reasoning:\n\[No work shown\]/g, "");
    }

    return text;
};

// Helper function to shuffle an array in place (Fisher-Yates algorithm)
export const shuffleArray = <T>(array: T[]): T[] => {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
};
