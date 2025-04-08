'use client'

import { useState } from 'react';

export default function SessionDebugger() {
  const [userId, setUserId] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  
  const checkSessions = async () => {
    if (!userId) return;
    
    setLoading(true);
    setResult(null);
    
    try {
      // Check user
      const userResponse = await fetch(`/api/users/${userId}`);
      const userData = await userResponse.json();
      
      // Check sessions (include both temp and permanent)
      const allSessionsResponse = await fetch(`/api/sessions?userId=${userId}`);
      const allSessionsData = await allSessionsResponse.json();
      
      // Check permanent sessions only
      const permSessionsResponse = await fetch(`/api/sessions?userId=${userId}&tempRecord=false`);
      const permSessionsData = await permSessionsResponse.json();
      
      setResult({
        user: userData.data || null,
        allSessions: {
          count: allSessionsData.data?.length || 0,
          sessions: allSessionsData.data || []
        },
        permanentSessions: {
          count: permSessionsData.data?.length || 0,
          sessions: permSessionsData.data || []
        }
      });
    } catch (error) {
      setResult({ error: String(error) });
    } finally {
      setLoading(false);
    }
  };
  
  const makeSessionsPermanent = async () => {
    if (!userId) return;
    
    setLoading(true);
    setResult(null);
    
    try {
      // Mark user as completed and permanent
      const userResponse = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: userId,
          flowStage: 'completed',
          tempRecord: false
        })
      });
      
      // Finalize all sessions
      const finalizationResponse = await fetch(`/api/sessions/finalize/${userId}`, {
        method: 'POST'
      });
      
      setResult({
        userUpdate: await userResponse.json(),
        sessionFinalization: await finalizationResponse.json()
      });
      
      // Refresh data after update
      setTimeout(() => checkSessions(), 1000);
    } catch (error) {
      setResult({ error: String(error) });
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div className="mt-6 p-4 bg-white shadow rounded-lg">
      <h2 className="text-xl font-bold mb-4">Session Debug Tool</h2>
      
      <div className="flex gap-3 mb-4">
        <input
          type="text"
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          placeholder="Enter User ID"
          className="flex-1 p-2 border rounded"
        />
        
        <button
          onClick={checkSessions}
          disabled={loading || !userId}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:bg-gray-400"
        >
          Check Status
        </button>
        
        <button
          onClick={makeSessionsPermanent}
          disabled={loading || !userId}
          className="px-4 py-2 bg-green-500 text-white rounded disabled:bg-gray-400"
        >
          Make Permanent
        </button>
      </div>
      
      {loading && <p className="text-gray-500">Loading...</p>}
      
      {result && (
        <div className="mt-4">
          <pre className="bg-gray-100 p-3 rounded text-sm overflow-auto max-h-96">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}