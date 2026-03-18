import asyncio
import os
import logging
from typing import Any, Dict

from arq import create_pool
from arq.connections import RedisSettings
from dotenv import load_dotenv

# Set up logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s %(module)s %(message)s",
)
logger = logging.getLogger("agent-bridge.worker")

# Load environment variables
load_dotenv()

# Parse Redis connection string (e.g., localhost:6379)
REDIS_ADDR = os.getenv("REDIS_ADDR", "localhost:6379")
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD", "")

host, port = REDIS_ADDR.split(":") if ":" in REDIS_ADDR else ("localhost", 6379)

redis_settings = RedisSettings(
    host=host,
    port=int(port),
    password=REDIS_PASSWORD if REDIS_PASSWORD else None,
)

async def test_background_job(ctx: Dict[str, Any], message: str) -> str:
    """A simple test job to verify the Arq worker is functioning."""
    logger.info(f"Executing test job with message: {message}")
    await asyncio.sleep(2)
    logger.info("Test job completed successfully.")
    return f"Processed: {message}"

async def startup(ctx: Dict[str, Any]) -> None:
    """Lifecycle hook: runs when the worker starts."""
    logger.info("Worker is starting up...")
    ctx["redis"] = await create_pool(redis_settings)
    logger.info("Worker startup complete. Connected to Redis.")

async def shutdown(ctx: Dict[str, Any]) -> None:
    """Lifecycle hook: runs when the worker shuts down."""
    logger.info("Worker is shutting down...")
    
# Arq Worker configuration
class WorkerSettings:
    functions = [test_background_job]
    redis_settings = redis_settings
    on_startup = startup
    on_shutdown = shutdown
    max_jobs = 10
    job_timeout = 3600  # Default 1 hour timeout for long-running RAG jobs
