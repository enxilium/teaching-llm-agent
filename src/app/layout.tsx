'use client'

import type { Metadata } from "next";
import "./globals.css";

import fontVariables from "@/styles/fonts";
import Theme from "@/utils/themeWrapper";
import { FlowProvider, useFlow } from "@/context/FlowContext";
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const { resetFlow } = useFlow();
  const pathname = usePathname();
  
  useEffect(() => {
    // Handle browser refresh/navigation by checking page load
    const handleBeforeUnload = () => {
      // Intentionally don't reset if navigating within the app
      // The FlowProtection component will handle incorrect flow state
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [resetFlow]);
  
  return (
    <html lang="en">
      <body
        className={`${fontVariables} antialiased`}>
          <Theme>
            <FlowProvider>
              {children}
            </FlowProvider>
          </Theme>
      </body>
    </html>
  );
}
