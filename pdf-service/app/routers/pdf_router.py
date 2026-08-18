from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
import os
import shutil
import tempfile
from app.services.pdf_extractor import extract_text_at_coordinate, get_pdf_metadata
from app.services.pdf_markup import generate_marked_up_pdf

router = APIRouter(prefix="/api/pdf", tags=["PDF Processing"])

class ExtractTextRequest(BaseModel):
    filePath: str
    pageNumber: int = 1
    normX: float
    normY: float

class BalloonMarkupItem(BaseModel):
    pageNumber: int = 1
    x: float
    y: float
    balloonNumber: int
    status: str = "PENDING"
    leaderStartX: Optional[float] = None
    leaderStartY: Optional[float] = None

class MarkupPDFRequest(BaseModel):
    inputPdfPath: str
    outputPdfPath: str
    balloons: List[BalloonMarkupItem]

@router.post("/extract-text")
def extract_text(req: ExtractTextRequest):
    if not os.path.exists(req.filePath):
        raise HTTPException(status_code=404, detail=f"PDF file not found at {req.filePath}")
    
    result = extract_text_at_coordinate(req.filePath, req.pageNumber, req.normX, req.normY)
    return result

@router.post("/generate-markup")
def generate_markup(req: MarkupPDFRequest):
    if not os.path.exists(req.inputPdfPath):
        raise HTTPException(status_code=404, detail=f"Input PDF file not found at {req.inputPdfPath}")
    
    # Ensure directory for output PDF exists
    os.makedirs(os.path.dirname(os.path.abspath(req.outputPdfPath)), exist_ok=True)
    
    balloons_dict = [b.dict() for b in req.balloons]
    result = generate_marked_up_pdf(req.inputPdfPath, req.outputPdfPath, balloons_dict)
    
    if not result.get("success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Failed to generate marked-up PDF"))
        
    return result

@router.get("/info")
def pdf_info(filePath: str):
    if not os.path.exists(filePath):
        raise HTTPException(status_code=404, detail=f"PDF file not found at {filePath}")
    return get_pdf_metadata(filePath)
