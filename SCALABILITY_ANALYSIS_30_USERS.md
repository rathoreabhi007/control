# Scalability Analysis: 30 Concurrent Users with Long-Running Tasks (1-100 minutes)

## Executive Summary

**Current Status**: ⚠️ **Will work but with limitations** - The system can handle 30 users, but several bottlenecks will cause user experience issues under peak load.

**Critical Issues Identified**:
1. **MAX_CONCURRENT_TASKS = 25** - Only 25 tasks can run simultaneously, causing rejections when 30 users try to start tasks
2. **No Task Queue** - Tasks are rejected immediately instead of queued
3. **Long-Running Threads** - 100-minute tasks hold threads for extended periods
4. **No Priority System** - Critical tasks can be blocked by low-priority ones
5. **Memory Accumulation** - Long-running tasks accumulate in memory/disk
6. **WebSocket Broadcasting** - Could be optimized for many subscribers

---

## Current Architecture Analysis

### ✅ What Works Well

1. **WebSocket Connections**: 
   - MAX_CONNECTIONS = 50 (sufficient for 30 users + buffer)
   - Heartbeat mechanism prevents dead connections
   - Automatic cleanup of disconnected clients

2. **Threading Model**:
   - Each task runs in separate thread (good isolation)
   - Daemon threads prevent hanging on shutdown

3. **Task Persistence**:
   - JSON files provide durability
   - Tasks survive server restarts

### ⚠️ Critical Bottlenecks

#### 1. **Concurrent Task Limit (CRITICAL)**

```python
MAX_CONCURRENT_TASKS = 25  # Current limit
```

**Problem Scenario**:
- 30 users each start 1 task = 30 tasks requested
- Only 25 can run → **5 users get immediate rejection**
- If tasks run for 100 minutes, those 5 users wait 100 minutes before retry

**Impact**: 
- **User Experience**: Immediate error messages
- **Resource Waste**: Users retry repeatedly
- **Fairness**: First-come-first-served, no priority

#### 2. **No Task Queue System**

**Current Behavior**:
```python
if running_tasks >= MAX_CONCURRENT_TASKS:
    raise Exception(f"Maximum concurrent tasks limit reached ({MAX_CONCURRENT_TASKS})")
```

**Problem**: Tasks are rejected immediately instead of queued.

**Better Approach**: Queue tasks and start them as slots become available.

#### 3. **Long-Running Threads (1-100 minutes)**

**Memory Impact**:
- Each thread: ~8-16 MB stack space
- 25 threads × 100 minutes = 200-400 MB held for extended periods
- Task state in memory + JSON files on disk = additional memory

**CPU Impact**:
- Python GIL limits true parallelism
- I/O-bound tasks are fine, but CPU-bound tasks compete

#### 4. **WebSocket Broadcasting Overhead**

**Current Implementation**:
```python
for connection in list(self.task_subscriptions[task_id]):
    await connection.send_json(message)  # Sequential sending
```

**Problem**: With 30 users subscribed to same task, this sends 30 messages sequentially.

**Optimization**: Batch or parallelize sends.

---

## Recommendations (Priority Order)

### 🔴 **Priority 1: Implement Task Queue System** (CRITICAL)

**Why**: Prevents immediate rejections and improves user experience.

**Implementation**:

```python
import queue
from enum import Enum
from dataclasses import dataclass
from datetime import datetime

class TaskPriority(Enum):
    HIGH = 1
    NORMAL = 2
    LOW = 3

@dataclass
class QueuedTask:
    task_id: str
    step_name: str
    params: Dict[str, Any]
    priority: TaskPriority
    queued_at: datetime
    user_id: Optional[str] = None

# Add to task_manager_v2.py
task_queue = queue.PriorityQueue()  # Priority queue
queue_lock = threading.Lock()
MAX_QUEUE_SIZE = 100  # Max queued tasks

def run_etl_task(step_name: str, params: Optional[Dict[str, Any]] = None, 
                 priority: TaskPriority = TaskPriority.NORMAL) -> Dict[str, Any]:
    """Start an ETL task - queues if limit reached"""
    if params is None:
        params = {}
    
    # Generate unique task ID
    task_id = str(uuid.uuid4())
    
    # Check if we can start immediately
    with task_lock:
        running_tasks = get_running_tasks_count()
        if running_tasks < MAX_CONCURRENT_TASKS:
            # Start immediately
            return _start_task_immediately(task_id, step_name, params)
    
    # Check queue capacity
    with queue_lock:
        if task_queue.qsize() >= MAX_QUEUE_SIZE:
            raise Exception(f"Task queue is full ({MAX_QUEUE_SIZE} tasks). Please try again later.")
    
    # Queue the task
    queued_task = QueuedTask(
        task_id=task_id,
        step_name=step_name,
        params=params,
        priority=priority,
        queued_at=datetime.now()
    )
    
    # Priority queue: lower number = higher priority
    priority_value = priority.value
    task_queue.put((priority_value, queued_task.queued_at.timestamp(), queued_task))
    
    # Create task record with QUEUED status
    task_data = create_task_record(task_id, step_name, params)
    task_data["status"] = "queued"
    task_data["queued_at"] = queued_task.queued_at.isoformat()
    task_data["queue_position"] = task_queue.qsize()
    
    with task_lock:
        save_task_to_disk(task_id, task_data)
        cache.set(f"task:{task_id}", task_data, expire=TASK_TTL_HOURS * 3600)
    
    # Broadcast queued status
    _broadcast_etl_task_update(task_id, task_data)
    
    logger.info(f"📋 Task {task_id} queued (position: {task_queue.qsize()})")
    
    return {
        "task_id": task_id,
        "status": "queued",
        "queue_position": task_queue.qsize(),
        "estimated_wait_time": _estimate_wait_time()
    }

def _start_task_immediately(task_id: str, step_name: str, params: Dict[str, Any]) -> Dict[str, Any]:
    """Internal function to start task immediately"""
    # ... existing task start logic ...
    pass

def _process_queue():
    """Background thread to process queued tasks"""
    while True:
        try:
            with task_lock:
                running_tasks = get_running_tasks_count()
                if running_tasks >= MAX_CONCURRENT_TASKS:
                    time.sleep(5)  # Wait before checking again
                    continue
            
            # Get next task from queue (non-blocking)
            try:
                priority, timestamp, queued_task = task_queue.get_nowait()
                
                # Start the task
                _start_task_immediately(
                    queued_task.task_id,
                    queued_task.step_name,
                    queued_task.params
                )
                
                logger.info(f"🚀 Started queued task {queued_task.task_id}")
                
            except queue.Empty:
                time.sleep(1)  # No tasks in queue
                
        except Exception as e:
            logger.error(f"Error processing task queue: {e}")
            time.sleep(5)

# Start queue processor thread on module load
queue_processor_thread = threading.Thread(target=_process_queue, daemon=True)
queue_processor_thread.start()
```

**Benefits**:
- ✅ No immediate rejections
- ✅ Tasks start automatically when slots available
- ✅ Priority-based scheduling
- ✅ Better user experience

---

### 🟡 **Priority 2: Increase Concurrent Task Limit** (IMPORTANT)

**Current**: `MAX_CONCURRENT_TASKS = 25`

**Recommendation**: Increase to **40-50** based on server resources.

**Considerations**:
- **CPU Cores**: If 8+ cores, can handle more concurrent I/O-bound tasks
- **Memory**: Each task ~50-200 MB → 40 tasks = 2-8 GB
- **I/O Bandwidth**: Disk/network I/O limits

**Implementation**:
```python
# Dynamic limit based on system resources
import psutil

def get_optimal_concurrent_limit():
    """Calculate optimal concurrent task limit based on system resources"""
    cpu_count = psutil.cpu_count()
    memory_gb = psutil.virtual_memory().total / (1024**3)
    
    # Conservative: 2 tasks per CPU core, max 50
    cpu_based = min(cpu_count * 2, 50)
    
    # Memory-based: 1 task per 200MB available (with 2GB buffer)
    available_memory_gb = (psutil.virtual_memory().available / (1024**3)) - 2
    memory_based = max(int(available_memory_gb * 5), 10)  # 5 tasks per GB
    
    # Use the lower of the two
    optimal = min(cpu_based, memory_based, 50)
    
    return max(optimal, 20)  # Minimum 20

MAX_CONCURRENT_TASKS = get_optimal_concurrent_limit()
```

---

### 🟡 **Priority 3: Optimize WebSocket Broadcasting** (IMPORTANT)

**Current**: Sequential sending to all subscribers

**Optimization**: Parallel sending with asyncio.gather()

```python
async def broadcast_task_update(self, task_id: str, status_data: dict):
    """Broadcast status update to all subscribers with parallel sending"""
    if task_id not in self.task_subscriptions:
        return
    
    message = {
        "type": "task_status",
        "task_id": task_id,
        "data": status_data,
        "timestamp": datetime.now().isoformat()
    }
    
    subscribers = list(self.task_subscriptions[task_id])
    subscriber_count = len(subscribers)
    
    # Create send tasks for all subscribers
    async def send_to_connection(connection):
        try:
            await connection.send_json(message)
            return True
        except Exception as e:
            logger.debug(f"Failed to send to connection: {e}")
            return False
    
    # Send to all subscribers in parallel
    results = await asyncio.gather(
        *[send_to_connection(conn) for conn in subscribers],
        return_exceptions=True
    )
    
    # Count successful sends
    sent_count = sum(1 for r in results if r is True)
    
    # Clean up failed connections
    for i, result in enumerate(results):
        if result is not True:
            self.disconnect(subscribers[i])
    
    logger.debug(f"📡 Broadcast to {sent_count}/{subscriber_count} subscribers")
```

**Benefits**:
- ✅ 10-30x faster for many subscribers
- ✅ Better scalability

---

### 🟢 **Priority 4: Add Task Timeout and Cleanup** (RECOMMENDED)

**Problem**: Long-running tasks (100 min) can accumulate and consume resources.

**Solution**: Add timeout monitoring and automatic cleanup.

```python
MAX_TASK_DURATION_HOURS = 2  # 2 hours max (120 minutes)

def etl_worker_thread(task_id: str, step_name: str, params: Dict[str, Any]):
    """Worker thread with timeout monitoring"""
    start_time = time.time()
    thread_id = threading.current_thread().ident
    
    try:
        # ... existing task execution ...
        
        # Check timeout periodically
        while task_status == "running":
            elapsed = time.time() - start_time
            if elapsed > (MAX_TASK_DURATION_HOURS * 3600):
                logger.warning(f"⏱️ Task {task_id} exceeded max duration, terminating")
                update_task_status(task_id, "failed", error="Task exceeded maximum duration")
                _broadcast_etl_task_update(task_id, {
                    "status": "failed",
                    "error": "Task exceeded maximum duration"
                })
                return
            
            time.sleep(30)  # Check every 30 seconds
            
    except Exception as e:
        # ... error handling ...
        pass
```

---

### 🟢 **Priority 5: Add Resource Monitoring** (RECOMMENDED)

**Implementation**: Monitor system resources and adjust limits dynamically.

```python
def check_system_health() -> Dict[str, Any]:
    """Check system resource availability"""
    cpu_percent = psutil.cpu_percent(interval=1)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage('/')
    
    return {
        "cpu_percent": cpu_percent,
        "memory_percent": memory.percent,
        "memory_available_gb": memory.available / (1024**3),
        "disk_percent": disk.percent,
        "disk_free_gb": disk.free / (1024**3),
        "healthy": (
            cpu_percent < 90 and
            memory.percent < 85 and
            disk.percent < 90
        )
    }

# Use in task start logic
def can_start_new_task() -> bool:
    """Check if system can handle new task"""
    health = check_system_health()
    if not health["healthy"]:
        return False
    
    with task_lock:
        running_tasks = get_running_tasks_count()
        return running_tasks < MAX_CONCURRENT_TASKS
```

---

### 🟢 **Priority 6: Add Task Progress Updates** (NICE TO HAVE)

**For Long-Running Tasks**: Send periodic progress updates via WebSocket.

```python
def etl_worker_thread(task_id: str, step_name: str, params: Dict[str, Any]):
    """Worker thread with progress updates"""
    start_time = time.time()
    
    # Send progress every 10% or every 5 minutes
    last_progress_time = start_time
    progress_interval = 300  # 5 minutes
    
    try:
        # ... task execution ...
        
        # Send progress updates
        current_time = time.time()
        if current_time - last_progress_time >= progress_interval:
            elapsed = current_time - start_time
            progress_data = {
                "status": "running",
                "progress": min(int((elapsed / estimated_duration) * 100), 99),
                "elapsed_seconds": int(elapsed),
                "estimated_remaining_seconds": int(estimated_duration - elapsed)
            }
            _broadcast_etl_task_update(task_id, progress_data)
            last_progress_time = current_time
            
    except Exception as e:
        # ... error handling ...
        pass
```

---

## Performance Projections

### Current Architecture (30 Users)

**Scenario**: 30 users, each starts 1 task (some 1 min, some 100 min)

| Metric | Current | With Recommendations |
|--------|---------|---------------------|
| **Immediate Rejections** | 5 users (17%) | 0 users (0%) |
| **Average Wait Time** | 0-100 min | 0-5 min (queued) |
| **Concurrent Tasks** | 25 max | 40-50 max |
| **WebSocket Broadcast Time** | 30-100ms | 5-10ms (parallel) |
| **Memory Usage** | 2-4 GB | 3-6 GB |
| **User Experience** | ⚠️ Poor | ✅ Good |

### Resource Requirements

**Minimum Server Specs (30 Users)**:
- **CPU**: 8+ cores (for I/O-bound tasks)
- **RAM**: 8 GB minimum, 16 GB recommended
- **Disk**: 50+ GB free (for task storage)
- **Network**: 100 Mbps (for WebSocket + data transfer)

**Recommended Server Specs**:
- **CPU**: 16 cores
- **RAM**: 32 GB
- **Disk**: 200+ GB SSD
- **Network**: 1 Gbps

---

## Implementation Roadmap

### Phase 1: Critical Fixes (Week 1)
1. ✅ Implement task queue system
2. ✅ Increase MAX_CONCURRENT_TASKS to 40
3. ✅ Add queue position in API response

### Phase 2: Optimizations (Week 2)
1. ✅ Optimize WebSocket broadcasting (parallel)
2. ✅ Add system health monitoring
3. ✅ Dynamic concurrent task limit

### Phase 3: Enhancements (Week 3)
1. ✅ Task timeout and cleanup
2. ✅ Progress updates for long-running tasks
3. ✅ Resource usage dashboard

---

## Testing Recommendations

### Load Testing Scenarios

1. **30 Users Simultaneous Start**:
   - All 30 users start tasks at same time
   - Verify: Queue handles all, no rejections

2. **Long-Running Task Stress**:
   - Start 25 tasks that run for 100 minutes
   - Verify: System remains responsive

3. **WebSocket Broadcast Stress**:
   - 30 users subscribe to same task
   - Verify: All receive updates within 100ms

4. **Resource Exhaustion**:
   - Start tasks until memory/CPU limits
   - Verify: Graceful degradation, no crashes

---

## Conclusion

**Will it work?** ✅ **Yes, but with improvements needed**

**Current State**: Can handle 30 users but will reject ~17% of task requests under peak load.

**With Recommendations**: Can handle 30 users smoothly with queue system, better resource management, and optimizations.

**Priority Actions**:
1. 🔴 **Implement task queue** (prevents rejections)
2. 🟡 **Increase concurrent limit** (handles more tasks)
3. 🟡 **Optimize WebSocket** (better performance)

**Estimated Implementation Time**: 1-2 weeks for all recommendations.

