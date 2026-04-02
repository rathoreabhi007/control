"""
Judgment Service - File-based judgment storage and retrieval
Follows the pattern from control_execution/control_runner.py for file-based persistence
"""
import json
import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Optional, Any
import logging

logger = logging.getLogger(__name__)

# Storage configuration
JUDGMENT_STORAGE_DIR = Path(__file__).parent / "judgment_storage" / "judgments"
RETENTION_DAYS = int(os.environ.get("JUDGMENT_RETENTION_DAYS", "30"))


def ensure_storage_dir():
    """Ensure judgment storage directory exists"""
    JUDGMENT_STORAGE_DIR.mkdir(parents=True, exist_ok=True)


class JudgmentService:
    """Manages judgment file storage and retrieval"""

    @staticmethod
    def save_judgment(judgment_data: Dict[str, Any]) -> str:
        """
        Save judgment to file.

        Args:
            judgment_data: Complete judgment data including metadata

        Returns:
            str: judgment_id of saved judgment
        """
        ensure_storage_dir()

        judgment_id = judgment_data.get("judgment_id")
        if not judgment_id:
            timestamp = datetime.now().timestamp()
            judgment_id = f"judgment-{int(timestamp)}-{os.urandom(4).hex()}"
            judgment_data["judgment_id"] = judgment_id

        # Create filename with date prefix for easy filtering
        date_str = datetime.now().strftime("%Y-%m-%d")
        chat_id = judgment_data.get("chat_id", "unknown")
        filename = f"{date_str}_{chat_id}_{judgment_id}.json"
        file_path = JUDGMENT_STORAGE_DIR / filename

        try:
            with open(file_path, "w", encoding="utf-8") as f:
                json.dump(judgment_data, f, indent=2, ensure_ascii=False)

            logger.info(f"Saved judgment: {judgment_id} to {filename}")
            return judgment_id

        except Exception as e:
            logger.error(f"Failed to save judgment {judgment_id}: {str(e)}")
            raise

    @staticmethod
    def get_judgments(
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        criteria: Optional[str] = None,
        min_score: Optional[int] = None,
        max_score: Optional[int] = None,
        limit: int = 100
    ) -> List[Dict[str, Any]]:
        """
        Get judgments with optional filters.

        Args:
            start_date: Filter by date >= this (YYYY-MM-DD format)
            end_date: Filter by date <= this (YYYY-MM-DD format)
            criteria: Filter by criteria_template
            min_score: Filter by score >= this
            max_score: Filter by score <= this
            limit: Maximum number of results

        Returns:
            List of judgment data dictionaries, sorted by timestamp (newest first)
        """
        ensure_storage_dir()

        judgments = []

        try:
            # Get all judgment files
            files = sorted(JUDGMENT_STORAGE_DIR.glob("*.json"), reverse=True)

            for file_path in files:
                if len(judgments) >= limit:
                    break

                try:
                    with open(file_path, "r", encoding="utf-8") as f:
                        judgment = json.load(f)

                    # Apply filters
                    timestamp = judgment.get("timestamp")
                    if not timestamp:
                        continue

                    # Date filtering
                    judgment_date = datetime.fromisoformat(timestamp.replace('Z', '+00:00')).date()

                    if start_date:
                        start = datetime.strptime(start_date, "%Y-%m-%d").date()
                        if judgment_date < start:
                            continue

                    if end_date:
                        end = datetime.strptime(end_date, "%Y-%m-%d").date()
                        if judgment_date > end:
                            continue

                    # Criteria filtering
                    if criteria and judgment.get("criteria_template") != criteria:
                        continue

                    # Score filtering
                    score = judgment.get("judgment", {}).get("score")
                    if score is not None:
                        if min_score is not None and score < min_score:
                            continue
                        if max_score is not None and score > max_score:
                            continue

                    judgments.append(judgment)

                except json.JSONDecodeError as e:
                    logger.warning(f"Invalid JSON in {file_path.name}: {str(e)}")
                    continue
                except Exception as e:
                    logger.warning(f"Error reading {file_path.name}: {str(e)}")
                    continue

            logger.info(f"Retrieved {len(judgments)} judgments (limit: {limit})")
            return judgments

        except Exception as e:
            logger.error(f"Error retrieving judgments: {str(e)}")
            return []

    @staticmethod
    def get_statistics(
        start_date: Optional[str] = None,
        end_date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Get aggregate statistics for judgments.

        Args:
            start_date: Filter by date >= this (YYYY-MM-DD format)
            end_date: Filter by date <= this (YYYY-MM-DD format)

        Returns:
            Dictionary with statistics:
            - total_count
            - average_score
            - pass_rate
            - criteria_counts (dict of criteria -> count)
            - score_distribution (dict of score ranges)
        """
        judgments = JudgmentService.get_judgments(
            start_date=start_date,
            end_date=end_date,
            limit=10000  # Get all for statistics
        )

        if not judgments:
            return {
                "total_count": 0,
                "average_score": 0,
                "pass_rate": 0,
                "criteria_counts": {},
                "score_distribution": {}
            }

        total_count = len(judgments)
        scores = []
        passed_count = 0
        criteria_counts = {}
        score_distribution = {
            "0-20": 0,
            "21-40": 0,
            "41-60": 0,
            "61-80": 0,
            "81-100": 0
        }

        for judgment in judgments:
            # Collect scores
            score = judgment.get("judgment", {}).get("score")
            if score is not None:
                scores.append(score)

                # Score distribution
                if score <= 20:
                    score_distribution["0-20"] += 1
                elif score <= 40:
                    score_distribution["21-40"] += 1
                elif score <= 60:
                    score_distribution["41-60"] += 1
                elif score <= 80:
                    score_distribution["61-80"] += 1
                else:
                    score_distribution["81-100"] += 1

            # Count passed
            if judgment.get("judgment", {}).get("passed"):
                passed_count += 1

            # Count criteria usage
            criteria = judgment.get("criteria_template")
            if criteria:
                criteria_counts[criteria] = criteria_counts.get(criteria, 0) + 1

        avg_score = sum(scores) / len(scores) if scores else 0
        pass_rate = (passed_count / total_count * 100) if total_count > 0 else 0

        # Find most used criteria
        most_used_criteria = max(criteria_counts.items(), key=lambda x: x[1])[0] if criteria_counts else None

        return {
            "total_count": total_count,
            "average_score": round(avg_score, 2),
            "pass_rate": round(pass_rate, 2),
            "passed_count": passed_count,
            "criteria_counts": criteria_counts,
            "most_used_criteria": most_used_criteria,
            "score_distribution": score_distribution
        }

    @staticmethod
    def cleanup_old_judgments() -> int:
        """
        Remove judgments older than RETENTION_DAYS.

        Returns:
            int: Number of files deleted
        """
        ensure_storage_dir()

        cutoff_date = datetime.now() - timedelta(days=RETENTION_DAYS)
        deleted_count = 0

        try:
            for file_path in JUDGMENT_STORAGE_DIR.glob("*.json"):
                try:
                    # Check file modification time
                    file_mtime = datetime.fromtimestamp(file_path.stat().st_mtime)

                    if file_mtime < cutoff_date:
                        file_path.unlink()
                        deleted_count += 1
                        logger.debug(f"Deleted old judgment: {file_path.name}")

                except Exception as e:
                    logger.warning(f"Error deleting {file_path.name}: {str(e)}")
                    continue

            if deleted_count > 0:
                logger.info(f"Cleaned up {deleted_count} old judgment files (>{RETENTION_DAYS} days)")

            return deleted_count

        except Exception as e:
            logger.error(f"Error during cleanup: {str(e)}")
            return 0
