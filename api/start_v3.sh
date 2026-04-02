#!/bin/bash

# ETL API v3 Quick Start Script
# This script helps you start the new v3 API server

set -e

echo "🚀 ETL API v3 Quick Start"
echo "========================="

# Check if we're in the right directory
if [ ! -f "main_v3.py" ]; then
    echo "❌ Error: main_v3.py not found. Please run this script from the api directory."
    exit 1
fi

# Check if virtual environment exists
if [ ! -d "venv" ]; then
    echo "❌ Error: Virtual environment not found. Please create one first:"
    echo "   python -m venv venv"
    echo "   source venv/bin/activate"
    echo "   pip install -r requirements.txt"
    exit 1
fi

# Activate virtual environment
echo "📦 Activating virtual environment..."
source venv/bin/activate

# Check if required packages are installed
echo "🔍 Checking dependencies..."
python -c "import fastapi, uvicorn, apscheduler" 2>/dev/null || {
    echo "❌ Missing dependencies. Installing..."
    pip install -r requirements.txt
}

# Set default port if not specified
PORT=${PORT:-8000}
HOST=${HOST:-0.0.0.0}

echo "🌐 Starting ETL API v3 server..."
echo "   Host: $HOST"
echo "   Port: $PORT"
echo "   URL: http://$HOST:$PORT"
echo ""
echo "Press Ctrl+C to stop the server"
echo "========================="

# Start the server
python main_v3.py

