"""
Video Streaming Backend - FastAPI
Modular architecture with routers for better code organization.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import videos, search, chat

app = FastAPI(title="Video Streaming API", version="0.3.0")

# CORS configuration for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["GET", "HEAD", "POST", "DELETE"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length"],
)

# Include routers
app.include_router(videos.router)
app.include_router(search.router)
app.include_router(chat.router)


@app.get("/")
async def root():
    """Health check endpoint."""
    return {"status": "ok", "message": "Video Streaming API"}
