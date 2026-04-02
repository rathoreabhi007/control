"""
Judgments Router - Analytics endpoints for judgment data
Provides endpoints to view and analyze AI response judgments
"""
from fastapi import APIRouter, Query, HTTPException
from typing import Optional
from pydantic import BaseModel
import logging

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/judgments", tags=["Judgments"])


class JudgmentFilter(BaseModel):
    """Filter parameters for judgment queries"""
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    criteria: Optional[str] = None
    min_score: Optional[int] = None
    max_score: Optional[int] = None
    limit: int = 100


@router.get("/list")
async def list_judgments(
    start_date: Optional[str] = Query(None, description="Filter by date >= (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Filter by date <= (YYYY-MM-DD)"),
    criteria: Optional[str] = Query(None, description="Filter by criteria template"),
    min_score: Optional[int] = Query(None, ge=0, le=100, description="Minimum score"),
    max_score: Optional[int] = Query(None, ge=0, le=100, description="Maximum score"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum results to return")
):
    """
    Get list of judgments with optional filtering.

    Returns judgments sorted by timestamp (newest first).
    Used by the Judgment Analytics page to display data in table.
    """
    try:
        from judgment_service import JudgmentService

        judgments = JudgmentService.get_judgments(
            start_date=start_date,
            end_date=end_date,
            criteria=criteria,
            min_score=min_score,
            max_score=max_score,
            limit=limit
        )

        logger.info(f"Returned {len(judgments)} judgments (filters: date={start_date}-{end_date}, criteria={criteria}, score={min_score}-{max_score})")

        return {
            "judgments": judgments,
            "count": len(judgments),
            "filters": {
                "start_date": start_date,
                "end_date": end_date,
                "criteria": criteria,
                "min_score": min_score,
                "max_score": max_score
            }
        }
    except Exception as e:
        logger.error(f"Error listing judgments: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/statistics")
async def get_statistics(
    start_date: Optional[str] = Query(None, description="Filter by date >= (YYYY-MM-DD)"),
    end_date: Optional[str] = Query(None, description="Filter by date <= (YYYY-MM-DD)")
):
    """
    Get aggregate statistics for judgments.

    Returns:
    - total_count: Total number of judgments
    - average_score: Average score across all judgments
    - pass_rate: Percentage of judgments that passed
    - criteria_counts: Usage count for each criteria template
    - score_distribution: Count of judgments in each score range
    """
    try:
        from judgment_service import JudgmentService

        stats = JudgmentService.get_statistics(
            start_date=start_date,
            end_date=end_date
        )

        logger.info(f"Statistics: {stats['total_count']} judgments, avg score={stats['average_score']}, pass rate={stats['pass_rate']}%")

        return stats
    except Exception as e:
        logger.error(f"Error getting statistics: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/criteria-templates")
async def get_criteria_templates():
    """
    Get available criteria templates.

    Returns all available criteria templates with their names and criteria lists.
    Used by analytics page for filtering dropdown.
    """
    try:
        from routers.ai_assistant import CRITERIA_TEMPLATES

        return {
            "templates": {
                key: {
                    "name": template["name"],
                    "criteria": template["criteria"]
                }
                for key, template in CRITERIA_TEMPLATES.items()
            }
        }
    except Exception as e:
        logger.error(f"Error getting criteria templates: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/cleanup")
async def cleanup_old_judgments():
    """
    Manually trigger cleanup of old judgments.

    Deletes judgment files older than JUDGMENT_RETENTION_DAYS.
    Returns the number of files deleted.
    """
    try:
        from judgment_service import JudgmentService

        deleted_count = JudgmentService.cleanup_old_judgments()

        logger.info(f"Cleanup completed: {deleted_count} files deleted")

        return {
            "deleted_count": deleted_count,
            "message": f"Successfully deleted {deleted_count} old judgment files"
        }
    except Exception as e:
        logger.error(f"Error during cleanup: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health_check():
    """
    Check if judgment system is operational.

    Returns status and configuration information.
    """
    try:
        import os
        from judgment_service import JUDGMENT_STORAGE_DIR, RETENTION_DAYS
        from routers.ai_assistant import JUDGMENT_ENABLED, DEFAULT_CRITERIA_TEMPLATE

        # Check if storage directory exists
        storage_exists = JUDGMENT_STORAGE_DIR.exists()

        # Count files if directory exists
        file_count = len(list(JUDGMENT_STORAGE_DIR.glob("*.json"))) if storage_exists else 0

        return {
            "status": "healthy" if storage_exists else "storage_not_initialized",
            "judgment_enabled": JUDGMENT_ENABLED,
            "storage_dir": str(JUDGMENT_STORAGE_DIR),
            "retention_days": RETENTION_DAYS,
            "default_criteria": DEFAULT_CRITERIA_TEMPLATE,
            "judgment_count": file_count
        }
    except Exception as e:
        logger.error(f"Health check error: {str(e)}")
        return {"status": "error", "error": str(e)}
