"""
Video router - Handles all video-related endpoints
"""

import json
from pathlib import Path
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/videos", tags=["videos"])

# Paths
VIDEOS_DIR = Path(__file__).parent.parent / "videos"
VIDEOS_JSON = VIDEOS_DIR / "videos.json"


def load_videos_metadata():
    """Load video metadata from JSON file."""
    if not VIDEOS_JSON.exists():
        return []
    with open(VIDEOS_JSON, "r", encoding="utf-8") as f:
        return json.load(f)


def get_video_path(video_id: str) -> Path:
    """Get the path to a video file by its ID."""
    videos = load_videos_metadata()
    for video in videos:
        if video["id"] == video_id:
            # If video has a match_folder, look for the video there
            if video.get("match_folder"):
                project_root = Path(__file__).parent.parent.parent
                match_path = project_root / video["match_folder"] / video["filename"]
                if match_path.exists():
                    return match_path
            # Fall back to videos directory
            return VIDEOS_DIR / video["filename"]
    return None


def stream_video_range(file_path: Path, start: int, end: int):
    """Generator to stream a specific range of the video file."""
    with open(file_path, "rb") as video:
        video.seek(start)
        remaining = end - start + 1
        chunk_size = 1024 * 1024  # 1MB chunks
        while remaining > 0:
            read_size = min(chunk_size, remaining)
            data = video.read(read_size)
            if not data:
                break
            remaining -= len(data)
            yield data


@router.get("")
async def list_videos():
    """
    List all available videos with their metadata.
    """
    return load_videos_metadata()


@router.get("/{video_id}")
async def stream_video(video_id: str, request: Request):
    """
    Stream a video file with Range request support.
    Enables seeking/scrubbing in the video player.
    """
    video_path = get_video_path(video_id)
    
    if not video_path or not video_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Video '{video_id}' not found"
        )
    
    file_size = video_path.stat().st_size
    range_header = request.headers.get("range")
    
    if range_header:
        # Parse Range header: "bytes=start-end"
        range_value = range_header.strip().lower()
        if range_value.startswith("bytes="):
            range_value = range_value[6:]
        
        parts = range_value.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if parts[1] else file_size - 1
        
        # Clamp values
        end = min(end, file_size - 1)
        content_length = end - start + 1
        
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": "video/mp4",
        }
        
        return StreamingResponse(
            stream_video_range(video_path, start, end),
            status_code=206,
            headers=headers,
            media_type="video/mp4",
        )
    else:
        # No Range header - return full file
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        }
        return StreamingResponse(
            stream_video_range(video_path, 0, file_size - 1),
            headers=headers,
            media_type="video/mp4",
        )


@router.get("/{video_id}/meta")
async def get_video_metadata(video_id: str):
    """
    Get metadata for a specific video.
    """
    videos = load_videos_metadata()
    for video in videos:
        if video["id"] == video_id:
            return video
    
    raise HTTPException(
        status_code=404,
        detail=f"Video '{video_id}' not found"
    )


@router.get("/stream/{file_path:path}")
async def stream_video_file(file_path: str, request: Request, match_id: str = None):
    """
    Stream a video file given its relative path.
    Searches in:
    1. VIDEOS_DIR
    2. PROJECT_ROOT (for match folders)
    
    If match_id is provided, it searches specifically in that match's folder first.
    """
    import os
    
     # Security check: prevent directory traversal
    if ".." in file_path:
        raise HTTPException(status_code=400, detail="Invalid path")
        
    videos_meta = load_videos_metadata()
    found_path = None
    
    # 0. Optimization: If match_id is provided, look there directly
    if match_id:
        for video in videos_meta:
            # Check against video ID or the match folder name itself if we used that as ID
            if video["id"] == match_id or video.get("match_folder", "").endswith(match_id):
                if video.get("match_folder"):
                    possible_path = PROJECT_ROOT / video["match_folder"] / file_path
                    if possible_path.exists():
                        found_path = possible_path
                        break
    
    # 1. Try match search if not found yet (and looks like a clip)
    if not found_path and file_path.startswith("clips/"):
        for video in videos_meta:
            if video.get("match_folder"):
                 possible_match_path = PROJECT_ROOT / video["match_folder"] / file_path
                 if possible_match_path.exists():
                     found_path = possible_match_path
                     break

    # 2. Try directly if it's a full relative path from PROJECT_ROOT
    if not found_path:
        possible_path = PROJECT_ROOT / file_path
        if possible_path.exists() and possible_path.is_file():
            found_path = possible_path
    
    # 3. Try relative to VIDEOS_DIR
    if not found_path:
        possible_path = VIDEOS_DIR / file_path
        if possible_path.exists() and possible_path.is_file():
            found_path = possible_path
    
    if not found_path:
        raise HTTPException(status_code=404, detail=f"Video file '{file_path}' not found")
        
    file_size = found_path.stat().st_size
    range_header = request.headers.get("range")

    if range_header:
        range_value = range_header.strip().lower()
        if range_value.startswith("bytes="):
            range_value = range_value[6:]
        
        parts = range_value.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if parts[1] else file_size - 1
        end = min(end, file_size - 1)
        content_length = end - start + 1
        
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": "video/mp4",
        }
        
        return StreamingResponse(
            stream_video_range(found_path, start, end),
            status_code=206,
            headers=headers,
            media_type="video/mp4",
        )
    else:
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        }
        return StreamingResponse(
            stream_video_range(found_path, 0, file_size - 1),
            headers=headers,
            media_type="video/mp4",
        )


# Base path for match folders (relative to project root)
PROJECT_ROOT = Path(__file__).parent.parent.parent


def get_match_folder(video_id: str) -> Path | None:
    """
    Get the match folder path for a video from its metadata.
    Returns None if video doesn't have clips.
    """
    videos = load_videos_metadata()
    for video in videos:
        if video["id"] == video_id:
            if video.get("has_clips") and video.get("match_folder"):
                return PROJECT_ROOT / video["match_folder"]
    return None



def get_clips_for_video(video_id: str) -> dict:
    """
    Get all clips for a video, grouped by set.
    Returns dict: {set_number: [list of points]}
    """
    match_folder = get_match_folder(video_id)
    if not match_folder:
        return {}
    
    clips_dir = match_folder / "clips"
    if not clips_dir.exists():
        return {}
    
    sets = {}
    for point_dir in sorted(clips_dir.iterdir()):
        if point_dir.is_dir() and point_dir.name.startswith("set_"):
            # Parse set_X_point_Y
            parts = point_dir.name.split("_")
            if len(parts) >= 4:
                set_num = int(parts[1])
                point_num = int(parts[3])
                
                # Check if mp4 exists
                clip_file = point_dir / f"{point_dir.name}.mp4"
                
                # Check for thumbnails (priority order)
                has_thumb = False
                for suffix in ["_crop_carre.jpg", ".jpg"]:
                    if (point_dir / f"{point_dir.name}{suffix}").exists():
                        has_thumb = True
                        break
                
                if clip_file.exists():
                    if set_num not in sets:
                        sets[set_num] = []
                    
                    sets[set_num].append({
                        "id": point_dir.name,
                        "point": point_num,
                        "has_thumbnail": has_thumb
                    })
    
    # Sort points within each set
    for set_num in sets:
        sets[set_num] = sorted(sets[set_num], key=lambda x: x["point"])
    
    return sets


@router.get("/{video_id}/clips")
async def list_clips(video_id: str):
    """
    List all clips for a video, grouped by set.
    """
    clips = get_clips_for_video(video_id)
    return {
        "video_id": video_id,
        "sets": clips,
        "total_clips": sum(len(points) for points in clips.values())
    }


@router.get("/{video_id}/clips/{clip_id}")
async def stream_clip(video_id: str, clip_id: str, request: Request):
    """
    Stream a specific clip.
    """
    match_folder = get_match_folder(video_id)
    if not match_folder:
        raise HTTPException(
            status_code=404,
            detail=f"Video '{video_id}' has no clips"
        )
    
    clip_path = match_folder / "clips" / clip_id / f"{clip_id}.mp4"
    
    if not clip_path.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Clip '{clip_id}' not found"
        )
    
    file_size = clip_path.stat().st_size
    range_header = request.headers.get("range")
    
    if range_header:
        range_value = range_header.strip().lower()
        if range_value.startswith("bytes="):
            range_value = range_value[6:]
        
        parts = range_value.split("-")
        start = int(parts[0]) if parts[0] else 0
        end = int(parts[1]) if parts[1] else file_size - 1
        end = min(end, file_size - 1)
        content_length = end - start + 1
        
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": "video/mp4",
        }
        
        return StreamingResponse(
            stream_video_range(clip_path, start, end),
            status_code=206,
            headers=headers,
            media_type="video/mp4",
        )
    else:
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
        }
        return StreamingResponse(
            stream_video_range(clip_path, 0, file_size - 1),
            headers=headers,
            media_type="video/mp4",
        )


@router.get("/{video_id}/clips/{clip_id}/thumbnail")
async def get_clip_thumbnail(video_id: str, clip_id: str):
    """
    Get thumbnail image for a clip.
    Tries multiple filename formats:
    1. {clip_id}_crop_carre.jpg (Preferred)
    2. {clip_id}.jpg (Standard)
    """
    from fastapi.responses import FileResponse
    
    match_folder = get_match_folder(video_id)
    if not match_folder:
        raise HTTPException(
            status_code=404,
            detail=f"Video '{video_id}' has no clips"
        )
    
    clip_dir = match_folder / "clips" / clip_id
    
    # Try different thumbnail names
    possible_names = [
        f"{clip_id}_crop_carre.jpg",
        f"{clip_id}.jpg"
    ]
    
    for name in possible_names:
        thumb_path = clip_dir / name
        if thumb_path.exists():
            return FileResponse(thumb_path, media_type="image/jpeg")
    
    raise HTTPException(
        status_code=404,
        detail=f"Thumbnail for clip '{clip_id}' not found"
    )


@router.get("/{video_id}/thumbnail")
async def get_video_thumbnail(video_id: str):
    """
    Get the main thumbnail for a video.
    """
    from fastapi.responses import FileResponse
    
    # 1. Look up video metadata
    videos = load_videos_metadata()
    video_meta = next((v for v in videos if v["id"] == video_id), None)
    
    if not video_meta:
        raise HTTPException(status_code=404, detail=f"Video '{video_id}' not found")

    # 2. Check if thumbnail is configured
    thumb_filename = video_meta.get("thumbnail")
    if not thumb_filename:
        # Return default placeholder or 404? 
        # For now 404, frontend handle fallback
        raise HTTPException(status_code=404, detail="No thumbnail configured for this video")

    # 3. Construct path
    # If match_folder is present, look there
    if video_meta.get("match_folder"):
        thumb_path = PROJECT_ROOT / video_meta["match_folder"] / thumb_filename
    else:
        # Otherwise look in videos dir
        thumb_path = VIDEOS_DIR / thumb_filename
    
    if not thumb_path.exists():
        raise HTTPException(status_code=404, detail=f"Thumbnail file not found: {thumb_filename}")
        
    return FileResponse(thumb_path, media_type="image/jpeg")
