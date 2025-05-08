import React, { useState, useEffect } from 'react';
import { saveDataToFirebase } from '@/lib/firebase';

/**
 * Admin utility page to recover data from localStorage emergency backups
 * This page is not linked from anywhere and is only for admin use
 */
export default function RecoverPage() {
  const [backups, setBackups] = useState<Record<string, any>>({});
  const [message, setMessage] = useState<string>('');
  const [recoverResults, setRecoverResults] = useState<any[]>([]);
  const [password, setPassword] = useState<string>('');
  const [authenticated, setAuthenticated] = useState(false);
  
  // Check password - simple protection to prevent accidental data recovery
  const authenticate = () => {
    // In production, use a proper authentication mechanism
    // This is just a basic placeholder
    if (password === 'recover123') {
      setAuthenticated(true);
    } else {
      setMessage('Incorrect password');
    }
  };
  
  // Scan localStorage for emergency backups
  const scanLocalStorage = () => {
    if (typeof window === 'undefined') return;
    
    try {
      const backupData: Record<string, any> = {};
      let backupCount = 0;
      
      // Look for all emergency backups
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        
        // Look for keys that match our emergency backup patterns
        if (key.includes('backup') || key.includes('emergency')) {
          try {
            const value = localStorage.getItem(key);
            if (value) {
              const parsedValue = JSON.parse(value);
              backupData[key] = parsedValue;
              backupCount++;
            }
          } catch (e) {
            console.error(`Error parsing backup ${key}:`, e);
          }
        }
      }
      
      setBackups(backupData);
      setMessage(`Found ${backupCount} potential backup items`);
    } catch (e) {
      setMessage(`Error scanning localStorage: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  
  // Recover a specific backup to Firebase
  const recoverBackup = async (key: string, data: any) => {
    try {
      setMessage(`Recovering ${key}...`);
      
      // Extract the actual experimental data from the backup
      // This depends on how the data was stored in the backup
      const experimentData = data.data || data.flowData || data;
      
      // Save to Firebase with extra recovery metadata
      const result = await saveDataToFirebase({
        ...experimentData,
        _recovery: {
          recoveredAt: new Date().toISOString(),
          originalBackupKey: key,
          recoveryType: 'manual'
        }
      });
      
      // Track results
      setRecoverResults(prev => [...prev, { key, success: true, result }]);
      setMessage(`Successfully recovered ${key} to Firebase`);
      
      return true;
    } catch (e) {
      console.error(`Error recovering ${key}:`, e);
      setRecoverResults(prev => [...prev, { 
        key, 
        success: false, 
        error: e instanceof Error ? e.message : String(e) 
      }]);
      setMessage(`Error recovering ${key}: ${e instanceof Error ? e.message : String(e)}`);
      
      return false;
    }
  };
  
  // Recover all backups
  const recoverAllBackups = async () => {
    setMessage('Starting batch recovery...');
    setRecoverResults([]);
    
    const results = {
      total: Object.keys(backups).length,
      successful: 0,
      failed: 0
    };
    
    for (const [key, data] of Object.entries(backups)) {
      const success = await recoverBackup(key, data);
      if (success) {
        results.successful++;
      } else {
        results.failed++;
      }
    }
    
    setMessage(`Recovery complete. Successful: ${results.successful}, Failed: ${results.failed}`);
  };
  
  // Clear a specific backup
  const clearBackup = (key: string) => {
    if (typeof window === 'undefined') return;
    
    try {
      localStorage.removeItem(key);
      
      // Update state
      const newBackups = { ...backups };
      delete newBackups[key];
      setBackups(newBackups);
      
      setMessage(`Cleared backup: ${key}`);
    } catch (e) {
      setMessage(`Error clearing ${key}: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  
  // Clear all backups
  const clearAllBackups = () => {
    if (typeof window === 'undefined') return;
    
    try {
      for (const key of Object.keys(backups)) {
        localStorage.removeItem(key);
      }
      
      setBackups({});
      setMessage('All backups cleared');
    } catch (e) {
      setMessage(`Error clearing backups: ${e instanceof Error ? e.message : String(e)}`);
    }
  };
  
  // Initial scan on page load
  useEffect(() => {
    if (authenticated) {
      scanLocalStorage();
    }
  }, [authenticated]);
  
  if (!authenticated) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Data Recovery Utility</h1>
        <p className="mb-4">Enter the recovery password to continue</p>
        
        <div className="mb-4">
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="border p-2 rounded"
            placeholder="Password"
          />
          <button 
            onClick={authenticate}
            className="ml-2 bg-blue-500 text-white px-4 py-2 rounded"
          >
            Authenticate
          </button>
        </div>
        
        {message && <p className="text-red-500">{message}</p>}
      </div>
    );
  }
  
  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Data Recovery Utility</h1>
      
      <div className="mb-6">
        <button 
          onClick={scanLocalStorage} 
          className="bg-blue-500 text-white px-4 py-2 rounded mr-2"
        >
          Scan LocalStorage
        </button>
        
        <button 
          onClick={recoverAllBackups} 
          className="bg-green-500 text-white px-4 py-2 rounded mr-2"
          disabled={Object.keys(backups).length === 0}
        >
          Recover All to Firebase
        </button>
        
        <button 
          onClick={clearAllBackups} 
          className="bg-red-500 text-white px-4 py-2 rounded"
          disabled={Object.keys(backups).length === 0}
        >
          Clear All Backups
        </button>
      </div>
      
      {message && <p className="mb-4 p-2 bg-gray-100 rounded">{message}</p>}
      
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-2">Recovery Results</h2>
        {recoverResults.length > 0 ? (
          <ul className="list-disc pl-5">
            {recoverResults.map((result, index) => (
              <li key={index} className={result.success ? 'text-green-600' : 'text-red-600'}>
                {result.key}: {result.success ? 'Success' : `Failed - ${result.error}`}
              </li>
            ))}
          </ul>
        ) : (
          <p>No recovery attempts yet</p>
        )}
      </div>
      
      <div>
        <h2 className="text-xl font-semibold mb-2">Available Backups ({Object.keys(backups).length})</h2>
        
        {Object.keys(backups).length > 0 ? (
          <div className="space-y-4">
            {Object.entries(backups).map(([key, data]) => (
              <div key={key} className="border p-4 rounded">
                <div className="flex justify-between items-start">
                  <h3 className="font-medium">{key}</h3>
                  <div>
                    <button 
                      onClick={() => recoverBackup(key, data)} 
                      className="bg-green-500 text-white px-2 py-1 rounded text-sm mr-2"
                    >
                      Recover
                    </button>
                    <button 
                      onClick={() => clearBackup(key)} 
                      className="bg-red-500 text-white px-2 py-1 rounded text-sm"
                    >
                      Clear
                    </button>
                  </div>
                </div>
                
                <div className="mt-2 overflow-auto max-h-40 text-xs bg-gray-100 p-2 rounded">
                  <pre>{JSON.stringify(data, null, 2)}</pre>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p>No backups found</p>
        )}
      </div>
    </div>
  );
} 