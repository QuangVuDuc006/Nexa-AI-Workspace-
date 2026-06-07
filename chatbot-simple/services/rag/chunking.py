from __future__ import annotations

import re


DEFAULT_CHUNK_SIZE_CHARS = 1500
DEFAULT_CHUNK_OVERLAP_CHARS = 250
MAX_SOURCE_EXCERPT_CHARS = 300
MARKDOWN_HEADING_RE = re.compile(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$")


def normalize_pages(text_or_pages):
    if isinstance(text_or_pages, list):
        pages = text_or_pages
    else:
        pages = [{"content": str(text_or_pages or ""), "page_number": None}]

    normalized = []

    for page in pages:
        if isinstance(page, dict):
            content = str(page.get("content") or "")
            page_number = page.get("page_number")
        else:
            content = str(page or "")
            page_number = None

        content = content.replace("\x00", "")

        if content.strip():
            normalized.append({"content": content, "page_number": page_number})

    return normalized


def clean_section_title(value):
    value = re.sub(r"\s+", " ", str(value or "")).strip(" :-#\t")
    return value[:240] or None


def looks_like_heading(line):
    stripped = str(line or "").strip()

    if not stripped or len(stripped) > 120:
        return False

    markdown = MARKDOWN_HEADING_RE.match(stripped)
    if markdown:
        return True

    if stripped[-1:] in {".", ",", ";", "!", "?"}:
        return False

    words = stripped.split()
    if not 1 <= len(words) <= 12:
        return False

    letters = [character for character in stripped if character.isalpha()]

    if not letters:
        return False

    uppercase_ratio = sum(character.isupper() for character in letters) / len(letters)
    titlecase_words = sum(word[:1].isupper() for word in words if any(character.isalpha() for character in word))

    return uppercase_ratio >= 0.6 or titlecase_words >= max(1, len(words) - 1) or stripped.endswith(":")


def infer_headings(text):
    headings = []
    cursor = 0

    for line in str(text or "").splitlines(keepends=True):
        raw_line = line.rstrip("\r\n")
        stripped = raw_line.strip()
        title = None
        markdown = MARKDOWN_HEADING_RE.match(stripped)

        if markdown:
            title = clean_section_title(markdown.group(1))
        elif looks_like_heading(stripped):
            title = clean_section_title(stripped)

        if title:
            headings.append({"start": cursor, "end": cursor + len(raw_line), "title": title})

        cursor += len(line)

    return headings


def section_for_range(headings, start, end):
    selected = None

    for heading in headings:
        if heading["start"] <= start:
            selected = heading
            continue

        if selected:
            break

        if start < heading["start"] < end:
            selected = heading
            break

        if heading["start"] > end:
            break

    return selected["title"] if selected else None


def source_excerpt(content):
    compact = re.sub(r"\s+", " ", str(content or "")).strip()

    if len(compact) <= MAX_SOURCE_EXCERPT_CHARS:
        return compact

    return compact[: MAX_SOURCE_EXCERPT_CHARS - 3].rstrip() + "..."


def split_text_window(text, chunk_size, overlap):
    text = str(text or "")

    if not text.strip():
        return []

    if len(text) <= chunk_size:
        start = len(text) - len(text.lstrip())
        end = len(text.rstrip())
        return [{"content": text[start:end], "start_char": start, "end_char": end}]

    chunks = []
    start = 0

    while start < len(text):
        end = min(len(text), start + chunk_size)

        if end < len(text):
            soft_break = max(text.rfind("\n\n", start, end), text.rfind(". ", start, end), text.rfind(" ", start, end))

            if soft_break > start + int(chunk_size * 0.55):
                end = soft_break + (1 if text[soft_break:soft_break + 1] == "." else 0)

        raw_chunk = text[start:end]
        leading_trim = len(raw_chunk) - len(raw_chunk.lstrip())
        trailing_trim = len(raw_chunk.rstrip())
        trimmed_start = start + leading_trim
        trimmed_end = start + trailing_trim
        chunk = text[trimmed_start:trimmed_end]

        if chunk:
            chunks.append({
                "content": chunk,
                "start_char": trimmed_start,
                "end_char": trimmed_end,
            })

        if end >= len(text):
            break

        start = max(end - overlap, start + 1)

    return chunks


def chunk_text(text_or_pages, chunk_size_chars=DEFAULT_CHUNK_SIZE_CHARS, overlap_chars=DEFAULT_CHUNK_OVERLAP_CHARS):
    chunk_size = max(500, int(chunk_size_chars or DEFAULT_CHUNK_SIZE_CHARS))
    overlap = max(0, min(int(overlap_chars or 0), chunk_size // 2))
    chunks = []

    for page in normalize_pages(text_or_pages):
        headings = infer_headings(page["content"])

        for chunk in split_text_window(page["content"], chunk_size, overlap):
            chunks.append({
                "content": chunk["content"],
                "chunk_index": len(chunks),
                "page_number": page["page_number"],
                "section_title": section_for_range(headings, chunk["start_char"], chunk["end_char"]),
                "start_char": chunk["start_char"],
                "end_char": chunk["end_char"],
                "source_excerpt": source_excerpt(chunk["content"]),
            })

    return chunks
