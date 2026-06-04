from __future__ import annotations

import re
from dataclasses import dataclass


@dataclass(frozen=True)
class NormalizedModel:
    id: str
    name: str
    provider: str
    capabilities: tuple[str, ...]
    context_window: int | None = None
    supports_vision: bool = False
    supports_tools: bool = False
    supports_streaming: bool = True

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "provider": self.provider,
            "capabilities": list(self.capabilities),
            "contextWindow": self.context_window,
            "supportsVision": self.supports_vision,
            "supportsTools": self.supports_tools,
            "supportsStreaming": self.supports_streaming,
        }


def display_model_name(model_id):
    value = str(model_id or "").strip()
    leaf = value.rsplit("/", 1)[-1]

    if leaf.lower().startswith("gpt-"):
        suffix = " ".join(part.capitalize() for part in leaf[4:].split("-"))
        return f"GPT-{suffix}"

    words = re.sub(r"[-_]+", " ", leaf).split()
    display = []

    for word in words:
        lower = word.lower()
        if lower in {"gpt", "ai", "r1", "vl", "llm", "tts"} or any(char.isdigit() for char in word):
            display.append(word.upper() if lower in {"gpt", "ai", "vl", "llm", "tts"} else word)
        else:
            display.append(word.capitalize())

    return " ".join(display) or value


def infer_capabilities(model_id):
    model = str(model_id or "").lower()
    capabilities = []

    is_embedding = any(marker in model for marker in ("embed", "embedding"))
    is_audio = any(marker in model for marker in ("audio", "whisper", "tts", "speech"))
    is_image_generation = any(marker in model for marker in ("dall-e", "imagen", "image-generation", "flux"))
    is_rerank = "rerank" in model

    if not (is_embedding or is_audio or is_image_generation or is_rerank):
        capabilities.append("text")

    if is_embedding:
        capabilities.append("embeddings")
    if is_audio:
        capabilities.append("audio")
    if is_image_generation:
        capabilities.append("image_generation")

    vision_markers = (
        "vision", "gpt-4o", "gpt-4.1", "gpt-5", "o3", "o4", "claude-3",
        "claude-4", "gemini", "grok-4", "pixtral", "llava", "qwen-vl",
    )
    if any(marker in model for marker in vision_markers):
        capabilities.append("vision")

    reasoning_markers = (
        "reasoning", "deepseek-r1", "/r1", "o1", "o3", "o4", "gpt-5",
        "claude-sonnet-4", "claude-opus-4", "gemini-2.5", "grok-4",
    )
    if any(marker in model for marker in reasoning_markers):
        capabilities.append("reasoning")

    if "text" in capabilities:
        capabilities.extend(["tools", "streaming"])

    if "gemini" in model:
        capabilities.append("code_execution")

    return tuple(dict.fromkeys(capabilities))


def normalize_model(raw_model, provider):
    if isinstance(raw_model, str):
        model_id = raw_model
        name = ""
        context_window = None
    else:
        raw_model = raw_model if isinstance(raw_model, dict) else {}
        model_id = raw_model.get("id") or raw_model.get("name") or raw_model.get("model") or ""
        name = raw_model.get("display_name") or raw_model.get("displayName") or ""
        context_window = (
            raw_model.get("context_window")
            or raw_model.get("contextWindow")
            or raw_model.get("context_length")
            or raw_model.get("inputTokenLimit")
        )

    model_id = str(model_id or "").strip()
    if model_id.startswith("models/"):
        model_id = model_id.removeprefix("models/")

    try:
        context_window = int(context_window) if context_window else None
    except (TypeError, ValueError):
        context_window = None

    capabilities = infer_capabilities(model_id)
    return NormalizedModel(
        id=model_id,
        name=str(name or display_model_name(model_id)),
        provider=provider,
        capabilities=capabilities,
        context_window=context_window,
        supports_vision="vision" in capabilities,
        supports_tools="tools" in capabilities,
        supports_streaming="streaming" in capabilities,
    )


def normalize_models(raw_models, provider, limit=500):
    models = []
    seen = set()

    for raw_model in raw_models or []:
        model = normalize_model(raw_model, provider)

        if not model.id or model.id in seen:
            continue

        seen.add(model.id)
        models.append(model)

        if len(models) >= limit:
            break

    return models


def choose_default_model(models):
    chat_models = [
        model for model in models
        if "text" in model.capabilities and not any(
            capability in model.capabilities
            for capability in ("embeddings", "image_generation", "audio")
        )
    ]
    return (chat_models or models)[0].id if (chat_models or models) else ""
