import { useState, useEffect } from 'react';
import { useLocation, Link } from 'react-router-dom';
import { useUser } from '../contexts/UserContext';
import { FaUserCircle, FaHome } from 'react-icons/fa';

const UserProfile = () => {
    const { currentUser, loading } = useUser();
    const [isExpanded, setIsExpanded] = useState(true);
    const location = useLocation();
    const isHomePage = location.pathname === '/';

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
                <Link
                    to="/"
                    className="flex items-center justify-center w-8 h-8 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                    title="Go to Home"
                >
                    <FaHome className="text-white text-lg" />
                </Link>
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
