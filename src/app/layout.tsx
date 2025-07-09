"use client";

import "./globals.css";

import fontVariables from "@/styles/fonts";
import Theme from "@/utils/themeWrapper";
import { FlowProvider, useFlow } from "@/context/FlowContext";
import { useEffect } from "react";

function AppLogic({ children }: { children: React.ReactNode }) {
    const { resetFlow } = useFlow();

    useEffect(() => {
        // Handle browser refresh/navigation by checking page load
        const handleBeforeUnload = () => {
            // Intentionally don't reset if navigating within the app
            // The FlowProtection component will handle incorrect flow state
        };

        window.addEventListener("beforeunload", handleBeforeUnload);

        return () => {
            window.removeEventListener("beforeunload", handleBeforeUnload);
        };
    }, [resetFlow]);

    return <>{children}</>;
}

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={`${fontVariables} antialiased`}>
                <Theme>
                    <FlowProvider>
                        <AppLogic>{children}</AppLogic>
                    </FlowProvider>
                </Theme>
            </body>
        </html>
    );
}
