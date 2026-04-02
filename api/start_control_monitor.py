#!/usr/bin/env python3
"""
Control Status Monitor Startup Script
Starts the background status monitor for control tasks
"""

import sys
import os
from pathlib import Path

# Add the api directory to Python path
api_dir = Path(__file__).parent
sys.path.insert(0, str(api_dir))

from control_execution.status_monitor import main

if __name__ == "__main__":
    print("Starting Control Status Monitor...")
    print("   This monitor runs independently of the main API")
    print("   It checks control task status every 5 seconds")
    print("   Press Ctrl+C to stop")
    print("=" * 60)
    
    main()
