"""
AI Assistant Router - Streaming chat endpoint for AI models
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
import logging
import json
import os
import requests
import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/ai", tags=["AI Assistant"])

# Judgment Configuration
JUDGMENT_ENABLED = os.environ.get("JUDGMENT_ENABLED", "true").lower() == "true"
JUDGMENT_MODEL = os.environ.get("JUDGMENT_MODEL", "gpt-4o-mini")  # Use cheaper model for judging
DEFAULT_CRITERIA_TEMPLATE = os.environ.get("DEFAULT_CRITERIA", "technical_accuracy")
JUDGMENT_TIMEOUT = 10  # seconds

# Criteria Templates for LLM-as-Judge
CRITERIA_TEMPLATES = {
    "technical_accuracy": {
        "name": "Technical Accuracy",
        "criteria": [
            "Answer must be technically correct and factual",
            "Code examples must be syntactically valid and follow best practices",
            "No outdated or deprecated practices mentioned",
            "Information aligns with current industry standards"
        ]
    },
    "conciseness": {
        "name": "Conciseness",
        "criteria": [
            "Answer should be brief and to the point",
            "Avoid unnecessary verbosity or repetition",
            "Maximum 200 words unless complexity requires more",
            "Every sentence adds value"
        ]
    },
    "completeness": {
        "name": "Completeness",
        "criteria": [
            "Fully addresses all parts of the user's question",
            "Includes necessary context and explanations",
            "Provides actionable steps or examples where appropriate",
            "No important information is missing"
        ]
    },
    "code_quality": {
        "name": "Code Quality",
        "criteria": [
            "Code follows language-specific best practices and conventions",
            "Includes error handling where appropriate",
            "Code is readable, well-structured, and maintainable",
            "Variable and function names are descriptive"
        ]
    }
}


class Message(BaseModel):
    role: str  # "user", "assistant", or "system"
    content: str


class ChatRequest(BaseModel):
    model: str = Field(default="gpt-4o-mini", description="Model name to use")
    temperature: float = Field(default=0.7, ge=0.0, le=2.0, description="Temperature for response randomness")
    messages: List[Message] = Field(..., description="Conversation messages")
    max_tokens: Optional[int] = Field(default=4096, description="Maximum tokens in response")
    environment: str = Field(default="dev", description="Environment (dev, poc, prod)")
    query_last_response: bool = Field(default=False, description="Whether to query the last response")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "Bearer"
    expires_in: Optional[int] = None


# Token cache
_token_cache: Dict[str, Any] = {
    "token": None,
    "expires_at": 0
}


async def get_access_token() -> str:
    """
    Get access token for AI model API.
    
    This function handles token retrieval and caching.
    Override this based on your authentication mechanism:
    - Azure AD: Use OAuth2 client credentials flow
    - OpenAI: Use API key directly
    - Custom: Implement your token endpoint
    
    Returns:
        str: Access token or API key
    """
    import time
    
    # Check cache first
    if _token_cache["token"] and _token_cache["expires_at"] > time.time():
        return _token_cache["token"]
    
    # Option 1: Use environment variable API key (OpenAI style)
    api_key = os.environ.get("OPENAI_API_KEY")
    if api_key:
        return api_key
    
    # Option 2: Azure AD OAuth2 (if configured)
    azure_tenant_id = os.environ.get("AZURE_TENANT_ID")
    azure_client_id = os.environ.get("AZURE_CLIENT_ID")
    azure_client_secret = os.environ.get("AZURE_CLIENT_SECRET")
    azure_scope = os.environ.get("AZURE_SCOPE", "https://cognitiveservices.azure.com/.default")
    
    if azure_tenant_id and azure_client_id and azure_client_secret:
        token_url = f"https://login.microsoftonline.com/{azure_tenant_id}/oauth2/v2.0/token"

        def _get_azure_token():
            response = requests.post(
                token_url,
                data={
                    "grant_type": "client_credentials",
                    "client_id": azure_client_id,
                    "client_secret": azure_client_secret,
                    "scope": azure_scope
                },
                timeout=30
            )
            return response

        response = await asyncio.to_thread(_get_azure_token)

        if response.status_code == 200:
            token_data = response.json()
            _token_cache["token"] = token_data["access_token"]
            _token_cache["expires_at"] = time.time() + token_data.get("expires_in", 3600) - 60
            return _token_cache["token"]
        else:
            logger.error(f"Failed to get Azure token: {response.text}")
            raise HTTPException(status_code=401, detail="Failed to authenticate with Azure")
    
    # Option 3: Custom token endpoint (if configured)
    custom_token_url = os.environ.get("AI_TOKEN_ENDPOINT")
    custom_token_header = os.environ.get("AI_TOKEN_HEADER", "")  # e.g., "X-API-Key:your-key"
    
    if custom_token_url:
        headers = {}
        if custom_token_header and ":" in custom_token_header:
            key, value = custom_token_header.split(":", 1)
            headers[key.strip()] = value.strip()

        def _get_custom_token():
            response = requests.post(custom_token_url, headers=headers, timeout=30)
            return response

        response = await asyncio.to_thread(_get_custom_token)

        if response.status_code == 200:
            token_data = response.json()
            _token_cache["token"] = token_data.get("access_token", token_data.get("token"))
            _token_cache["expires_at"] = time.time() + token_data.get("expires_in", 3600) - 60
            return _token_cache["token"]
        else:
            logger.error(f"Failed to get token from custom endpoint: {response.text}")
            raise HTTPException(status_code=401, detail="Failed to authenticate")
    
    raise HTTPException(
        status_code=500, 
        detail="No API key or authentication configured. Set OPENAI_API_KEY or configure Azure/custom auth."
    )


def get_api_base_url() -> str:
    """
    Get the API base URL for the AI model.

    Returns:
        str: API base URL
    """
    # Check for Azure OpenAI endpoint
    azure_endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    if azure_endpoint:
        return azure_endpoint.rstrip("/")

    # Check for custom endpoint
    custom_endpoint = os.environ.get("AI_API_ENDPOINT")
    if custom_endpoint:
        return custom_endpoint.rstrip("/")

    # Default to OpenAI
    return "https://api.openai.com/v1"


async def judge_response(
    user_message: str,
    ai_response: str,
    criteria_template: str = DEFAULT_CRITERIA_TEMPLATE,
    model: str = JUDGMENT_MODEL
) -> Optional[Dict[str, Any]]:
    """
    Judge an AI response using LLM-as-judge pattern.

    Args:
        user_message: The user's question
        ai_response: The AI's response to judge
        criteria_template: Template key from CRITERIA_TEMPLATES
        model: Model to use for judging

    Returns:
        Dict with score, reasoning, and passed status, or None if judgment fails
    """
    if not JUDGMENT_ENABLED:
        return None

    if criteria_template not in CRITERIA_TEMPLATES:
        logger.warning(f"Unknown criteria template: {criteria_template}, using default")
        criteria_template = DEFAULT_CRITERIA_TEMPLATE

    criteria = CRITERIA_TEMPLATES[criteria_template]
    criteria_list = "\n".join([f"- {c}" for c in criteria["criteria"]])

    # Construct judge prompt
    judge_prompt = f"""You are an expert evaluator. Judge the following AI response based on these criteria:

{criteria_list}

User's Question:
{user_message}

AI Response to Judge:
{ai_response}

Provide your evaluation in JSON format:
{{
  "score": <0-100>,
  "reasoning": "<brief explanation>",
  "passed": <true if score >= 60, false otherwise>
}}

Be objective and fair. Consider the question's complexity when evaluating."""

    try:
        start_time = asyncio.get_event_loop().time()

        token = await get_access_token()
        base_url = get_api_base_url()
        is_azure = "azure" in base_url.lower() or os.environ.get("AZURE_OPENAI_ENDPOINT")

        if is_azure:
            api_version = os.environ.get("AZURE_API_VERSION", "2024-02-15-preview")
            url = f"{base_url}/openai/deployments/{model}/chat/completions?api-version={api_version}"
            headers = {"api-key": token, "Content-Type": "application/json"}
        else:
            url = f"{base_url}/chat/completions"
            headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        payload = {
            "model": model,
            "messages": [{"role": "user", "content": judge_prompt}],
            "temperature": 0.3,  # Lower temperature for more consistent judging
            "max_tokens": 500
        }

        # Use requests in thread pool
        def _judge_request():
            response = requests.post(url, headers=headers, json=payload, timeout=JUDGMENT_TIMEOUT)
            return response

        response = await asyncio.to_thread(_judge_request)

        if response.status_code != 200:
            logger.error(f"Judge API error: {response.status_code} - {response.text}")
            return None

        result = response.json()
        content = result["choices"][0]["message"]["content"]

        # Parse JSON from response
        # Try to extract JSON from markdown code blocks if present
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()

        judgment = json.loads(content.strip())

        duration_ms = int((asyncio.get_event_loop().time() - start_time) * 1000)

        # Add metadata
        judgment["judge_model"] = model
        judgment["judgment_duration_ms"] = duration_ms

        logger.info(f"Judged response: score={judgment.get('score')}, passed={judgment.get('passed')}")

        return judgment

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse judgment JSON: {str(e)}")
        return None
    except Exception as e:
        logger.error(f"Judgment error: {str(e)}")
        return None


async def stream_chat_response(request: ChatRequest):
    """
    Stream chat response from AI model using Server-Sent Events format.
    Silently judges the response in background if JUDGMENT_ENABLED.
    """
    full_response = ""  # Collect full response for judging
    user_message = ""  # Extract user's last message

    try:
        token = await get_access_token()
        base_url = get_api_base_url()

        # Determine if using Azure OpenAI (different endpoint format)
        is_azure = "azure" in base_url.lower() or os.environ.get("AZURE_OPENAI_ENDPOINT")

        if is_azure:
            # Azure OpenAI uses deployment name as model
            api_version = os.environ.get("AZURE_API_VERSION", "2024-02-15-preview")
            url = f"{base_url}/openai/deployments/{request.model}/chat/completions?api-version={api_version}"
            headers = {
                "api-key": token,
                "Content-Type": "application/json"
            }
        else:
            # Standard OpenAI
            url = f"{base_url}/chat/completions"
            headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/json"
            }

        payload = {
            "model": request.model,
            "messages": [{"role": m.role, "content": m.content} for m in request.messages],
            "temperature": request.temperature,
            "max_tokens": request.max_tokens,
            "stream": True
        }

        # Extract last user message for judging
        for msg in reversed(request.messages):
            if msg.role == "user":
                user_message = msg.content
                break

        logger.info(f"AI Chat request: model={request.model}, temp={request.temperature}, messages={len(request.messages)}, env={request.environment}, query_last={request.query_last_response}")

        # TODO: Implement query_last_response logic here
        # When query_last_response is True, you can add custom logic to query/analyze the last response
        if request.query_last_response:
            logger.info(f"Query last response enabled - custom logic to be implemented")

        # Use requests with streaming in a thread pool
        def _stream_request():
            response = requests.post(url, headers=headers, json=payload, stream=True, timeout=120)
            return response

        response = await asyncio.to_thread(_stream_request)

        if response.status_code != 200:
            error_text = response.text
            logger.error(f"AI API error: {response.status_code} - {error_text}")
            yield f"data: {json.dumps({'error': f'API error: {response.status_code}'})}\n\n"
            return

        # Check if response is SSE streaming or direct JSON
        content_type = response.headers.get("content-type", "")

        if "text/event-stream" in content_type:
            # SSE streaming format (OpenAI style)
            for line in response.iter_lines(decode_unicode=True):
                if line and line.startswith("data: "):
                    data = line[6:]  # Remove "data: " prefix

                    if data == "[DONE]":
                        yield f"data: {json.dumps({'done': True})}\n\n"
                        break

                    try:
                        chunk = json.loads(data)
                        if chunk.get("choices") and len(chunk["choices"]) > 0:
                            choice = chunk["choices"][0]
                            # Handle both OpenAI (delta) and Gemini (message) formats
                            delta = choice.get("delta", {})
                            message = choice.get("message", {})
                            content = delta.get("content", "") or message.get("content", "")
                            if content:
                                full_response += content
                                yield f"data: {json.dumps({'content': content})}\n\n"
                    except json.JSONDecodeError:
                        continue
        else:
            # Non-streaming JSON response (Gemini style)
            try:
                result = response.json()
                if result.get("choices") and len(result["choices"]) > 0:
                    choice = result["choices"][0]
                    message = choice.get("message", {})
                    content = message.get("content", "")
                    if content:
                        full_response = content
                        # Stream the content in chunks to maintain SSE format for frontend
                        chunk_size = 50
                        for i in range(0, len(content), chunk_size):
                            chunk_content = content[i:i + chunk_size]
                            yield f"data: {json.dumps({'content': chunk_content})}\n\n"
                yield f"data: {json.dumps({'done': True})}\n\n"
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse JSON response: {str(e)}")
                yield f"data: {json.dumps({'error': 'Failed to parse response'})}\n\n"

        # Silent judgment in background (fire and forget)
        if JUDGMENT_ENABLED and full_response and user_message:
            asyncio.create_task(
                _silent_judge_and_save(
                    user_message=user_message,
                    ai_response=full_response,
                    model=request.model,
                    temperature=request.temperature,
                    environment=request.environment,
                    query_last_response=request.query_last_response
                )
            )

    except HTTPException as e:
        yield f"data: {json.dumps({'error': e.detail})}\n\n"
    except Exception as e:
        logger.error(f"AI Chat error: {str(e)}")
        yield f"data: {json.dumps({'error': str(e)})}\n\n"


async def _silent_judge_and_save(
    user_message: str,
    ai_response: str,
    model: str,
    temperature: float,
    environment: str = "dev",
    query_last_response: bool = False
):
    """
    Background task to judge response and save to file.
    Runs silently without blocking the main response.
    """
    try:
        from judgment_service import JudgmentService
        import time

        # Judge the response
        judgment = await judge_response(
            user_message=user_message,
            ai_response=ai_response,
            criteria_template=DEFAULT_CRITERIA_TEMPLATE,
            model=JUDGMENT_MODEL
        )

        if judgment:
            # Prepare judgment data
            judgment_data = {
                "judgment_id": f"judgment-{int(time.time())}-{os.urandom(4).hex()}",
                "chat_id": "unknown",  # Chat ID not available in streaming context
                "message_id": "unknown",
                "timestamp": datetime.now().isoformat() + "Z",
                "model_used": model,
                "criteria_template": DEFAULT_CRITERIA_TEMPLATE,
                "criteria_list": CRITERIA_TEMPLATES[DEFAULT_CRITERIA_TEMPLATE]["criteria"],
                "user_message": user_message,
                "ai_response": ai_response,
                "judgment": judgment,
                "metadata": {
                    "temperature": temperature,
                    "response_length": len(ai_response),
                    "user_id": "anonymous",  # Could be enhanced with auth
                    "environment": environment,
                    "query_last_response": query_last_response
                }
            }

            # Save to file
            JudgmentService.save_judgment(judgment_data)
            logger.info(f"Silently judged and saved: score={judgment.get('score')}")

    except Exception as e:
        logger.error(f"Silent judgment failed: {str(e)}")
        # Don't propagate error - this is a background task


@router.post("/chat")
async def chat(request: ChatRequest):
    """
    Stream a chat response from the AI model.
    
    Supports:
    - OpenAI API (default)
    - Azure OpenAI Service
    - Custom endpoints
    
    Configure via environment variables:
    - OPENAI_API_KEY: For standard OpenAI
    - AZURE_OPENAI_ENDPOINT, AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET: For Azure
    - AI_API_ENDPOINT, AI_TOKEN_ENDPOINT: For custom endpoints
    """
    return StreamingResponse(
        stream_chat_response(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )


@router.get("/models")
async def get_available_models():
    """
    Get list of available AI models.
    """
    # Default models - can be extended based on provider
    models = [
        {"id": "gpt-4o-mini", "name": "GPT-4o Mini", "description": "Fast and cost-effective"},
        {"id": "gpt-4o", "name": "GPT-4o", "description": "Most capable model"},
        {"id": "gpt-4-turbo", "name": "GPT-4 Turbo", "description": "Optimized for speed"},
        {"id": "gpt-3.5-turbo", "name": "GPT-3.5 Turbo", "description": "Fast and economical"},
    ]
    
    # Check for Azure deployment names from environment
    azure_deployments = os.environ.get("AZURE_DEPLOYMENTS", "")
    if azure_deployments:
        models = [
            {"id": name.strip(), "name": name.strip(), "description": "Azure deployment"}
            for name in azure_deployments.split(",")
        ]
    
    return {"models": models}


@router.get("/health")
async def health_check():
    """
    Check if AI service is configured and accessible.
    """
    try:
        # Check if any auth is configured
        has_openai_key = bool(os.environ.get("OPENAI_API_KEY"))
        has_azure_config = all([
            os.environ.get("AZURE_TENANT_ID"),
            os.environ.get("AZURE_CLIENT_ID"),
            os.environ.get("AZURE_CLIENT_SECRET")
        ])
        has_custom_config = bool(os.environ.get("AI_API_ENDPOINT"))
        
        configured = has_openai_key or has_azure_config or has_custom_config
        
        return {
            "status": "healthy" if configured else "not_configured",
            "providers": {
                "openai": has_openai_key,
                "azure": has_azure_config,
                "custom": has_custom_config
            }
        }
    except Exception as e:
        return {"status": "error", "error": str(e)}
