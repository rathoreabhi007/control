"""
System and Health Check Router
"""
from fastapi import APIRouter, HTTPException
from datetime import datetime
import logging
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))
from task_manager_v2 import get_system_stats
from .models import SystemStatsResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="", tags=["system"])


@router.get("/")
def read_root():
    return {
        "message": "Welcome to the ETL API v2 with File-Based Task Management",
        "version": "2.0.0",
        "architecture": "file-based JSON persistence"
    }


@router.get("/health")
async def health_check():
    """Health check endpoint with system stats"""
    try:
        stats = get_system_stats()
        return {
            "status": "healthy",
            "timestamp": datetime.now().isoformat(),
            "system_stats": stats
        }
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return {
            "status": "unhealthy",
            "error": str(e),
            "timestamp": datetime.now().isoformat()
        }


@router.get("/stats", response_model=SystemStatsResponse)
async def get_system_stats_endpoint():
    """Get system statistics"""
    try:
        stats = get_system_stats()
        return SystemStatsResponse(**stats)
    except Exception as e:
        logger.error(f"Error getting system stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

