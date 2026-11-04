"""Cliente HTTP real (httpx), importado solo al usarlo para que las pruebas no lo necesiten."""
from __future__ import annotations


def make_http():
    import httpx
    return httpx.Client(timeout=30.0)
