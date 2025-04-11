'use client'

import { useEffect, useState } from 'react';
import { useFlow } from '@/context/FlowContext';
import { useRouter, usePathname } from 'next/navigation';

interface FlowProtectionProps {
  requiredStage: string;
  children: React.ReactNode;
}

export default function FlowProtection({ requiredStage, children }: FlowProtectionProps) {
  const { currentStage, resetFlow } = useFlow();
  const [hasCheckedStage, setHasCheckedStage] = useState(false);
  const pathname = usePathname();
  
  useEffect(() => {
    // Don't check immediately - give time for state to sync
    const timer = setTimeout(() => {
      // Dashboard page is exempt from flow stage requirements
      if (pathname === '/dashboard') {
        console.log("Dashboard page detected, bypassing flow protection checks");
        setHasCheckedStage(true);
        return;
      }
      
      // If not in the required stage, reset flow and redirect to home
      if (currentStage !== requiredStage) {
        console.warn(`Flow protection: Expected ${requiredStage}, got ${currentStage}. Resetting flow.`);
        resetFlow();
      }
      setHasCheckedStage(true);
    }, 300); // Small delay to allow for stage transitions
    
    return () => clearTimeout(timer);
  }, [currentStage, requiredStage, resetFlow, pathname]);
  
  // Show a loading state while we're checking to prevent flash of content
  if (!hasCheckedStage) {
    return <div className="min-h-screen flex items-center justify-center">
      <div className="text-white">Loading...</div>
    </div>;
  }
  
  return <>{children}</>;
}