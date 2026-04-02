import { createContext, useContext, useState, useEffect } from 'react';

const UserContext = createContext();

export const UserProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [permissions, setPermissions] = useState([]);
    const [loading, setLoading] = useState(true);

    // Fetch current user from backend on mount
    useEffect(() => {
        const setDevFallbackUser = () => {
            setCurrentUser({
                id: 'local_dev_admin',
                name: 'Local Dev Admin',
                email: 'local.dev@example.com',
                roles: ['admin']
            });
            setPermissions(['*']);
        };

        const fetchCurrentUser = async () => {
            try {
                // In production, the Authorization header would be automatically included
                // by your authentication system (e.g., interceptor, auth library)
                // For demo, you can manually set it:
                // const headers = { 'Authorization': 'Bearer analyst' };

                const response = await fetch('http://localhost:8000/api/users/me', {
                    // headers: headers, // Uncomment and set to test different users
                });

                if (response.ok) {
                    const userData = await response.json();
                    setCurrentUser(userData);
                    setPermissions(userData.permissions || []);
                } else {
                    console.error("Failed to fetch current user:", response.status);
                    setDevFallbackUser();
                }
            } catch (error) {
                console.error("Failed to fetch current user:", error);
                setDevFallbackUser();
            } finally {
                setLoading(false);
            }
        };

        fetchCurrentUser();
    }, []);

    const hasAccess = (pageId) => {
        if (!currentUser) return false;
        if (permissions.includes('*')) return true;
        return permissions.includes(pageId);
    };

    return (
        <UserContext.Provider value={{ currentUser, hasAccess, loading, permissions }}>
            {children}
        </UserContext.Provider>
    );
};

export const useUser = () => {
    const context = useContext(UserContext);
    if (!context) {
        throw new Error('useUser must be used within a UserProvider');
    }
    return context;
};
