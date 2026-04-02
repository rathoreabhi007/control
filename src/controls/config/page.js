// Converted from Next.js to Create React App

import { useState } from 'react';
import { FaChartLine, FaCheckCircle, FaExclamationTriangle, FaCog, FaPlay, FaStop, FaUndo } from 'react-icons/fa';
import HSBCLogo from '../../components/HSBCLogo';

export default function GenReconAnalysis({ instanceId }) {
    const [selectedAnalysis, setSelectedAnalysis] = useState('daily');
    const [isRunning, setIsRunning] = useState(false);
    const [analysisStatus, setAnalysisStatus] = useState('idle');
    const [progress, setProgress] = useState(0);

    const analysisTypes = [
        { id: 'daily', name: 'Daily Reconciliation', description: 'Daily data reconciliation and validation' },
        { id: 'weekly', name: 'Weekly Summary', description: 'Weekly aggregated reconciliation report' },
        { id: 'monthly', name: 'Monthly Analysis', description: 'Monthly comprehensive reconciliation analysis' },
        { id: 'custom', name: 'Custom Analysis', description: 'Custom reconciliation parameters and rules' }
    ];

    const handleStartAnalysis = () => {
        setIsRunning(true);
        setAnalysisStatus('running');
        setProgress(0);
        
        // Simulate progress
        const interval = setInterval(() => {
            setProgress(prev => {
                if (prev >= 100) {
                    clearInterval(interval);
                    setIsRunning(false);
                    setAnalysisStatus('completed');
                    return 100;
                }
                return prev + 10;
            });
        }, 500);
    };

    const handleStopAnalysis = () => {
        setIsRunning(false);
        setAnalysisStatus('stopped');
    };

    const handleResetAnalysis = () => {
        setIsRunning(false);
        setAnalysisStatus('idle');
        setProgress(0);
    };

    return (
        <div className="min-h-screen" style={{ backgroundColor: '#F5F5F5', color: 'black' }}>
            {/* Header */}
            <div className="border-b border-slate-200 px-8 py-4"
                style={{
                    backgroundColor: 'white',
                    height: '80px',
                    boxShadow: `
                        0 4px 8px rgba(0,0,0,0.15),
                        0 8px 16px rgba(0,0,0,0.1),
                        0 2px 4px rgba(0,0,0,0.1),
                        inset 0 2px 0 rgba(255,255,255,0.8),
                        inset 0 -2px 0 rgba(0,0,0,0.1)
                    `
                }}>
                <div className="flex items-center justify-between h-full">
                    <div className="flex items-center flex-shrink-0">
                        <HSBCLogo height={64} className="mr-4" />
                    </div>
                    <div className="flex-1 flex justify-center">
                        <h1 className="text-2xl font-bold text-black text-center">
                            GENRECON ANALYSIS
                        </h1>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                        <div className="px-3 py-1 rounded-lg text-sm font-medium bg-gray-100 text-gray-700">
                            {new Date().toLocaleDateString()}
                        </div>
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-8">
                {/* Main Control Panel */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                    {/* Analysis Selection */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                        <h2 className="text-lg font-semibold text-black mb-4 flex items-center">
                            <FaCog className="mr-2 text-red-500" />
                            Analysis Type
                        </h2>
                        <select
                            value={selectedAnalysis}
                            onChange={(e) => setSelectedAnalysis(e.target.value)}
                            className="w-full bg-gray-50 text-black rounded-md p-3 border border-gray-300 focus:border-red-500 focus:ring-1 focus:ring-red-500"
                            disabled={isRunning}
                        >
                            {analysisTypes.map(type => (
                                <option key={type.id} value={type.id}>
                                    {type.name}
                                </option>
                            ))}
                        </select>
                        <p className="mt-2 text-sm text-gray-600">
                            {analysisTypes.find(t => t.id === selectedAnalysis)?.description}
                        </p>
                    </div>

                    {/* Analysis Status */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                        <h2 className="text-lg font-semibold text-black mb-4 flex items-center">
                            <FaChartLine className="mr-2 text-red-500" />
                            Analysis Status
                        </h2>
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <span className="text-gray-700">Status</span>
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                                    analysisStatus === 'running' ? 'bg-yellow-100 text-yellow-800' :
                                    analysisStatus === 'completed' ? 'bg-green-100 text-green-800' :
                                    analysisStatus === 'stopped' ? 'bg-red-100 text-red-800' :
                                    'bg-gray-100 text-gray-800'
                                }`}>
                                    {analysisStatus.charAt(0).toUpperCase() + analysisStatus.slice(1)}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="text-gray-700">Progress</span>
                                <span className="text-black font-medium">{progress}%</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-2">
                                <div 
                                    className={`h-2 rounded-full transition-all duration-300 ${
                                        analysisStatus === 'running' ? 'bg-yellow-500' :
                                        analysisStatus === 'completed' ? 'bg-green-500' :
                                        analysisStatus === 'stopped' ? 'bg-red-500' :
                                        'bg-gray-400'
                                    }`}
                                    style={{ width: `${progress}%` }}
                                ></div>
                            </div>
                            {isRunning && (
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-700">Estimated Time</span>
                                    <span className="text-black">{(100 - progress) / 10 * 0.5} min remaining</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                        <h2 className="text-lg font-semibold text-black mb-4 flex items-center">
                            <FaCheckCircle className="mr-2 text-red-500" />
                            Actions
                        </h2>
                        <div className="space-y-3">
                            <button 
                                onClick={handleStartAnalysis}
                                disabled={isRunning}
                                className={`w-full py-3 px-4 rounded-md transition-colors font-medium ${
                                    isRunning 
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                        : 'bg-red-600 hover:bg-red-700 text-white'
                                }`}
                            >
                                <FaPlay className="inline mr-2" />
                                Start Analysis
                            </button>
                            <button 
                                onClick={handleStopAnalysis}
                                disabled={!isRunning}
                                className={`w-full py-3 px-4 rounded-md transition-colors font-medium ${
                                    !isRunning 
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                        : 'bg-red-600 hover:bg-red-700 text-white'
                                }`}
                            >
                                <FaStop className="inline mr-2" />
                                Stop Analysis
                            </button>
                            <button 
                                onClick={handleResetAnalysis}
                                disabled={isRunning}
                                className={`w-full py-3 px-4 rounded-md transition-colors font-medium ${
                                    isRunning 
                                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                                        : 'bg-gray-600 hover:bg-gray-700 text-white'
                                }`}
                            >
                                <FaUndo className="inline mr-2" />
                                Reset
                            </button>
                        </div>
                    </div>
                </div>

                {/* Analysis Results */}
                <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-black mb-4 flex items-center">
                        <FaExclamationTriangle className="mr-2 text-red-500" />
                        Analysis Results
                    </h2>
                    
                    {analysisStatus === 'idle' && (
                        <div className="text-center py-12">
                            <FaCog className="mx-auto text-gray-400 text-4xl mb-4" />
                            <p className="text-gray-600">Select an analysis type and click "Start Analysis" to begin</p>
                        </div>
                    )}

                    {analysisStatus === 'running' && (
                        <div className="text-center py-12">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-red-500 mx-auto mb-4"></div>
                            <p className="text-gray-600">Analysis in progress... {progress}% complete</p>
                        </div>
                    )}

                    {analysisStatus === 'completed' && (
                        <div className="space-y-4">
                            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                                <div className="flex items-center">
                                    <FaCheckCircle className="text-green-500 mr-2" />
                                    <span className="text-green-800 font-medium">Analysis completed successfully!</span>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <h3 className="font-medium text-black mb-2">Data Sources</h3>
                                    <p className="text-gray-600">3 sources processed</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <h3 className="font-medium text-black mb-2">Records Analyzed</h3>
                                    <p className="text-gray-600">15,432 records</p>
                                </div>
                                <div className="bg-gray-50 rounded-lg p-4">
                                    <h3 className="font-medium text-black mb-2">Issues Found</h3>
                                    <p className="text-gray-600">2 discrepancies</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {analysisStatus === 'stopped' && (
                        <div className="text-center py-12">
                            <FaStop className="mx-auto text-red-500 text-4xl mb-4" />
                            <p className="text-gray-600">Analysis was stopped by user</p>
                        </div>
                    )}
                </div>

                {/* Analysis History */}
                <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
                    <h2 className="text-lg font-semibold text-black mb-4">Analysis History</h2>
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead>
                                <tr className="border-b border-gray-200">
                                    <th className="text-left py-3 px-4 text-gray-700 font-medium">Analysis ID</th>
                                    <th className="text-left py-3 px-4 text-gray-700 font-medium">Type</th>
                                    <th className="text-left py-3 px-4 text-gray-700 font-medium">Start Time</th>
                                    <th className="text-left py-3 px-4 text-gray-700 font-medium">Duration</th>
                                    <th className="text-left py-3 px-4 text-gray-700 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="border-b border-gray-100">
                                    <td className="py-3 px-4 text-black">ANL001</td>
                                    <td className="py-3 px-4 text-black">Daily Reconciliation</td>
                                    <td className="py-3 px-4 text-black">2024-03-19 09:00</td>
                                    <td className="py-3 px-4 text-black">5m 30s</td>
                                    <td className="py-3 px-4">
                                        <span className="text-green-600 font-medium">Completed</span>
                                    </td>
                                </tr>
                                <tr className="border-b border-gray-100">
                                    <td className="py-3 px-4 text-black">ANL002</td>
                                    <td className="py-3 px-4 text-black">Weekly Summary</td>
                                    <td className="py-3 px-4 text-black">2024-03-18 23:00</td>
                                    <td className="py-3 px-4 text-black">12m 45s</td>
                                    <td className="py-3 px-4">
                                        <span className="text-red-600 font-medium">Failed</span>
                                    </td>
                                </tr>
                                <tr className="border-b border-gray-100">
                                    <td className="py-3 px-4 text-black">ANL003</td>
                                    <td className="py-3 px-4 text-black">Monthly Analysis</td>
                                    <td className="py-3 px-4 text-black">2024-03-17 14:30</td>
                                    <td className="py-3 px-4 text-black">45m 12s</td>
                                    <td className="py-3 px-4">
                                        <span className="text-green-600 font-medium">Completed</span>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
