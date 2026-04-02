"""
Test script to verify ETL subprocess implementation
Tests the subprocess-based ETL execution
"""
import requests
import time
import json
from pathlib import Path

API_BASE_URL = "http://127.0.0.1:8000"

def test_etl_subprocess():
    """Test ETL task execution via subprocess"""
    print("=" * 80)
    print("Testing ETL Subprocess Implementation")
    print("=" * 80)
    
    # Test 1: Start an ETL task
    print("\nTest 1: Starting ETL task (reading_config_comp)...")
    step_name = "reading_config_comp"
    
    request_body = {
        "parameters": {
            "runEnv": "test"
        },
        "previous_outputs": None,
        "custom_params": {}
    }
    
    try:
        response = requests.post(
            f"{API_BASE_URL}/run/{step_name}",
            json=request_body,
            timeout=10
        )
        response.raise_for_status()
        result = response.json()
        task_id = result.get("task_id")
        print(f"Task started successfully!")
        print(f"   Task ID: {task_id}")
        print(f"   Status: {result.get('status')}")
        print(f"   Thread ID: {result.get('thread_id')}")
        print(f"   PID: {result.get('pid')} (will be available after subprocess starts)")
    except Exception as e:
        print(f"Failed to start task: {e}")
        return False
    
    # Test 2: Check status (wait a bit for subprocess to start)
    print("\n⏳ Waiting 3 seconds for subprocess to start...")
    time.sleep(3)
    
    print("\nTest 2: Checking task status...")
    try:
        response = requests.get(
            f"{API_BASE_URL}/status/{task_id}",
            timeout=10
        )
        response.raise_for_status()
        status = response.json()
        print(f"Status retrieved!")
        print(f"   Status: {status.get('status')}")
        print(f"   Step Name: {status.get('step_name')}")
        print(f"   Created At: {status.get('created_at')}")
        print(f"   Started At: {status.get('started_at')}")
        
        # Check if we can see the task file to verify PID
        task_file = Path("api/task_storage") / f"{task_id}.json"
        if task_file.exists():
            with open(task_file, 'r') as f:
                task_data = json.load(f)
                pid = task_data.get("pid")
                if pid:
                    print(f"   Subprocess PID: {pid}")
                    print(f"   Log File: {task_data.get('log_file', 'N/A')}")
                else:
                    print(f"   PID not yet available (subprocess may still be starting)")
    except Exception as e:
        print(f"Failed to get status: {e}")
        return False
    
    # Test 3: Wait for completion (with timeout)
    print("\n⏳ Test 3: Waiting for task completion (max 60 seconds)...")
    max_wait = 60
    start_time = time.time()
    while time.time() - start_time < max_wait:
        try:
            response = requests.get(
                f"{API_BASE_URL}/status/{task_id}",
                timeout=10
            )
            response.raise_for_status()
            status = response.json()
            current_status = status.get('status')
            
            if current_status in ['completed', 'failed']:
                print(f"\nTask finished with status: {current_status}")
                break
            else:
                elapsed = int(time.time() - start_time)
                print(f"   Status: {current_status} (elapsed: {elapsed}s)", end='\r')
                time.sleep(2)
        except Exception as e:
            print(f"\nError checking status: {e}")
            return False
    else:
        print(f"\nTask did not complete within {max_wait} seconds")
        return False
    
    # Test 4: Get output
    print("\nTest 4: Getting task output...")
    try:
        response = requests.get(
            f"{API_BASE_URL}/output/{task_id}",
            timeout=10
        )
        response.raise_for_status()
        output = response.json()
        print(f"Output retrieved!")
        
        if status.get('status') == 'completed':
            result = output.get('output', {})
            if isinstance(result, dict):
                print(f"   Status: {result.get('status', 'N/A')}")
                print(f"   Step Type: {result.get('step_type', 'N/A')}")
                print(f"   Count: {result.get('count', 'N/A')}")
                if 'file_info' in result:
                    file_info = result['file_info']
                    print(f"   File Created: {file_info.get('file_path', 'N/A')}")
                    print(f"   File Size: {file_info.get('file_size_mb', 'N/A')} MB")
        else:
            print(f"   Error: {status.get('error', 'N/A')}")
    except Exception as e:
        print(f"Failed to get output: {e}")
        return False
    
    # Test 5: Verify subprocess files exist
    print("\nTest 5: Verifying subprocess files...")
    task_storage = Path("api/task_storage")
    
    params_file = task_storage / f"{task_id}_params.json"
    result_file = task_storage / f"{task_id}_result.json"
    log_dir = task_storage / "logs"
    
    checks = [
        ("Task JSON file", task_storage / f"{task_id}.json", True),
        ("Params file", params_file, True),
        ("Result file", result_file, True),
        ("Log directory", log_dir, True),
    ]
    
    all_ok = True
    for name, path, should_exist in checks:
        exists = path.exists()
        if should_exist and exists:
            print(f"   {name}: {path}")
        elif should_exist and not exists:
            print(f"   {name}: Missing! ({path})")
            all_ok = False
        elif not should_exist and not exists:
            print(f"   {name}: Correctly absent")
        else:
            print(f"   {name}: Unexpectedly present")
    
    # Check for log files
    if log_dir.exists():
        log_files = list(log_dir.glob(f"**/{task_id}*.log"))
        if log_files:
            print(f"   Found {len(log_files)} log file(s):")
            for log_file in log_files[:3]:  # Show first 3
                print(f"      - {log_file}")
        else:
            print(f"   No log files found in {log_dir}")
    
    print("\n" + "=" * 80)
    if all_ok and status.get('status') == 'completed':
        print("ALL TESTS PASSED!")
        print("   - Task started successfully")
        print("   - Subprocess created and monitored")
        print("   - Task completed successfully")
        print("   - All files created correctly")
        print("   - Output retrieved successfully")
    else:
        print("SOME TESTS HAD ISSUES")
        print(f"   - Task status: {status.get('status')}")
        print(f"   - All files check: {'OK' if all_ok else 'FAIL'}")
    print("=" * 80)
    
    return all_ok and status.get('status') == 'completed'


if __name__ == "__main__":
    print("\nMake sure the FastAPI server is running on http://127.0.0.1:8000")
    print("   Start it with: cd api && python main_v2.py\n")
    
    try:
        # Quick health check
        response = requests.get(f"{API_BASE_URL}/health", timeout=5)
        if response.status_code == 200:
            print("API server is running\n")
        else:
            print("API server returned non-200 status")
            exit(1)
    except Exception as e:
        print(f"Cannot connect to API server: {e}")
        print("   Please start the server first!")
        exit(1)
    
    success = test_etl_subprocess()
    exit(0 if success else 1)

