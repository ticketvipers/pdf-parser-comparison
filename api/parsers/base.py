"""Base types shared across all parsers."""
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class PdfPlumberResult:
    status: str  # "ok" | "error"
    duration_ms: Optional[int] = None
    text: Optional[str] = None
    tables: Optional[List[List[List[str]]]] = None
    metadata: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


@dataclass
class UnstructuredResult:
    status: str
    duration_ms: Optional[int] = None
    elements: Optional[List[Dict[str, str]]] = None
    error: Optional[str] = None


@dataclass
class DoclingResult:
    status: str
    duration_ms: Optional[int] = None
    content: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
