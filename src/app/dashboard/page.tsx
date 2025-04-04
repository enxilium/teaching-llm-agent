'use client'

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardPage() {
  const router = useRouter();
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [testResults, setTestResults] = useState([]);
  const [loading, setLoading] = useState(true);

  // For detailed views
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedSession, setSelectedSession] = useState(null);
  const [selectedTest, setSelectedTest] = useState(null);

  // For filtering
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch users
        const usersRes = await fetch('/api/users');
        const usersData = await usersRes.json();

        // Fetch recent sessions
        const sessionsRes = await fetch('/api/sessions');
        const sessionsData = await sessionsRes.json();

        // Fetch test statistics
        const testsRes = await fetch('/api/tests');
        const testsData = await testsRes.json();

        setUsers(usersData.data || []);
        setSessions(sessionsData.data || []);
        setTestResults(testsData.data || []);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  const fetchUserDetails = async (userId) => {
    setSelectedUser({ ...selectedUser, loading: true });
    try {
      // Fetch user sessions
      const sessionsRes = await fetch(`/api/sessions?userId=${userId}`);
      const sessionsData = await sessionsRes.json();

      // Fetch user test results
      const testsRes = await fetch(`/api/tests?userId=${userId}`);
      const testsData = await testsRes.json();

      setSelectedUser({
        userId,
        sessions: sessionsData.data || [],
        tests: testsData.data || [],
        loading: false
      });
    } catch (error) {
      console.error('Error fetching user details:', error);
      setSelectedUser({ ...selectedUser, loading: false, error: true });
    }
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <div className="page-container bg-gray-100">
      {/* Dashboard Header */}
      <div className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <h1 className="text-3xl font-bold text-gray-900">Learning Platform Dashboard</h1>
            <div className="flex space-x-4">
              <button 
                onClick={() => setActiveTab('overview')}
                className={`px-4 py-2 rounded-md ${activeTab === 'overview' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              >
                Overview
              </button>
              <button 
                onClick={() => setActiveTab('users')}
                className={`px-4 py-2 rounded-md ${activeTab === 'users' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              >
                Users
              </button>
              <button 
                onClick={() => setActiveTab('sessions')}
                className={`px-4 py-2 rounded-md ${activeTab === 'sessions' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              >
                Sessions
              </button>
              <button 
                onClick={() => setActiveTab('tests')}
                className={`px-4 py-2 rounded-md ${activeTab === 'tests' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              >
                Test Results
              </button>
            </div>
          </div>
        </div>
      </div>
      
      {/* Content Area - Now naturally scrollable */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <p className="text-xl text-gray-500">Loading dashboard data...</p>
          </div>
        ) : activeTab === 'overview' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Users Stats Card */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-4">Users</h2>
              <p className="text-4xl font-bold">{users.length}</p>
              <div className="mt-4">
                <h3 className="font-medium text-gray-700 mb-2">Progress Breakdown:</h3>
                {calculateProgressStats(users).map((stat) => (
                  <div key={stat.stage} className="flex justify-between items-center mb-1">
                    <span>{stat.stage}</span>
                    <span className="font-medium">{stat.count} users</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Sessions Stats */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold mb-4">Sessions</h2>
              <p className="text-4xl font-bold">{sessions.length}</p>
              <div className="mt-4">
                <h3 className="font-medium text-gray-700 mb-2">Performance:</h3>
                <div className="flex justify-between items-center mb-1">
                  <span>Correct Answers</span>
                  <span className="font-medium">{calculateCorrectSessions(sessions)} sessions</span>
                </div>
                <div className="flex justify-between items-center mb-1">
                  <span>Incorrect Answers</span>
                  <span className="font-medium">{calculateIncorrectSessions(sessions)} sessions</span>
                </div>
                <div className="flex justify-between items-center mb-1">
                  <span>Timeout Occurred</span>
                  <span className="font-medium">{calculateTimeoutSessions(sessions)} sessions</span>
                </div>
                <div className="mt-3">
                  <h3 className="font-medium text-gray-700 mb-2">Average Duration:</h3>
                  <p className="text-2xl font-bold">{calculateAverageDuration(sessions).toFixed(1)} seconds</p>
                </div>
              </div>
            </div>

            {/* Test Results Overview */}
            <div className="bg-white p-6 rounded-lg shadow-md md:col-span-2">
              <h2 className="text-xl font-semibold mb-4">Test Results</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-gray-50 p-4 rounded-md">
                  <h3 className="font-medium text-gray-700 mb-2">Pre-Tests</h3>
                  <p className="text-3xl font-bold">{calculateAvgScore(testResults, 'pre').toFixed(1)}%</p>
                  <p className="text-sm text-gray-600 mt-1">Average score across {countTestType(testResults, 'pre')} tests</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-md">
                  <h3 className="font-medium text-gray-700 mb-2">Post-Tests</h3>
                  <p className="text-3xl font-bold">{calculateAvgScore(testResults, 'post').toFixed(1)}%</p>
                  <p className="text-sm text-gray-600 mt-1">Average score across {countTestType(testResults, 'post')} tests</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-md">
                  <h3 className="font-medium text-gray-700 mb-2">Final Tests</h3>
                  <p className="text-3xl font-bold">{calculateAvgScore(testResults, 'final').toFixed(1)}%</p>
                  <p className="text-sm text-gray-600 mt-1">Average score across {countTestType(testResults, 'final')} tests</p>
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'users' ? (
          <div>
            <h2 className="text-2xl font-bold mb-6">User Details</h2>

            {/* User Listing */}
            <div className="bg-white shadow overflow-hidden rounded-md">
              <ul className="divide-y divide-gray-200">
                {users.map((user) => (
                  <li key={user._id} className="px-6 py-4 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-lg font-medium">{user.userId}</h3>
                        <div className="mt-1 flex space-x-4 text-sm text-gray-500">
                          <div>Stage: <span className="font-medium">{user.flowStage}</span></div>
                          <div>Lesson: <span className="font-medium">{user.lessonType}</span></div>
                          <div>Question: <span className="font-medium">{user.lessonQuestionIndex}</span></div>
                          <div>Created: <span className="font-medium">{formatDate(user.createdAt)}</span></div>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSelectedUser({ userId: user.userId, loading: true });
                          fetchUserDetails(user.userId);
                        }}
                        className="px-3 py-1 bg-blue-100 text-blue-800 rounded-md hover:bg-blue-200"
                      >
                        View Details
                      </button>
                    </div>

                    {/* User Details Expansion */}
                    {selectedUser && selectedUser.userId === user.userId && (
                      <div className="mt-4 border-t pt-4">
                        {selectedUser.loading ? (
                          <p>Loading user details...</p>
                        ) : selectedUser.error ? (
                          <p>Error loading user details.</p>
                        ) : (
                          <div className="space-y-6">
                            {/* User's Test Results */}
                            <div>
                              <h4 className="text-lg font-medium mb-2">Test Results</h4>
                              {selectedUser.tests.length === 0 ? (
                                <p>No test attempts found.</p>
                              ) : (
                                <div className="space-y-4">
                                  {selectedUser.tests.map((test) => (
                                    <div key={test._id} className="bg-gray-50 p-4 rounded-md">
                                      <div className="flex justify-between">
                                        <h5 className="font-medium">{test.testType.toUpperCase()} Test</h5>
                                        <span className="text-sm text-gray-500">{formatDate(test.createdAt)}</span>
                                      </div>
                                      <p className="text-2xl font-bold mt-1">{test.score.toFixed(1)}%</p>

                                      <div className="mt-3">
                                        <h6 className="font-medium mb-2">Question Results:</h6>
                                        <div className="space-y-3">
                                          {test.questions.map((q, idx) => (
                                            <div key={idx} className={`p-3 rounded-md ${q.isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                                              <p className="font-medium">{q.question}</p>
                                              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                                                <div>
                                                  <span className="text-gray-600">User Answer:</span>
                                                  <p className={`font-medium ${q.isCorrect ? 'text-green-700' : 'text-red-700'}`}>{q.userAnswer || '(no answer)'}</p>
                                                </div>
                                                <div>
                                                  <span className="text-gray-600">Correct Answer:</span>
                                                  <p className="font-medium text-green-700">{q.correctAnswer}</p>
                                                </div>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* User's Sessions */}
                            <div>
                              <h4 className="text-lg font-medium mb-2">Learning Sessions</h4>
                              {selectedUser.sessions.length === 0 ? (
                                <p>No sessions found.</p>
                              ) : (
                                <div className="space-y-4">
                                  {selectedUser.sessions.map((session) => (
                                    <div key={session._id} className="bg-gray-50 p-4 rounded-md">
                                      <div className="flex justify-between">
                                        <h5 className="font-medium">Question #{session.questionId}</h5>
                                        <span className={`px-2 py-1 rounded-full text-xs ${session.isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                                          {session.isCorrect ? 'Correct' : 'Incorrect'}
                                          {session.timeoutOccurred && ' (Timeout)'}
                                        </span>
                                      </div>

                                      <p className="mt-2 text-sm text-gray-700">{session.questionText}</p>

                                      <div className="mt-3 grid grid-cols-2 gap-4">
                                        <div>
                                          <h6 className="text-sm font-medium text-gray-600">Duration</h6>
                                          <p className="text-md">{session.duration} seconds</p>
                                        </div>
                                        <div>
                                          <h6 className="text-sm font-medium text-gray-600">Date</h6>
                                          <p className="text-md">{formatDate(session.createdAt)}</p>
                                        </div>
                                      </div>

                                      <div className="mt-4">
                                        <button 
                                          className="text-blue-600 hover:text-blue-800"
                                          onClick={() => setSelectedSession(selectedSession && selectedSession._id === session._id ? null : session)}
                                        >
                                          {selectedSession && selectedSession._id === session._id ? 'Hide Details' : 'Show Details'}
                                        </button>

                                        {selectedSession && selectedSession._id === session._id && (
                                          <div className="mt-3 space-y-4">
                                            <div>
                                              <h6 className="text-sm font-medium text-gray-600 mb-1">Final Answer</h6>
                                              <div className="bg-white p-3 rounded border">
                                                <p className="whitespace-pre-wrap">{session.finalAnswer}</p>
                                              </div>
                                            </div>

                                            <div>
                                              <h6 className="text-sm font-medium text-gray-600 mb-1">Scratch Work</h6>
                                              <div className="bg-white p-3 rounded border overflow-auto max-h-64">
                                                <pre className="text-sm whitespace-pre-wrap font-mono">{session.scratchboardContent}</pre>
                                              </div>
                                            </div>

                                            <div>
                                              <h6 className="text-sm font-medium text-gray-600 mb-1">Conversation</h6>
                                              <div className="bg-white rounded border overflow-auto max-h-96">
                                                {session.messages.map((msg, idx) => (
                                                  <div key={idx} className={`p-3 ${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'} border-b`}>
                                                    <div className="flex justify-between mb-1">
                                                      <span className={`font-medium ${msg.sender === 'user' ? 'text-blue-700' : 'text-green-700'}`}>
                                                        {msg.sender === 'user' ? 'Student' : msg.agentId || 'AI Agent'}
                                                      </span>
                                                      <span className="text-xs text-gray-500">{formatDate(msg.timestamp)}</span>
                                                    </div>
                                                    <p className="whitespace-pre-wrap">{msg.text}</p>
                                                  </div>
                                                ))}
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ) : activeTab === 'sessions' ? (
          <div>
            <h2 className="text-2xl font-bold mb-6">Learning Sessions</h2>

            <div className="bg-white shadow overflow-hidden rounded-md">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Question</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Result</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {sessions.map((session) => (
                    <tr key={session._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {session.userId.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        #{session.questionId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 py-1 text-xs rounded-full ${session.isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {session.isCorrect ? 'Correct' : 'Incorrect'}
                          {session.timeoutOccurred && ' (Timeout)'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {session.duration}s
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(session.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button 
                          className="text-blue-600 hover:text-blue-800"
                          onClick={() => setSelectedSession(selectedSession && selectedSession._id === session._id ? null : session)}
                        >
                          {selectedSession && selectedSession._id === session._id ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Selected Session Details */}
              {selectedSession && (
                <div className="border-t p-6 bg-gray-50">
                  <h3 className="text-lg font-medium mb-4">Session Details</h3>

                  <div className="grid grid-cols-2 gap-8">
                    <div>
                      <h4 className="font-medium mb-2">Question</h4>
                      <p className="bg-white p-3 rounded border">{selectedSession.questionText}</p>

                      <h4 className="font-medium mt-4 mb-2">Final Answer</h4>
                      <div className="bg-white p-3 rounded border">
                        <p className="whitespace-pre-wrap">{selectedSession.finalAnswer}</p>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-medium mb-2">Scratch Work</h4>
                      <div className="bg-white p-3 rounded border overflow-auto max-h-64">
                        <pre className="text-sm whitespace-pre-wrap font-mono">{selectedSession.scratchboardContent}</pre>
                      </div>
                    </div>
                  </div>

                  <h4 className="font-medium mt-6 mb-2">Conversation</h4>
                  <div className="bg-white rounded border overflow-auto max-h-96">
                    {selectedSession.messages.map((msg, idx) => (
                      <div key={idx} className={`p-3 ${idx % 2 === 0 ? 'bg-gray-50' : 'bg-white'} border-b`}>
                        <div className="flex justify-between mb-1">
                          <span className={`font-medium ${msg.sender === 'user' ? 'text-blue-700' : 'text-green-700'}`}>
                            {msg.sender === 'user' ? 'Student' : msg.agentId || 'AI Agent'}
                          </span>
                          <span className="text-xs text-gray-500">{formatDate(msg.timestamp)}</span>
                        </div>
                        <p className="whitespace-pre-wrap">{msg.text}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'tests' ? (
          <div>
            <h2 className="text-2xl font-bold mb-6">Test Results</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white p-4 rounded-lg shadow">
                <h3 className="text-lg font-medium mb-2">Pre-Test Performance</h3>
                <p className="text-3xl font-bold">{calculateAvgScore(testResults, 'pre').toFixed(1)}%</p>
                <p className="text-sm text-gray-600 mt-1">From {countTestType(testResults, 'pre')} tests</p>

                <h4 className="font-medium mt-4 mb-1">Most Challenging Questions:</h4>
                <ul className="text-sm">
                  {getMostChallenging(testResults, 'pre', 3).map((item, idx) => (
                    <li key={idx} className="py-1">
                      <div className="flex justify-between">
                        <span className="text-red-600">Q{item.questionId}</span>
                        <span>{item.incorrectCount} incorrect ({Math.round(item.incorrectPercent)}%)</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white p-4 rounded-lg shadow">
                <h3 className="text-lg font-medium mb-2">Post-Test Performance</h3>
                <p className="text-3xl font-bold">{calculateAvgScore(testResults, 'post').toFixed(1)}%</p>
                <p className="text-sm text-gray-600 mt-1">From {countTestType(testResults, 'post')} tests</p>

                <h4 className="font-medium mt-4 mb-1">Most Challenging Questions:</h4>
                <ul className="text-sm">
                  {getMostChallenging(testResults, 'post', 3).map((item, idx) => (
                    <li key={idx} className="py-1">
                      <div className="flex justify-between">
                        <span className="text-red-600">Q{item.questionId}</span>
                        <span>{item.incorrectCount} incorrect ({Math.round(item.incorrectPercent)}%)</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-white p-4 rounded-lg shadow">
                <h3 className="text-lg font-medium mb-2">Final Test Performance</h3>
                <p className="text-3xl font-bold">{calculateAvgScore(testResults, 'final').toFixed(1)}%</p>
                <p className="text-sm text-gray-600 mt-1">From {countTestType(testResults, 'final')} tests</p>

                <h4 className="font-medium mt-4 mb-1">Most Challenging Questions:</h4>
                <ul className="text-sm">
                  {getMostChallenging(testResults, 'final', 3).map((item, idx) => (
                    <li key={idx} className="py-1">
                      <div className="flex justify-between">
                        <span className="text-red-600">Q{item.questionId}</span>
                        <span>{item.incorrectCount} incorrect ({Math.round(item.incorrectPercent)}%)</span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="bg-white shadow overflow-hidden rounded-md">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">User</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Test Type</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Score</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Questions</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {testResults.map((test) => (
                    <tr key={test._id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {test.userId.substring(0, 8)}...
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {test.testType.toUpperCase()} Test
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm">
                        <span className={`px-2 py-1 rounded-full ${test.score >= 70 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {test.score.toFixed(1)}%
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {test.questions.filter(q => q.isCorrect).length} / {test.questions.length} correct
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(test.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        <button 
                          className="text-blue-600 hover:text-blue-800"
                          onClick={() => setSelectedTest(selectedTest && selectedTest._id === test._id ? null : test)}
                        >
                          {selectedTest && selectedTest._id === test._id ? 'Hide' : 'View'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Selected Test Details */}
              {selectedTest && (
                <div className="border-t p-6 bg-gray-50">
                  <h3 className="text-lg font-medium mb-4">Test Details - {selectedTest.score.toFixed(1)}%</h3>

                  <div className="space-y-4">
                    {selectedTest.questions.map((q, idx) => (
                      <div key={idx} className={`p-4 rounded-md ${q.isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                        <div className="flex justify-between">
                          <h5 className="font-medium">Question #{q.questionId}</h5>
                          <span className={`px-2 py-1 text-xs rounded-full ${q.isCorrect ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {q.isCorrect ? 'Correct' : 'Incorrect'}
                          </span>
                        </div>
                        <p className="mt-2">{q.question}</p>

                        <div className="mt-3 grid grid-cols-2 gap-4">
                          <div>
                            <h6 className="text-sm font-medium text-gray-600 mb-1">User's Answer</h6>
                            <div className={`p-2 rounded ${q.isCorrect ? 'bg-green-100' : 'bg-red-100'}`}>
                              <p>{q.userAnswer || '(no answer)'}</p>
                            </div>
                          </div>
                          <div>
                            <h6 className="text-sm font-medium text-gray-600 mb-1">Correct Answer</h6>
                            <div className="p-2 rounded bg-green-100">
                              <p>{q.correctAnswer}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// Helper functions for data analysis
function calculateProgressStats(users) {
  const stages = ['terms', 'pre-test', 'lesson', 'tetris-break', 'post-test', 'final-test', 'completed'];
  return stages.map(stage => ({
    stage,
    count: users.filter(user => user.flowStage === stage).length
  })).filter(stat => stat.count > 0);
}

function calculateCorrectSessions(sessions) {
  return sessions.filter(session => session.isCorrect).length;
}

function calculateIncorrectSessions(sessions) {
  return sessions.filter(session => !session.isCorrect && !session.timeoutOccurred).length;
}

function calculateTimeoutSessions(sessions) {
  return sessions.filter(session => session.timeoutOccurred).length;
}

function calculateAverageDuration(sessions) {
  if (sessions.length === 0) return 0;
  const totalDuration = sessions.reduce((sum, session) => sum + session.duration, 0);
  return totalDuration / sessions.length;
}

function calculateAvgScore(testResults, testType) {
  const filtered = testResults.filter(test => test.testType === testType);
  if (filtered.length === 0) return 0;
  const totalScore = filtered.reduce((sum, test) => sum + test.score, 0);
  return totalScore / filtered.length;
}

function countTestType(testResults, testType) {
  return testResults.filter(test => test.testType === testType).length;
}

function getMostChallenging(testResults, testType, limit = 3) {
  const filtered = testResults.filter(test => test.testType === testType);
  if (filtered.length === 0) return [];

  // Collect all question attempts
  const questionStats = {};

  filtered.forEach(test => {
    test.questions.forEach(q => {
      if (!questionStats[q.questionId]) {
        questionStats[q.questionId] = {
          questionId: q.questionId,
          totalAttempts: 0,
          incorrectCount: 0
        };
      }

      questionStats[q.questionId].totalAttempts++;
      if (!q.isCorrect) {
        questionStats[q.questionId].incorrectCount++;
      }
    });
  });

  // Calculate percentage and sort
  const statsArray = Object.values(questionStats).map(stat => ({
    ...stat,
    incorrectPercent: (stat.incorrectCount / stat.totalAttempts) * 100
  }));

  // Sort by incorrect percentage
  return statsArray
    .sort((a, b) => b.incorrectPercent - a.incorrectPercent)
    .slice(0, limit);
}