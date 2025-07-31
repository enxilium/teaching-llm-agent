"use client";

import { useState } from "react";
import { useFlow } from "@/context/FlowContext";
import { LessonType } from "@/utils/types";

interface ScenarioSelectorProps {
    onSelected?: () => void;
}

const ScenarioSelector: React.FC<ScenarioSelectorProps> = ({ onSelected }) => {
    const { lessonType, overrideLessonType } = useFlow();
    const [selectedScenario, setSelectedScenario] = useState<LessonType | "">(lessonType || "");

    // Only show in development environment
    if (process.env.NODE_ENV !== "development") {
        return null;
    }

    const scenarios: { value: LessonType; label: string; description: string }[] = [
        {
            value: "group",
            label: "Group",
            description: "User + Alice (arithmetic errors) + Charlie (concept errors)"
        },
        {
            value: "multi",
            label: "Multi",
            description: "User + Bob (tutor) + one error-prone agent"
        },
        {
            value: "single",
            label: "Single",
            description: "User + Bob (tutor) only"
        },
        {
            value: "solo",
            label: "Solo",
            description: "User works alone"
        }
    ];

    const handleScenarioChange = (scenario: LessonType) => {
        setSelectedScenario(scenario);
        overrideLessonType(scenario);
        onSelected?.();
    };

    return (
        <div className="w-full max-w-md bg-yellow-100 border-2 border-yellow-400 rounded-xl p-6 shadow-lg">
            <div className="flex items-center gap-2 mb-4">
                <span className="text-yellow-700 text-xl">🔧</span>
                <h2 className="text-lg font-bold text-yellow-800">
                    Development: Scenario Override
                </h2>
            </div>
            
            <p className="text-yellow-700 mb-4 text-sm">
                Override the deterministic scenario assignment for testing.
                Current: <span className="font-semibold">{lessonType || "Not set"}</span>
            </p>

            <div className="space-y-3">
                {scenarios.map((scenario) => (
                    <label
                        key={scenario.value}
                        className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                            selectedScenario === scenario.value
                                ? "border-yellow-500 bg-yellow-50"
                                : "border-yellow-200 bg-white hover:bg-yellow-50"
                        }`}
                    >
                        <input
                            type="radio"
                            name="scenario"
                            value={scenario.value}
                            checked={selectedScenario === scenario.value}
                            onChange={() => handleScenarioChange(scenario.value)}
                            className="mt-1 text-yellow-600"
                        />
                        <div>
                            <div className="font-semibold text-yellow-800">
                                {scenario.label}
                            </div>
                            <div className="text-sm text-yellow-600">
                                {scenario.description}
                            </div>
                        </div>
                    </label>
                ))}
            </div>

            <div className="mt-4 text-xs text-yellow-600">
                ⚠️ This selector only appears in development mode
            </div>
        </div>
    );
};

export default ScenarioSelector;
