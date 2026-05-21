import { useState, useEffect, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { getInstanceDisplayLabel } from '../utils/instance-id';
import { FaUserCircle, FaHome } from 'react-icons/fa';

const UserProfile = () => {
    const { currentUser, loading } = useUser();
    const [isExpanded, setIsExpanded] = useState(true);
    const location = useLocation();
    const navigate = useNavigate();
    const isHomePage = location.pathname === '/';
    const [isHomeMenuOpen, setIsHomeMenuOpen] = useState(false);
    const homeButtonRef = useRef(null);

    const userKey = (currentUser?.username || currentUser?.email || currentUser?.name || 'anonymous').toString();

    const instanceContext = useMemo(() => {
        const p = location.pathname || '';
        const completenessMatch = p.match(/^\/instances\/completeness\/([^/]+)$/);
        if (completenessMatch) return { type: 'completeness', instanceId: completenessMatch[1] };
        const qualityMatch = p.match(/^\/instances\/quality\/([^/]+)$/);
        if (qualityMatch) return { type: 'quality', instanceId: qualityMatch[1] };
        return { type: null, instanceId: null };
    }, [location.pathname]);

    const recentInstances = useMemo(() => {
        if (!instanceContext.type) return [];
        try {
            const key = `recent_instances:${instanceContext.type}:${userKey}`;
            const raw = localStorage.getItem(key);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
        } catch {
            return [];
        }
    }, [instanceContext.type, userKey]);

    useEffect(() => {
        if (currentUser) {
            setIsExpanded(true);
            const timer = setTimeout(() => {
                setIsExpanded(false);
            }, 3000);
            return () => clearTimeout(timer);
        }
    }, [currentUser]);

    if (loading) return null;

    if (!currentUser) {
        return (
            <div className="fixed top-4 right-0 z-50 flex items-center bg-white/80 backdrop-blur-md dark:bg-gray-800/80 p-2 rounded-l-lg shadow-lg border border-gray-200 dark:border-gray-700">
                <span className="text-sm text-gray-500 dark:text-gray-400">Not logged in</span>
            </div>
        );
    }

    return (
        <div
            className={`fixed top-4 right-0 z-50 flex items-center bg-white/80 backdrop-blur-md dark:bg-gray-800/80 p-3 rounded-l-lg shadow-lg border border-gray-200 dark:border-gray-700 gap-2 cursor-pointer transition-all duration-300 ease-in-out ${isExpanded ? 'translate-x-0' : 'translate-x-[calc(100%-44px)]'}`}
            onMouseEnter={() => setIsExpanded(true)}
            onMouseLeave={() => setIsExpanded(false)}
        >
            {!isHomePage && (
                <div className="relative">
                    <button
                        ref={homeButtonRef}
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsHomeMenuOpen((v) => !v);
                        }}
                        className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                        title="Home / Recent instances"
                    >
                        <FaHome className="text-white text-lg" />
                    </button>

                    {isHomeMenuOpen && (
                        <>
                            <div
                                className="fixed inset-0 z-40"
                                onClick={() => setIsHomeMenuOpen(false)}
                            />
                            <div
                                className="absolute right-0 mt-2 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden"
                            >
                                <button
                                    type="button"
                                    onClick={() => {
                                        setIsHomeMenuOpen(false);
                                        navigate('/');
                                    }}
                                    className="w-full text-left px-4 py-3 text-sm font-semibold text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-700"
                                >
                                    Go to Home
                                </button>

                                {instanceContext.type && (
                                    <>
                                        <div className="px-4 py-2 text-xs font-bold text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/30 border-t border-gray-200 dark:border-gray-700">
                                            Recent instances ({instanceContext.type})
                                        </div>
                                        <div className="max-h-64 overflow-auto">
                                            {recentInstances.length === 0 ? (
                                                <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                                                    No recent instances yet.
                                                </div>
                                            ) : (
                                                recentInstances.map((item) => (
                                                    <button
                                                        key={item.instanceId}
                                                        type="button"
                                                        onClick={() => {
                                                            setIsHomeMenuOpen(false);
                                                            navigate(`/instances/${instanceContext.type}/${item.instanceId}`);
                                                        }}
                                                        className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 border-t border-gray-100 dark:border-gray-700"
                                                        title={item.instanceId}
                                                    >
                                                        <div className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">
                                                            {getInstanceDisplayLabel(item)}
                                                        </div>
                                                        {item.lastVisitedAt && (
                                                            <div className="text-xs text-gray-500 dark:text-gray-400">
                                                                {new Date(item.lastVisitedAt).toLocaleString()}
                                                            </div>
                                                        )}
                                                    </button>
                                                ))
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
            <FaUserCircle className="text-gray-600 dark:text-gray-300 text-2xl flex-shrink-0" />
            <div className={`flex flex-col overflow-hidden transition-all duration-300 ${isExpanded ? 'opacity-100 max-w-[200px]' : 'opacity-0 max-w-0'}`}>
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-100 whitespace-nowrap">
                    {currentUser.name}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    {currentUser.roles?.join(', ')}
                </span>
            </div>
        </div>
    );
};

export default UserProfile;
