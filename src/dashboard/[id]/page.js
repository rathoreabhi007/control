// Converted from Next.js to Create React App

import { useEffect, useState } from 'react';

export default function DashboardInstance({ params }: { params: { id: string } }) {
    const [instanceId, setInstanceId] = useState < string > ('');
    const [timestamp, setTimestamp] = useState < string > ('');

    useEffect(() => {
        setInstanceId(params.id);
        setTimestamp(new Date().toISOString());
    }, [params.id]);

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-slate-700 p-6">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-2xl font-bold text-white">
                            Dashboard Instance: {instanceId}
                        </h1>
                        <span className="text-emerald-400 text-sm">
                            Created: {timestamp ? new Date(timestamp).toLocaleString() : ''}
                        </span>
                    </div>

                    <div className="grid gap-6">
                        {/* Add your dashboard content here */}
                        <div className="bg-slate-700/50 rounded-lg p-4">
                            <h2 className="text-emerald-400 font-semibold mb-2">Instance Details</h2>
                            <p className="text-gray-300">This is an independent instance of the dashboard.</p>
                            <p className="text-gray-300">Each instance maintains its own state and can be used separately.</p>
                        </div>

                        {/* Example content - you can replace this with your actual dashboard components */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="bg-slate-700/50 rounded-lg p-4">
                                <h3 className="text-emerald-400 font-semibold mb-2">Status</h3>
                                <p className="text-gray-300">Active</p>
                            </div>
                            <div className="bg-slate-700/50 rounded-lg p-4">
                                <h3 className="text-emerald-400 font-semibold mb-2">Data Points</h3>
                                <p className="text-gray-300">Loading...</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
} 