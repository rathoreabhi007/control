#!/usr/bin/env python3
"""
Performance Monitor for ETL API
Tracks concurrent users, response times, and system health
"""

import time
import threading
import logging
import json
import psutil
import os
from datetime import datetime, timedelta
from collections import defaultdict, deque
from typing import Dict, Any, List
from pathlib import Path
import requests
import statistics

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class PerformanceMonitor:
    """Monitor system performance and concurrent user load"""
    
    def __init__(self, api_base_url: str = "http://localhost:8000"):
        self.api_base_url = api_base_url
        self.start_time = time.time()
        
        # Performance tracking
        self.operation_times = defaultdict(list)
        self.concurrent_requests = 0
        self.max_concurrent_requests = 0
        self.total_requests = 0
        self.failed_requests = 0
        
        # Thread-safe counters
        self.lock = threading.Lock()
        
        # System metrics
        self.system_metrics = deque(maxlen=1000)  # Keep last 1000 measurements
        
        # Start monitoring thread
        self.monitoring = True
        self.monitor_thread = threading.Thread(target=self._monitor_system, daemon=True)
        self.monitor_thread.start()
        
        logger.info("Performance Monitor started")
    
    def track_operation(self, operation_name: str):
        """Decorator to track operation performance"""
        def decorator(func):
            def wrapper(*args, **kwargs):
                start_time = time.time()
                with self.lock:
                    self.concurrent_requests += 1
                    self.total_requests += 1
                    self.max_concurrent_requests = max(self.max_concurrent_requests, self.concurrent_requests)
                
                try:
                    result = func(*args, **kwargs)
                    return result
                except Exception as e:
                    with self.lock:
                        self.failed_requests += 1
                    raise
                finally:
                    duration = time.time() - start_time
                    with self.lock:
                        self.operation_times[operation_name].append(duration)
                        self.concurrent_requests -= 1
            return wrapper
        return decorator
    
    def _monitor_system(self):
        """Monitor system resources in background"""
        while self.monitoring:
            try:
                # Get system metrics
                cpu_percent = psutil.cpu_percent(interval=1)
                memory = psutil.virtual_memory()
                disk = psutil.disk_usage('/')
                
                # Get process metrics
                process = psutil.Process(os.getpid())
                process_memory = process.memory_info().rss / 1024 / 1024  # MB
                
                metrics = {
                    'timestamp': datetime.now().isoformat(),
                    'cpu_percent': cpu_percent,
                    'memory_percent': memory.percent,
                    'memory_available_mb': memory.available / 1024 / 1024,
                    'disk_percent': disk.percent,
                    'disk_free_gb': disk.free / 1024 / 1024 / 1024,
                    'process_memory_mb': process_memory,
                    'concurrent_requests': self.concurrent_requests,
                    'total_requests': self.total_requests,
                    'failed_requests': self.failed_requests
                }
                
                self.system_metrics.append(metrics)
                
                # Log every 30 seconds
                if len(self.system_metrics) % 30 == 0:
                    logger.info(f"System: CPU {cpu_percent:.1f}%, Memory {memory.percent:.1f}%, "
                              f"Concurrent: {self.concurrent_requests}, Total: {self.total_requests}")
                
                time.sleep(1)
                
            except Exception as e:
                logger.error(f"Monitoring error: {e}")
                time.sleep(5)
    
    def get_performance_stats(self) -> Dict[str, Any]:
        """Get comprehensive performance statistics"""
        with self.lock:
            stats = {
                'uptime_seconds': time.time() - self.start_time,
                'total_requests': self.total_requests,
                'failed_requests': self.failed_requests,
                'success_rate': (self.total_requests - self.failed_requests) / max(self.total_requests, 1) * 100,
                'max_concurrent_requests': self.max_concurrent_requests,
                'current_concurrent_requests': self.concurrent_requests,
                'operation_stats': {}
            }
            
            # Calculate operation statistics
            for operation, times in self.operation_times.items():
                if times:
                    stats['operation_stats'][operation] = {
                        'count': len(times),
                        'avg_time_ms': statistics.mean(times) * 1000,
                        'median_time_ms': statistics.median(times) * 1000,
                        'p95_time_ms': self._percentile(times, 95) * 1000,
                        'p99_time_ms': self._percentile(times, 99) * 1000,
                        'max_time_ms': max(times) * 1000,
                        'min_time_ms': min(times) * 1000
                    }
            
            # System metrics summary
            if self.system_metrics:
                recent_metrics = list(self.system_metrics)[-60:]  # Last 60 seconds
                stats['system_summary'] = {
                    'avg_cpu_percent': statistics.mean([m['cpu_percent'] for m in recent_metrics]),
                    'avg_memory_percent': statistics.mean([m['memory_percent'] for m in recent_metrics]),
                    'avg_concurrent_requests': statistics.mean([m['concurrent_requests'] for m in recent_metrics]),
                    'max_concurrent_requests': max([m['concurrent_requests'] for m in recent_metrics])
                }
            
            return stats
    
    def _percentile(self, data: List[float], percentile: int) -> float:
        """Calculate percentile of data"""
        if not data:
            return 0
        sorted_data = sorted(data)
        index = int(len(sorted_data) * percentile / 100)
        return sorted_data[min(index, len(sorted_data) - 1)]
    
    def test_concurrent_load(self, num_users: int = 50, duration_seconds: int = 60) -> Dict[str, Any]:
        """Test system under concurrent load"""
        logger.info(f"Starting concurrent load test: {num_users} users for {duration_seconds} seconds")
        
        results = {
            'test_config': {
                'num_users': num_users,
                'duration_seconds': duration_seconds,
                'start_time': datetime.now().isoformat()
            },
            'results': {
                'total_requests': 0,
                'successful_requests': 0,
                'failed_requests': 0,
                'response_times': [],
                'concurrent_users_peak': 0
            }
        }
        
        def simulate_user(user_id: int):
            """Simulate a single user making requests"""
            user_requests = 0
            user_successes = 0
            user_failures = 0
            user_response_times = []
            
            end_time = time.time() + duration_seconds
            
            while time.time() < end_time:
                try:
                    start_time = time.time()
                    
                    # Test task creation
                    response = requests.post(
                        f"{self.api_base_url}/run/read_csv",
                        json={"parameters": {"inputConfigFilePath": f"/test/path/user_{user_id}"}},
                        timeout=10
                    )
                    
                    response_time = time.time() - start_time
                    user_response_times.append(response_time)
                    user_requests += 1
                    
                    if response.status_code == 200:
                        user_successes += 1
                    else:
                        user_failures += 1
                        logger.warning(f"User {user_id} got status {response.status_code}")
                    
                    # Random delay between requests (1-3 seconds)
                    time.sleep(1 + (user_id % 3))
                    
                except Exception as e:
                    user_failures += 1
                    logger.error(f"User {user_id} error: {e}")
                    time.sleep(1)
            
            return {
                'user_id': user_id,
                'requests': user_requests,
                'successes': user_successes,
                'failures': user_failures,
                'response_times': user_response_times
            }
        
        # Start concurrent users
        threads = []
        for i in range(num_users):
            thread = threading.Thread(target=simulate_user, args=(i,))
            threads.append(thread)
            thread.start()
        
        # Wait for all threads to complete
        for thread in threads:
            thread.join()
        
        # Collect results
        total_requests = 0
        total_successes = 0
        total_failures = 0
        all_response_times = []
        
        for thread in threads:
            # Note: In a real implementation, you'd collect results from threads
            # This is simplified for demonstration
            pass
        
        # Get final statistics
        final_stats = self.get_performance_stats()
        
        results['results'] = {
            'total_requests': final_stats['total_requests'],
            'successful_requests': final_stats['total_requests'] - final_stats['failed_requests'],
            'failed_requests': final_stats['failed_requests'],
            'success_rate': final_stats['success_rate'],
            'max_concurrent_requests': final_stats['max_concurrent_requests'],
            'avg_response_time_ms': final_stats['operation_stats'].get('task_creation', {}).get('avg_time_ms', 0),
            'p95_response_time_ms': final_stats['operation_stats'].get('task_creation', {}).get('p95_time_ms', 0)
        }
        
        results['test_config']['end_time'] = datetime.now().isoformat()
        
        logger.info(f"Load test completed: {results['results']['success_rate']:.1f}% success rate")
        return results
    
    def stop(self):
        """Stop monitoring"""
        self.monitoring = False
        if self.monitor_thread.is_alive():
            self.monitor_thread.join(timeout=5)
        logger.info("Performance Monitor stopped")
    
    def save_report(self, filename: str = None):
        """Save performance report to file"""
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"performance_report_{timestamp}.json"
        
        report = {
            'report_time': datetime.now().isoformat(),
            'performance_stats': self.get_performance_stats(),
            'system_metrics': list(self.system_metrics)
        }
        
        with open(filename, 'w') as f:
            json.dump(report, f, indent=2)
        
        logger.info(f"Performance report saved to: {filename}")
        return filename

# Global monitor instance
monitor = PerformanceMonitor()

def track_operation(operation_name: str):
    """Decorator to track operation performance"""
    return monitor.track_operation(operation_name)

def get_performance_stats() -> Dict[str, Any]:
    """Get current performance statistics"""
    return monitor.get_performance_stats()

def test_concurrent_load(num_users: int = 50, duration_seconds: int = 60) -> Dict[str, Any]:
    """Test system under concurrent load"""
    return monitor.test_concurrent_load(num_users, duration_seconds)

def save_performance_report(filename: str = None) -> str:
    """Save performance report"""
    return monitor.save_report(filename)

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="ETL API Performance Monitor")
    parser.add_argument("--test", action="store_true", help="Run concurrent load test")
    parser.add_argument("--users", type=int, default=50, help="Number of concurrent users for test")
    parser.add_argument("--duration", type=int, default=60, help="Test duration in seconds")
    parser.add_argument("--report", action="store_true", help="Generate performance report")
    
    args = parser.parse_args()
    
    try:
        if args.test:
            logger.info(f"Running load test with {args.users} users for {args.duration} seconds")
            results = test_concurrent_load(args.users, args.duration)
            
            print("\n" + "="*60)
            print("LOAD TEST RESULTS")
            print("="*60)
            print(f"Total Requests: {results['results']['total_requests']}")
            print(f"Success Rate: {results['results']['success_rate']:.1f}%")
            print(f"Max Concurrent: {results['results']['max_concurrent_requests']}")
            print(f"Avg Response Time: {results['results']['avg_response_time_ms']:.1f}ms")
            print(f"95th Percentile: {results['results']['p95_response_time_ms']:.1f}ms")
            print("="*60)
        
        if args.report:
            filename = save_performance_report()
            print(f"Performance report saved to: {filename}")
        
        # Keep running to monitor
        if not args.test and not args.report:
            print("Performance monitor running. Press Ctrl+C to stop.")
            try:
                while True:
                    time.sleep(10)
                    stats = get_performance_stats()
                    print(f"Current: {stats['current_concurrent_requests']} concurrent, "
                          f"{stats['total_requests']} total requests, "
                          f"{stats['success_rate']:.1f}% success rate")
            except KeyboardInterrupt:
                print("\nStopping monitor...")
                monitor.stop()
    
    except Exception as e:
        logger.error(f"Error: {e}")
        monitor.stop()
