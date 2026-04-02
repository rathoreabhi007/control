import psutil
import time
from datetime import datetime
import sys

def format_bytes(bytes_value):
    """Format bytes to human-readable format"""
    for unit in ['B', 'KB', 'MB', 'GB', 'TB']:
        if bytes_value < 1024.0:
            return f"{bytes_value:.2f}{unit}"
        bytes_value /= 1024.0
    return f"{bytes_value:.2f}PB"

def log_system_metrics(log_file="cpu_usage.log"):
    """Log system metrics to file"""
    print("=" * 80)
    print("System Monitoring Started")
    print(f"Logging to: {log_file}")
    print(f"⏱️  Interval: 5 seconds")
    print(f"Press Ctrl+C to stop")
    print("=" * 80)
    
    with open(log_file, 'a') as f:
        # Write header on start
        f.write(f"\n{'=' * 80}\n")
        f.write(f"Monitoring Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"{'=' * 80}\n")
        f.flush()
        
        while True:
            try:
                timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
                
                # CPU metrics
                cpu_percent = psutil.cpu_percent(interval=1)
                cpu_freq = psutil.cpu_freq()
                cpu_per_core = psutil.cpu_percent(interval=1, percpu=True)
                
                # Load average (works on Unix/Linux, may not work on Windows)
                try:
                    load_avg = psutil.getloadavg()
                except AttributeError:
                    # Windows doesn't have getloadavg, use CPU count as approximation
                    load_avg = (cpu_percent / 100 * psutil.cpu_count(), 
                               cpu_percent / 100 * psutil.cpu_count(), 
                               cpu_percent / 100 * psutil.cpu_count())
                
                # Memory metrics
                mem = psutil.virtual_memory()
                swap = psutil.swap_memory()
                
                # Format log line
                log_line = (
                    f"{timestamp} | "
                    f"CPU: {cpu_percent:.1f}% | "
                    f"Freq: {cpu_freq.current:.0f}MHz | "
                    f"Load: {load_avg[0]:.2f}/{load_avg[1]:.2f}/{load_avg[2]:.2f} | "
                    f"MEM: {mem.percent:.1f}% | "
                    f"Used: {format_bytes(mem.used)} | "
                    f"Avail: {format_bytes(mem.available)} | "
                    f"Total: {format_bytes(mem.total)} | "
                    f"SWAP: {swap.percent:.1f}% | "
                    f"Per-Core: [{', '.join([f'{x:.1f}%' for x in cpu_per_core])}]\n"
                )
                
                f.write(log_line)
                f.flush()  # Ensure data is written immediately
                
                # Console output every 10 entries (reduce clutter)
                if int(time.time()) % 50 == 0:  # Print every ~50 seconds
                    print(f"Monitoring active - CPU: {cpu_percent:.1f}% | MEM: {mem.percent:.1f}%")
                
                time.sleep(5)  # Log every 5 seconds
                
            except KeyboardInterrupt:
                print("\n" + "=" * 80)
                print("Monitoring stopped by user")
                print(f"Log file: {log_file}")
                print("=" * 80)
                f.write(f"\n{'=' * 80}\n")
                f.write(f"Monitoring Stopped: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
                f.write(f"{'=' * 80}\n\n")
                f.flush()
                break
            except Exception as e:
                print(f"Error: {e}")
                time.sleep(5)

if __name__ == "__main__":
    log_file = "cpu_usage.log"
    
    # Check if custom log file path provided
    if len(sys.argv) > 1:
        log_file = sys.argv[1]
    
    log_system_metrics(log_file)


