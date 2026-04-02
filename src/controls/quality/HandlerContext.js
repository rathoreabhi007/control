import { createContext } from 'react';

// Removed TypeScript types for JavaScript
export const HandlerContext = createContext({
    runNode: async () => { },
    resetNodeAndDownstream: async () => { },
});

