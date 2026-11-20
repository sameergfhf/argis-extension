"""
app/database.py — SQLAlchemy async engine and session management.
"""
from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=False,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


class Base(DeclarativeBase):
    pass


async def init_db() -> None:
    """Create all tables if they do not exist and ensure columns exist."""
    from app.models import scan, finding  # noqa: F401 — ensure models are imported
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Check and add user_id / user_email columns if missing (SQLite backward-compatibility)
        from sqlalchemy import text
        try:
            result = await conn.execute(text("PRAGMA table_info(scans)"))
            existing_cols = {row[1] for row in result.fetchall()}
            if "user_id" not in existing_cols:
                await conn.execute(text("ALTER TABLE scans ADD COLUMN user_id VARCHAR(64)"))
            if "user_email" not in existing_cols:
                await conn.execute(text("ALTER TABLE scans ADD COLUMN user_email VARCHAR(255)"))
            if "workspace_id" not in existing_cols:
                await conn.execute(text("ALTER TABLE scans ADD COLUMN workspace_id VARCHAR(36)"))
        except Exception:
            pass



async def get_db():
    """FastAPI dependency — yield a database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()
