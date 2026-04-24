from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    DATABASE_URL: str = "postgresql://chatapp:chatapp@db:5432/chatapp"
    SECRET_KEY: str = "super-secret-change-in-production-please"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days
    MEDIA_DIR: str = "/app/media"
    MAX_FILE_SIZE: int = 10 * 1024 * 1024  # 10MB

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()
