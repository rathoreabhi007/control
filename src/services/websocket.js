import ApiService from './api';

/**
 * Get WebSocket URL based on environment
 * Uses REACT_APP_WS_URL if set, otherwise defaults based on NODE_ENV
 */
const getWebSocketUrl = () => {
    // Check for explicit WebSocket URL in environment variables
    if (process.env.REACT_APP_WS_URL) {
        return process.env.REACT_APP_WS_URL;
    }

    // Check for API base URL to derive WebSocket URL
    const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://127.0.0.1:8000';

    // Determine protocol and host
    const isProduction = process.env.NODE_ENV === 'production';
    const protocol = isProduction ? 'wss://' : 'ws://';

    // Extract host from API URL (remove http:// or https://)
    const host = apiBaseUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');

    return `${protocol}${host}/ws/status`;
};

/**
 * WebSocketService with comprehensive failsafe mechanisms:
 * - Automatic reconnection with exponential backoff
 * - Circuit breaker pattern
 * - Heartbeat monitoring
 * - Fallback to REST polling
 * - Connection health monitoring
 */
class WebSocketService {
    constructor() {
        // Connection state
        this.ws = null;
        this.isConnecting = false;
        this.isConnected = false;
        this.shouldReconnect = true;

        // Reconnection settings
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10; // Increased for reliability
        this.baseReconnectDelay = 1000; // 1 second
        this.maxReconnectDelay = 30000; // 30 seconds max
        this.reconnectTimer = null;

        // Heartbeat settings
        this.heartbeatInterval = 30000; // 30 seconds (matches backend)
        this.heartbeatTimer = null;
        this.lastPongTime = null;
        this.heartbeatTimeout = 60000; // 60 seconds timeout

        // Circuit breaker
        this.circuitBreakerState = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
        this.circuitBreakerFailures = 0;
        this.circuitBreakerThreshold = 5; // Open after 5 failures
        this.circuitBreakerResetTime = 60000; // 1 minute before retry

        // Subscriptions
        this.subscriptions = new Map(); // task_id -> callback
        this.onRunsUpdateCallback = null;
        this.pendingSubscriptions = new Set(); // Tasks to resubscribe on reconnect

        // Fallback to REST
        this.useFallback = false;
        this.fallbackPollingInterval = null;
        this.fallbackInterval = 30000; // 30 seconds REST polling as fallback

        // Event listeners
        this.connectionListeners = new Set();
        this.disconnectionListeners = new Set();

        // Stats
        this.stats = {
            connectionAttempts: 0,
            successfulConnections: 0,
            failedConnections: 0,
            reconnections: 0,
            messagesReceived: 0,
            messagesSent: 0
        };
    }

    /**
     * Connect to WebSocket with failsafe mechanisms
     */
    connect() {
        // Check if already connected or connecting
        if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            // console.log('WebSocket already connected, reusing existing connection');
            return; // Already connected
        }

        if (this.isConnecting || (this.ws && this.ws.readyState === WebSocket.CONNECTING)) {
            // console.log('WebSocket connection in progress, waiting...');
            return; // Already connecting
        }

        if (this.circuitBreakerState === 'OPEN') {
            const now = Date.now();
            if (now - this.circuitBreakerResetTime < 60000) {
                console.warn('Circuit breaker OPEN, using REST fallback');
                this.enableFallback();
                return;
            } else {
                // Try half-open
                this.circuitBreakerState = 'HALF_OPEN';
                this.circuitBreakerFailures = 0;
            }
        }

        this.isConnecting = true;
        this.stats.connectionAttempts++;

        // Get WebSocket URL based on environment
        const wsUrl = getWebSocketUrl();
        // console.log(`Connecting to WebSocket: ${wsUrl}`);

        try {
            this.ws = new WebSocket(wsUrl);
            this.setupEventHandlers();
        } catch (error) {
            console.error('WebSocket connection error:', error);
            this.handleConnectionFailure();
        }
    }

    /**
     * Setup WebSocket event handlers
     */
    setupEventHandlers() {
        this.ws.onopen = () => {
            // console.log('WebSocket connected');
            this.isConnected = true;
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            this.stats.successfulConnections++;
            this.circuitBreakerState = 'CLOSED';
            this.circuitBreakerFailures = 0;
            this.useFallback = false;
            this.lastPongTime = Date.now();

            // Start heartbeat
            this.startHeartbeat();

            // Resubscribe to all tasks
            this.pendingSubscriptions.forEach(taskId => {
                const callback = this.subscriptions.get(taskId);
                if (callback) {
                    this.subscribe(taskId, callback);
                }
            });
            this.pendingSubscriptions.clear();

            // Notify listeners
            this.connectionListeners.forEach(listener => listener());
        };

        this.ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.stats.messagesReceived++;
                this.lastPongTime = Date.now();

                // console.log('WebSocket message received:', message.type, message);

                if (message.type === 'pong' || message.type === 'ping') {
                    // Handle heartbeat
                    if (message.type === 'ping') {
                        this.sendPong();
                    }
                    return;
                }

                if (message.type === 'task_status') {
                    // console.log(`Task status update received for ${message.task_id}:`, message.data);
                    const callback = this.subscriptions.get(message.task_id);
                    if (callback) {
                        // console.log(`Calling callback for task ${message.task_id}`);
                        callback(message.data);
                    } else {
                        console.warn(`⚠️ No callback registered for task ${message.task_id}. 
                            Active subscriptions:`, Array.from(this.subscriptions.keys()));
                    }
                } else if (message.type === 'runs_update') {
                    if (this.onRunsUpdateCallback) {
                        this.onRunsUpdateCallback(message.data);
                    }
                } else if (message.type === 'connected') {
                    // console.log('WebSocket handshake complete');
                } else if (message.type === 'subscribed') {
                    // console.log(`Subscribed to task: ${message.task_id}`);
                }
            } catch (error) {
                console.error('Error parsing WebSocket message:', error, event.data);
            }
        };

        this.ws.onerror = (error) => {
            console.error('WebSocket error:', error);
            this.handleConnectionFailure();
        };

        this.ws.onclose = (event) => {
            // console.log(`WebSocket disconnected (code: ${event.code}, reason: ${event.reason})`);
            this.isConnected = false;
            this.isConnecting = false;
            this.stopHeartbeat();

            // Notify listeners
            this.disconnectionListeners.forEach(listener => listener());

            // Attempt reconnection if should reconnect
            if (this.shouldReconnect) {
                this.scheduleReconnect();
            }
        };
    }

    /**
     * Handle connection failure with circuit breaker
     */
    handleConnectionFailure() {
        this.isConnecting = false;
        this.stats.failedConnections++;
        this.circuitBreakerFailures++;

        if (this.circuitBreakerFailures >= this.circuitBreakerThreshold) {
            this.circuitBreakerState = 'OPEN';
            this.circuitBreakerResetTime = Date.now();
            console.warn('Circuit breaker OPEN - too many failures');
            this.enableFallback();
        } else {
            this.scheduleReconnect();
        }
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    scheduleReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
        }

        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached, enabling REST fallback');
            this.enableFallback();
            return;
        }

        this.reconnectAttempts++;
        this.stats.reconnections++;

        // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (max)
        const delay = Math.min(
            this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
            this.maxReconnectDelay
        );

        // console.log(`Reconnecting in ${delay}ms... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    /**
     * Start heartbeat monitoring
     */
    startHeartbeat() {
        this.stopHeartbeat();

        // Send ping every heartbeat interval
        this.heartbeatTimer = setInterval(() => {
            if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.sendPing();

                // Check if we haven't received pong in timeout period
                if (this.lastPongTime && (Date.now() - this.lastPongTime) > this.heartbeatTimeout) {
                    console.warn('Heartbeat timeout, reconnecting...');
                    this.ws.close();
                }
            }
        }, this.heartbeatInterval);
    }

    /**
     * Stop heartbeat monitoring
     */
    stopHeartbeat() {
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
    }

    /**
     * Send ping to server
     */
    sendPing() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify({
                    action: 'ping',
                    timestamp: new Date().toISOString()
                }));
                this.stats.messagesSent++;
            } catch (error) {
                console.error('Error sending ping:', error);
            }
        }
    }

    /**
     * Send pong response
     */
    sendPong() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify({
                    action: 'pong',
                    timestamp: new Date().toISOString()
                }));
                this.stats.messagesSent++;
            } catch (error) {
                console.error('Error sending pong:', error);
            }
        }
    }

    /**
     * Subscribe to task updates
     */
    subscribe(taskId, callback) {
        if (!taskId || !callback) {
            console.warn('Invalid subscription parameters');
            return;
        }

        // console.log(`Subscribing to task: ${taskId}`);
        this.subscriptions.set(taskId, callback);

        if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                const subscribeMessage = {
                    action: 'subscribe',
                    task_id: taskId
                };
                // console.log('Sending subscribe message:', subscribeMessage);
                this.ws.send(JSON.stringify(subscribeMessage));
                this.stats.messagesSent++;
            } catch (error) {
                console.error('Error subscribing:', error);
                this.pendingSubscriptions.add(taskId);
            }
        } else {
            // console.log(`WebSocket not connected, queueing subscription for ${taskId}`);
            // Queue for when connection is established
            this.pendingSubscriptions.add(taskId);
            // Try to connect if not already connecting
            if (!this.isConnecting) {
                this.connect();
            }
        }
    }

    /**
     * Unsubscribe from task updates
     */
    unsubscribe(taskId) {
        this.subscriptions.delete(taskId);
        this.pendingSubscriptions.delete(taskId);

        if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
            try {
                this.ws.send(JSON.stringify({
                    action: 'unsubscribe',
                    task_id: taskId
                }));
                this.stats.messagesSent++;
            } catch (error) {
                console.error('Error unsubscribing:', error);
            }
        }
    }

    /**
     * Set callback for runs updates
     */
    onRunsUpdate(callback) {
        this.onRunsUpdateCallback = callback;
    }

    /**
     * Enable REST fallback polling
     */
    enableFallback() {
        if (this.useFallback) {
            return; // Already enabled
        }

        console.warn('Enabling REST fallback polling');
        this.useFallback = true;

        // Start REST polling as fallback
        if (this.onRunsUpdateCallback) {
            this.fallbackPollingInterval = setInterval(async () => {
                try {
                    const response = await ApiService.getControlRunHistory(null, null, 50);
                    const runs = response.history || response.runs || [];
                    this.onRunsUpdateCallback(runs);
                } catch (error) {
                    console.error('REST fallback polling error:', error);
                }
            }, this.fallbackInterval);
        }
    }

    /**
     * Disable REST fallback
     */
    disableFallback() {
        if (this.fallbackPollingInterval) {
            clearInterval(this.fallbackPollingInterval);
            this.fallbackPollingInterval = null;
        }
        this.useFallback = false;
    }

    /**
     * Disconnect WebSocket
     */
    disconnect() {
        this.shouldReconnect = false;
        this.stopHeartbeat();
        this.disableFallback();

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        this.isConnected = false;
        this.isConnecting = false;
    }

    /**
     * Get connection status
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            isConnecting: this.isConnecting,
            useFallback: this.useFallback,
            circuitBreakerState: this.circuitBreakerState,
            reconnectAttempts: this.reconnectAttempts,
            stats: { ...this.stats }
        };
    }

    /**
     * Add connection listener
     */
    onConnect(listener) {
        this.connectionListeners.add(listener);
        return () => this.connectionListeners.delete(listener);
    }

    /**
     * Add disconnection listener
     */
    onDisconnect(listener) {
        this.disconnectionListeners.add(listener);
        return () => this.disconnectionListeners.delete(listener);
    }
}

// Export singleton instance
const webSocketService = new WebSocketService();
export default webSocketService;

