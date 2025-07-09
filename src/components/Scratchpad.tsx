import React from "react";

interface ScratchpadProps {
    content: string;
    onContentChange: (content: string) => void;
    isReadOnly: boolean;
}

const Scratchpad: React.FC<ScratchpadProps> = ({
    content,
    onContentChange,
    isReadOnly,
}) => {
    return (
        <div className="flex-1 border border-gray-600 rounded-md p-3 bg-black bg-opacity-30 overflow-auto">
            <textarea
                value={content}
                onChange={(e) => onContentChange(e.target.value)}
                className="w-full h-[calc(100%-40px)] min-h-[200px] bg-black bg-opacity-40 text-white border-none rounded p-2"
                placeholder="Space for scratch work..."
                readOnly={isReadOnly}
            />
        </div>
    );
};

export default Scratchpad;
