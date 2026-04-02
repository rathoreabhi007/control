import React, { useState } from 'react';
import { useSafeContainerControl } from '../hooks/useSafeContainerControl';
import { useURLContainerControl } from '../hooks/useURLContainerControl';
import { usePostMessageContainerControl } from '../hooks/usePostMessageContainerControl';

/**
 * Demo component showing different safe container control methods
 * This demonstrates how to control React app container without nginx 502 errors
 */
const ContainerControlDemo = () => {
    const [activeMethod, setActiveMethod] = useState('safe');

    // Method 1: Safe Container Control
    const safeControl = useSafeContainerControl({
        minHeight: 300,
        maxHeight: 800,
        defaultHeight: 600,
        reservedSpace: 100
    });

    // Method 2: URL Parameter Control
    const urlControl = useURLContainerControl();

    // Method 3: PostMessage Control
    const postMessageControl = usePostMessageContainerControl();

    const currentControl = activeMethod === 'safe' ? safeControl : 
                          activeMethod === 'url' ? urlControl : 
                          postMessageControl;

    return (
        <div className="container-control-demo">
            <div className="demo-controls">
                <h3>Safe Container Control Methods</h3>
                <div className="method-selector">
                    <button 
                        className={activeMethod === 'safe' ? 'active' : ''}
                        onClick={() => setActiveMethod('safe')}
                    >
                        Safe Control
                    </button>
                    <button 
                        className={activeMethod === 'url' ? 'active' : ''}
                        onClick={() => setActiveMethod('url')}
                    >
                        URL Control
                    </button>
                    <button 
                        className={activeMethod === 'postmessage' ? 'active' : ''}
                        onClick={() => setActiveMethod('postmessage')}
                    >
                        PostMessage Control
                    </button>
                </div>
            </div>

            <div className="demo-info">
                <h4>Current Method: {activeMethod}</h4>
                <div className="control-info">
                    <p><strong>Height:</strong> {currentControl.height}px</p>
                    <p><strong>Width:</strong> {currentControl.width}</p>
                    {currentControl.isEmbedded && <p><strong>Embedded:</strong> Yes</p>}
                    {currentControl.isInitialized && <p><strong>Initialized:</strong> Yes</p>}
                </div>
            </div>

            <div className="demo-usage">
                <h4>Usage Examples:</h4>
                <div className="code-examples">
                    <h5>1. Safe Container Control:</h5>
                    <pre>{`
// In your component:
import { useSafeContainerControl } from '../hooks/useSafeContainerControl';

const { containerHeight, isInitialized } = useSafeContainerControl({
    minHeight: 300,
    maxHeight: 800,
    defaultHeight: 600,
    reservedSpace: 100
});

// Use in JSX:
<div style={{ height: \`\${containerHeight}px\` }}>
    {/* Your content */}
</div>
                    `}</pre>

                    <h5>2. URL Parameter Control:</h5>
                    <pre>{`
// URL: /your-page?height=700&width=100%&minHeight=300&maxHeight=800

import { useURLContainerControl } from '../hooks/useURLContainerControl';

const { height, width, updateContainerConfig } = useURLContainerControl();

// Update from external source:
updateContainerConfig({ height: 700 });
                    `}</pre>

                    <h5>3. PostMessage Control (for iframes):</h5>
                    <pre>{`
// From parent window:
window.frames[0].postMessage({
    type: 'CONTAINER_RESIZE',
    data: { height: 700, width: '100%' }
}, '*');

// In React app:
import { usePostMessageContainerControl } from '../hooks/usePostMessageContainerControl';

const { height, width, requestResize } = usePostMessageContainerControl();
                    `}</pre>
                </div>
            </div>
        </div>
    );
};

export default ContainerControlDemo;
