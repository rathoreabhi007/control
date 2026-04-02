from fastapi import APIRouter, HTTPException, Header
from typing import List, Dict, Any, Optional
from pydantic import BaseModel
import json
import os
import logging

router = APIRouter(prefix="/api/users", tags=["Users"])
logger = logging.getLogger(__name__)

# Path to role permissions file
ROLE_PERMISSIONS_FILE = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "role_permissions.json")

class UserResponse(BaseModel):
    id: str
    name: str
    email: str
    roles: List[str]
    permissions: List[str]

def load_role_permissions() -> Dict[str, Any]:
    """Load role-based permissions from JSON file"""
    try:
        with open(ROLE_PERMISSIONS_FILE, 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        logger.error(f"Role permissions file not found at {ROLE_PERMISSIONS_FILE}")
        return {"roles": {}}
    except json.JSONDecodeError:
        logger.error(f"Invalid JSON in role permissions file at {ROLE_PERMISSIONS_FILE}")
        return {"roles": {}}

def get_permissions_for_roles(roles: List[str]) -> List[str]:
    """Get combined permissions for given roles"""
    role_data = load_role_permissions()
    all_permissions = set()

    for role in roles:
        role_config = role_data.get("roles", {}).get(role, {})
        permissions = role_config.get("permissions", [])

        # If any role has wildcard, return wildcard
        if "*" in permissions:
            return ["*"]

        all_permissions.update(permissions)

    return sorted(list(all_permissions))

def get_current_user_from_header(authorization: Optional[str] = None) -> Dict[str, Any]:
    """
    Dummy authentication function that simulates getting user from token/session.

    In production, this would:
    - Parse JWT token from Authorization header
    - Validate token and extract user claims
    - Query database for user details
    - Return user info

    For now, returns mock data based on header or defaults to admin.
    """
    # Mock user database - in production this would be a real database query
    mock_users = {
        "admin": {
            "id": "admin",
            "name": "Admin User",
            "email": "admin@example.com",
            "roles": ["admin"]
        },
        "analyst": {
            "id": "analyst_001",
            "name": "John Analyst",
            "email": "john.analyst@example.com",
            "roles": ["analyst"]
        },
        "viewer": {
            "id": "viewer_001",
            "name": "Jane Viewer",
            "email": "jane.viewer@example.com",
            "roles": ["viewer"]
        },
        "operator": {
            "id": "operator_001",
            "name": "Bob Operator",
            "email": "bob.operator@example.com",
            "roles": ["operator"]
        },
        "engineer": {
            "id": "engineer_001",
            "name": "Alice Engineer",
            "email": "alice.engineer@example.com",
            "roles": ["data_engineer"]
        }
    }

    # Parse authorization header (dummy implementation)
    # In production: authorization would be "Bearer <token>"
    if authorization and authorization.startswith("Bearer "):
        token = authorization.replace("Bearer ", "")
        # Mock: use token as user key
        user = mock_users.get(token, mock_users["admin"])
    else:
        # Default to admin for demo purposes
        user = mock_users["admin"]

    return user

@router.get("/me", response_model=UserResponse)
async def get_current_user(authorization: Optional[str] = Header(None)) -> UserResponse:
    """
    Get current authenticated user with their permissions.

    In production, this would authenticate via:
    - JWT token in Authorization header
    - Session cookie
    - OAuth token
    - etc.

    For demo purposes, you can pass 'Bearer <user_key>' in Authorization header
    where user_key is one of: admin, analyst, viewer, operator, engineer
    """
    user_data = get_current_user_from_header(authorization)
    # print(user_data)
    permissions = get_permissions_for_roles(user_data["roles"])
    permissions= ['*']
    return UserResponse(
        id=user_data["id"],
        name=user_data["name"],
        email=user_data["email"],
        roles=user_data["roles"],
        permissions=permissions
    )

@router.get("/roles")
async def get_available_roles() -> Dict[str, Any]:
    """Get all available roles and their permissions"""
    return load_role_permissions()
