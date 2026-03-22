"""FastAPI application entry point."""
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.parse import router as parse_router

app = FastAPI(
    title="PDF Parser Comparison API",
    version="1.0.0",
    description="Compare PDF extraction results from pdfplumber, unstructured, and docling.",
)

# CORS origins are configurable via ALLOWED_ORIGINS env var (comma-separated).
# Defaults to localhost:3000 for local development.
_raw_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000")
allow_origins = [o.strip() for o in _raw_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allow_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(parse_router, prefix="/api")
