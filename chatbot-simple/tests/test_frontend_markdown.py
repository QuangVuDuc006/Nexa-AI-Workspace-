import json
import shutil
import subprocess
from pathlib import Path

import pytest


PROJECT_DIR = Path(__file__).resolve().parents[1]


def run_markdown_module(script, tmp_path):
    node = shutil.which("node")

    if not node:
        pytest.skip("node is not available")

    source = PROJECT_DIR / "static" / "js" / "render" / "markdown.js"
    module_path = tmp_path / "markdown.mjs"
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


def test_math_token_detection_ignores_escaped_word_fragments(tmp_path):
    result = run_markdown_module(
        """
        import { findMathToken } from "__MODULE__";
        console.log(JSON.stringify({
          bad: findMathToken("Point process\\\\( ing = \\\\) xu ly"),
          equation: findMathToken("Cong thuc \\\\( x = 1 \\\\)"),
          command: findMathToken("Can bac hai \\\\( \\\\sqrt{x} \\\\)")
        }));
        """,
        tmp_path,
    )

    assert result["bad"] is None
    assert result["equation"]["raw"] == "x = 1"
    assert result["command"]["raw"] == "\\sqrt{x}"
