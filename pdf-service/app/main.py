from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.routers.pdf_router import router as pdf_router

app = FastAPI(
    title="Dimension Ballooning PDF Microservice",
    description="PyMuPDF powered microservice for text extraction, coordinate mapping, and final marked-up PDF generation.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(pdf_router)

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "pdf-microservice"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8001, reload=True)
