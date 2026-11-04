"""Política de contenido mínima: rechaza prompts que combinen contenido sexual con menores.
Es un primer filtro, NO una moderación completa (ver docs/security.md)."""
from __future__ import annotations

import re
import unicodedata

_MINOR = re.compile(
    r"\b(ni[nñ][oa]s?|menor(es)?( de edad)?|child(ren)?|kid(s)?|minor(s)?|underage|teen(ager)?s?|"
    r"adolescentes?|infantil(es)?|pre-?teen|loli(ta)?s?|shota|colegial(a|as)?|schoolgirl|schoolboy)\b"
)
_SEXUAL = re.compile(
    r"\b(sex(o|ual|ualizad[oa])?|desnud[oa]s?|naked|nude|nudes|er[oó]tic[oa]s?|porn[oó]?(gr[aá]fic[oa])?|"
    r"explicit[oa]s?|nsfw|lasciv[oa]s?|fetich\w*)\b"
)


def _norm(text: str) -> str:
    # minúsculas y sin acentos para que "NIÑA" y "nina" coincidan; la ñ se conserva en el patrón como [nñ]
    t = unicodedata.normalize("NFKD", text.lower())
    t = "".join(c for c in t if not unicodedata.combining(c) or c == "̃")
    return unicodedata.normalize("NFC", t)


def violates_policy(*texts: str) -> bool:
    joined = _norm(" ".join(t for t in texts if t))
    return bool(_MINOR.search(joined)) and bool(_SEXUAL.search(joined))
