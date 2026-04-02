"""
WebSocket Router for Real-time Status Updates
Provides WebSocket endpoint with comprehensive failsafe mechanisms
"""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, HTTPException
from typing import Set, Dict, Optional
import json
import asyncio
import logging
import time
from datetime import datetime, timedelta
from collections import defaultdict

logger = logging.getLogger(__name__)

class ConnectionManager:
    """
    Manages WebSocket connections with failsafe mechanisms:
    - Connection health monitoring
    - Heartbeat (ping/pong)
    - Automatic cleanup of dead connections
    - Rate limiting
    - Resource management for 30+ users
    """
    
    # Configuration
    MAX_CONNECTIONS = 50  # Safety limit (30 users + buffer)
    MAX_CONNECTIONS_PER_IP = 10  # Increased for development (was 3)
    HEARTBEAT_INTERVAL = 30  # seconds
    CONNECTION_TIMEOUT = 60  # seconds (no heartbeat = dead)
    MAX_MESSAGE_SIZE = 1024 * 1024  # 1MB max message size
    
    def __init__(self):
        self.active_connections: Dict[WebSocket, dict] = {}  # ws -> metadata
        self.task_subscriptions: Dict[str, Set[WebSocket]] = {}  # task_id -> connections
        self.connection_heartbeats: Dict[WebSocket, float] = {}  # ws -> last heartbeat
        self.connection_ips: Dict[WebSocket, str] = {}  # ws -> client IP
        self.connection_count_by_ip: Dict[str, int] = defaultdict(int)  # IP -> count
        self.lock = None  # Will be initialized when event loop is available
        self._heartbeat_task = None
        self._heartbeat_started = False
        
    def _ensure_heartbeat_started(self):
        """Start heartbeat monitor if not already started"""
        if not self._heartbeat_started:
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    self._heartbeat_task = asyncio.create_task(self._heartbeat_monitor())
                    self._heartbeat_started = True
                    logger.info("Heartbeat monitor started")
            except RuntimeError:
                # No event loop, will start when first connection is made
                pass
    
    async def connect(self, websocket: WebSocket, client_ip: str = "unknown"):
        """Connect a new WebSocket with validation"""
        # Initialize lock on first connection (when event loop is available)
        if self.lock is None:
            self.lock = asyncio.Lock()
        
        # Start heartbeat monitor on first connection
        if not self._heartbeat_started:
            self._heartbeat_task = asyncio.create_task(self._heartbeat_monitor())
            self._heartbeat_started = True
            logger.info("Heartbeat monitor started")
        
        async with self.lock:
            # Check connection limit
            if len(self.active_connections) >= self.MAX_CONNECTIONS:
                logger.warning(f"Connection limit reached ({self.MAX_CONNECTIONS})")
                await websocket.close(code=1008, reason="Server at capacity")
                raise HTTPException(status_code=503, detail="Server at capacity")
            
            # Rate limit: max connections per IP
            if self.connection_count_by_ip[client_ip] >= self.MAX_CONNECTIONS_PER_IP:
                logger.warning(f"IP {client_ip} exceeded connection limit ({self.MAX_CONNECTIONS_PER_IP})")
                await websocket.close(code=1008, reason="Too many connections from IP")
                raise HTTPException(status_code=429, detail="Too many connections")
            
            await websocket.accept()
            
            # Store connection metadata
            self.active_connections[websocket] = {
                "connected_at": time.time(),
                "last_heartbeat": time.time(),
                "ip": client_ip,
                "subscriptions": set()
            }
            self.connection_heartbeats[websocket] = time.time()
            self.connection_ips[websocket] = client_ip
            self.connection_count_by_ip[client_ip] += 1
            
            logger.info(f"WebSocket connected: {client_ip} (Total: {len(self.active_connections)})")
            
            # Send welcome message
            await websocket.send_json({
                "type": "connected",
                "timestamp": datetime.now().isoformat(),
                "heartbeat_interval": self.HEARTBEAT_INTERVAL
            })
        
    def disconnect(self, websocket: WebSocket):
        """Disconnect and cleanup (synchronous for thread safety)"""
        if websocket in self.active_connections:
            metadata = self.active_connections[websocket]
            client_ip = metadata.get("ip", "unknown")
            
            # Remove from all task subscriptions
            for task_id in list(self.task_subscriptions.keys()):
                if websocket in self.task_subscriptions[task_id]:
                    self.task_subscriptions[task_id].discard(websocket)
                    if len(self.task_subscriptions[task_id]) == 0:
                        del self.task_subscriptions[task_id]
            
            # Cleanup
            del self.active_connections[websocket]
            self.connection_heartbeats.pop(websocket, None)
            self.connection_count_by_ip[client_ip] = max(0, self.connection_count_by_ip[client_ip] - 1)
            self.connection_ips.pop(websocket, None)
            
            logger.info(f"WebSocket disconnected: {client_ip} (Total: {len(self.active_connections)})")
    
    async def update_heartbeat(self, websocket: WebSocket):
        """Update heartbeat timestamp"""
        if websocket in self.active_connections:
            self.connection_heartbeats[websocket] = time.time()
            self.active_connections[websocket]["last_heartbeat"] = time.time()
    
    async def _heartbeat_monitor(self):
        """Monitor connections and remove dead ones"""
        while True:
            try:
                await asyncio.sleep(10)  # Check every 10 seconds
                current_time = time.time()
                dead_connections = []
                
                async with self.lock:
                    for websocket, last_heartbeat in list(self.connection_heartbeats.items()):
                        if current_time - last_heartbeat > self.CONNECTION_TIMEOUT:
                            dead_connections.append(websocket)
                    
                    # Clean up dead connections
                    for ws in dead_connections:
                        logger.warning(f"Removing dead connection (no heartbeat)")
                        try:
                            await ws.close(code=1000, reason="No heartbeat")
                        except:
                            pass
                        # Disconnect is sync, safe to call from async
                        self.disconnect(ws)
                
                # Send ping to all connections
                await self._send_ping_to_all()
                
            except Exception as e:
                logger.error(f"Error in heartbeat monitor: {e}")
    
    async def _send_ping_to_all(self):
        """Send ping to all active connections"""
        disconnected = []
        for websocket in list(self.active_connections.keys()):
            try:
                await websocket.send_json({
                    "type": "ping",
                    "timestamp": datetime.now().isoformat()
                })
            except Exception as e:
                logger.debug(f"Failed to send ping: {e}")
                disconnected.append(websocket)
        
        # Clean up disconnected
        for ws in disconnected:
            self.disconnect(ws)
    
    async def handle_pong(self, websocket: WebSocket):
        """Handle pong response from client"""
        await self.update_heartbeat(websocket)
    
    async def subscribe_to_task(self, websocket: WebSocket, task_id: str):
        """Subscribe to task updates"""
        if websocket not in self.active_connections:
            logger.warning(f"Cannot subscribe: WebSocket not in active connections")
            return False
        
        if task_id not in self.task_subscriptions:
            self.task_subscriptions[task_id] = set()
        
        self.task_subscriptions[task_id].add(websocket)
        self.active_connections[websocket]["subscriptions"].add(task_id)
        
        logger.info(f"Subscribed to task {task_id} (Total subscribers: {len(self.task_subscriptions[task_id])})")
        logger.debug(f"All active subscriptions: {list(self.task_subscriptions.keys())}")
        return True
    
    async def unsubscribe_from_task(self, websocket: WebSocket, task_id: str):
        """Unsubscribe from task updates"""
        if task_id in self.task_subscriptions:
            self.task_subscriptions[task_id].discard(websocket)
            if len(self.task_subscriptions[task_id]) == 0:
                del self.task_subscriptions[task_id]
        
        if websocket in self.active_connections:
            self.active_connections[websocket]["subscriptions"].discard(task_id)
    
    async def broadcast_task_update(self, task_id: str, status_data: dict):
        """Broadcast status update to all subscribers with error handling"""
        if task_id not in self.task_subscriptions:
            logger.warning(f"No subscribers for task {task_id}, skipping broadcast")
            logger.warning(f"Available subscriptions: {list(self.task_subscriptions.keys())}")
            logger.warning(f"Active connections: {len(self.active_connections)}")
            return
        
        message = {
            "type": "task_status",
            "task_id": task_id,
            "data": status_data,
            "timestamp": datetime.now().isoformat()
        }
        
        subscriber_count = len(self.task_subscriptions[task_id])
        logger.info(f"Broadcasting task {task_id} update to {subscriber_count} subscriber(s): status={status_data.get('status')}")
        logger.debug(f"Message payload: {message}")
        
        disconnected = set()
        sent_count = 0
        for connection in list(self.task_subscriptions[task_id]):
            try:
                await connection.send_json(message)
                sent_count += 1
                logger.debug(f"Successfully sent message to WebSocket connection")
            except Exception as e:
                logger.warning(f"Failed to send to connection: {e}", exc_info=True)
                disconnected.add(connection)
        
        logger.info(f"Sent task {task_id} update to {sent_count}/{subscriber_count} subscriber(s)")
        
        # Clean up disconnected connections
        for conn in disconnected:
            self.disconnect(conn)
    
    async def broadcast_all_runs_update(self, runs_data: list):
        """Broadcast control-runs list update to all connections"""
        message = {
            "type": "runs_update",
            "data": runs_data,
            "timestamp": datetime.now().isoformat()
        }
        
        disconnected = set()
        for connection in list(self.active_connections.keys()):
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.debug(f"Failed to send runs update: {e}")
                disconnected.add(connection)
        
        # Clean up disconnected
        for conn in disconnected:
            self.disconnect(conn)
    
    def get_stats(self) -> dict:
        """Get connection statistics"""
        return {
            "active_connections": len(self.active_connections),
            "max_connections": self.MAX_CONNECTIONS,
            "task_subscriptions": len(self.task_subscriptions),
            "connections_by_ip": dict(self.connection_count_by_ip)
        }

# Global connection manager instance
manager = ConnectionManager()

router = APIRouter(prefix="/ws", tags=["websocket"])

@router.websocket("/status")
async def websocket_endpoint(websocket: WebSocket):
    """WebSocket endpoint with failsafe mechanisms"""
    client_ip = websocket.client.host if websocket.client else "unknown"
    
    # Ensure event loop is initialized when WebSocket connects
    # This is critical when the app is wrapped in another FastAPI app
    logger.info(f"WebSocket endpoint called - initializing event loop...")
    try:
        from task_manager_v2 import set_main_event_loop
        loop = asyncio.get_running_loop()
        logger.info(f"Got running loop: {loop}, is_running: {loop.is_running()}, is_closed: {loop.is_closed()}")
        set_main_event_loop(loop)
        logger.info("Event loop initialized via WebSocket connection (CRITICAL for wrapped apps)")
    except RuntimeError as e:
        logger.error(f"CRITICAL ERROR: Could not get running loop in WebSocket endpoint: {e}")
        logger.error(f"This will cause all WebSocket broadcasts to fail!")
        # Try alternative approach
        try:
            loop = asyncio.get_event_loop()
            if loop and not loop.is_closed():
                set_main_event_loop(loop)
                logger.info("Event loop initialized via get_event_loop() fallback")
            else:
                logger.error(f"Event loop is closed or invalid: {loop}")
        except Exception as e2:
            logger.error(f"Fallback also failed: {e2}")
    except Exception as e:
        logger.error(f"Unexpected error setting event loop: {e}", exc_info=True)
    
    try:
        await manager.connect(websocket, client_ip)
        
        while True:
            try:
                # Receive message with timeout
                data = await asyncio.wait_for(
                    websocket.receive_json(),
                    timeout=manager.HEARTBEAT_INTERVAL + 10
                )
                
                action = data.get("action")
                
                if action == "pong":
                    # Handle heartbeat response
                    await manager.handle_pong(websocket)
                    
                elif action == "subscribe":
                    task_id = data.get("task_id")
                    if task_id:
                        await manager.subscribe_to_task(websocket, task_id)
                        await websocket.send_json({
                            "type": "subscribed",
                            "task_id": task_id
                        })
                        
                elif action == "unsubscribe":
                    task_id = data.get("task_id")
                    if task_id:
                        await manager.unsubscribe_from_task(websocket, task_id)
                        await websocket.send_json({
                            "type": "unsubscribed",
                            "task_id": task_id
                        })
                        
                elif action == "ping":
                    # Client-initiated ping
                    await manager.update_heartbeat(websocket)
                    await websocket.send_json({
                        "type": "pong",
                        "timestamp": datetime.now().isoformat()
                    })
                    
            except asyncio.TimeoutError:
                # No message received, check if connection is alive
                await manager.update_heartbeat(websocket)
                continue
                
            except Exception as e:
                logger.error(f"Error processing WebSocket message: {e}")
                break
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)
        try:
            await websocket.close(code=1011, reason=str(e))
        except:
            pass

@router.get("/stats")
async def get_websocket_stats():
    """Get WebSocket connection statistics"""
    return manager.get_stats()

@router.get("/health")
async def websocket_health():
    """WebSocket health check"""
    stats = manager.get_stats()
    return {
        "status": "healthy" if stats["active_connections"] < manager.MAX_CONNECTIONS else "at_capacity",
        "connections": stats["active_connections"],
        "max_connections": manager.MAX_CONNECTIONS,
        "utilization": f"{(stats['active_connections'] / manager.MAX_CONNECTIONS) * 100:.1f}%",
        "task_subscriptions": stats["task_subscriptions"],
        "connections_by_ip": stats["connections_by_ip"],
        "heartbeat_started": manager._heartbeat_started
    }

@router.post("/test-broadcast")
async def test_broadcast(task_id: str = "test-task", status: str = "running"):
    """Test WebSocket broadcast functionality"""
    try:
        test_data = {
            "status": status,
            "step_name": "test_step",
            "error": None,
            "created_at": datetime.now().isoformat(),
            "started_at": datetime.now().isoformat(),
            "completed_at": None
        }
        await manager.broadcast_task_update(task_id, test_data)
        return {
            "success": True,
            "message": f"Test broadcast sent for task {task_id} with status {status}",
            "subscribers": len(manager.task_subscriptions.get(task_id, set()))
        }
    except Exception as e:
        logger.error(f"Test broadcast failed: {e}")
        return {
            "success": False,
            "error": str(e)
        }

