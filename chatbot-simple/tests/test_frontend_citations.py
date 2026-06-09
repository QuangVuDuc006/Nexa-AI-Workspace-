import json
import shutil
import subprocess
from pathlib import Path

import pytest


PROJECT_DIR = Path(__file__).resolve().parents[1]


def run_citation_module(script, tmp_path):
    node = shutil.which("node")

    if not node:
        pytest.skip("node is not available")

    source = PROJECT_DIR / "static" / "js" / "render" / "citations.js"
    module_path = tmp_path / "citations.mjs"
    module_path.write_text(source.read_text(encoding="utf-8"), encoding="utf-8")
    runner = tmp_path / "runner.mjs"
    runner.write_text(script.replace("__MODULE__", module_path.as_uri()), encoding="utf-8")
    result = subprocess.run(
        [node, str(runner)],
        check=True,
        text=True,
        capture_output=True,
    )
    return json.loads(result.stdout)


def test_frontend_citation_renderer_converts_known_marker_to_reference_parts(tmp_path):
    result = run_citation_module(
        """
        import { citationMarkerParts, citationDisplayText, citationTitle } from "__MODULE__";
        const citations = [{
          id: "1",
          citation_id: "1",
          filename: "3-HistogramProcessing.pdf",
          page_number: 3,
          chunk_index: 0,
          section_title: "Histogram Equalization",
          url: "/api/documents/doc-1/content#page=3"
        }];
        const parts = citationMarkerParts("Contrast improves [[cite:1]].", citations);
        console.log(JSON.stringify({
          parts,
          label: citationDisplayText(citations[0]),
          title: citationTitle(citations[0])
        }));
        """,
        tmp_path,
    )

    assert result["parts"][1]["type"] == "citation"
    assert result["parts"][1]["citationId"] == "1"
    assert result["parts"][1]["citation"]["url"] == "/api/documents/doc-1/content#page=3"
    assert result["label"] == "3-HistogramProcessing p.3"
    assert result["title"] == '3-HistogramProcessing.pdf - page 3 - section "Histogram Equalization" - chunk 1'


def test_frontend_citation_renderer_creates_hidden_reference(tmp_path):
    result = run_citation_module(
        """
        import { createCitationReference } from "__MODULE__";
        const reference = createCitationReference({
            id: "2",
            filename: "7-FrequencyFiltering.pdf",
            page_number: 14,
            chunk_index: 1
        }, "2", {
            createElement(tag) {
                return {
                    tagName: tag,
                    className: "",
                    title: "",
                    textContent: "",
                    attributes: {},
                    setAttribute(name, value) {
                        this.attributes[name] = value;
                    }
                };
            }
        });
        console.log(JSON.stringify({
          tagName: reference.tagName,
          className: reference.className,
          textContent: reference.textContent,
          title: reference.title,
          ariaHidden: reference.attributes["aria-hidden"]
        }));
        """,
        tmp_path,
    )

    assert result["tagName"] == "span"
    assert result["className"] == "citation-ref"
    assert result["textContent"] == ""
    assert result["ariaHidden"] == "true"
    assert result["title"] == "7-FrequencyFiltering.pdf - page 14 - chunk 2"


def test_frontend_citation_renderer_handles_source_markers_and_keeps_unknown_as_text(tmp_path):
    result = run_citation_module(
        """
        import { citationMarkerParts } from "__MODULE__";
        console.log(JSON.stringify(citationMarkerParts("Known [[source:1]], unknown [[cite:9]].", [{ id: "1", filename: "a.pdf" }])));
        """,
        tmp_path,
    )

    assert result[1]["type"] == "citation"
    assert result[1]["citationId"] == "1"
    assert {"type": "text", "text": "[[cite:9]]"} in result


def test_frontend_citation_renderer_treats_bare_brackets_as_hidden_citations(tmp_path):
    result = run_citation_module(
        """
        import { citationMarkerParts } from "__MODULE__";
        console.log(JSON.stringify(citationMarkerParts("Known [1], unknown [9].", [{ id: "1", filename: "a.pdf" }])));
        """,
        tmp_path,
    )

    assert result[1]["type"] == "citation"
    assert result[1]["citationId"] == "1"
    assert {"type": "text", "text": "[9]"} in result


def test_frontend_citation_renderer_is_wired_after_markdown_and_skips_math_code():
    chat_js = (PROJECT_DIR / "static" / "chat.js").read_text(encoding="utf-8")
    citations_js = (PROJECT_DIR / "static" / "js" / "render" / "citations.js").read_text(encoding="utf-8")
    streaming_js = (PROJECT_DIR / "static" / "js" / "render" / "streaming.js").read_text(encoding="utf-8")

    assert "renderSanitizedMarkdown(fragment, text)" in chat_js
    assert "replaceCitationMarkers(fragment, options.citations || [])" in chat_js
    assert "code, pre, kbd, samp, .katex, .math-inline, .math-block" in citations_js
    assert 'from "./citations.js"' in streaming_js
    assert "replaceCitationMarkers(state.content, state.citations || [])" in streaming_js
    assert "state.citations = message.citations || []" in streaming_js
    assert "renderKatexMathInElement(content)" in streaming_js
    assert "citations: message.citations || []" in streaming_js
    assert "createCitationReference" in citations_js
    assert "citation-ref" in citations_js
    assert "openCitationSource" not in chat_js
    assert "source-preview-panel" not in chat_js


def test_pending_attachment_client_id_is_not_overwritten_by_empty_server_id():
    chat_js = (PROJECT_DIR / "static" / "chat.js").read_text(encoding="utf-8")

    attachment_push = chat_js.split("pendingAttachments.push({", 1)[1].split("});", 1)[0]
    assert attachment_push.index("...attachment") < attachment_push.index("id: attachment.id || createId")
    assert "if (!attachmentId) {\n            return;\n        }" in chat_js
