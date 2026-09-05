"""
TestFly project detection.

The MCP server is normally launched with its working directory at the user's
project root (VS Code / JetBrains / Claude Code all do this). We walk up from the
working directory looking for the fingerprints of a TestFly project so
codegen can strongly recommend the framework-native, accessibility-first output
instead of raw Selenium.

Detection is best-effort and read-only — it never raises.
"""

import os
import re
from pathlib import Path

_MAX_UP = 6           # how many parent directories to walk up

_TESTFLY_YAML_PATTERNS = ("testfly.yml", "testfly.yaml")
_LEGACY_YAML_PATTERNS = ("selenium-boot.yml", "selenium-boot.yaml")

# POM dependency fingerprints
_TESTFLY_POM_RE = re.compile(
    r"io\.testfly|<artifactId>\s*testfly\s*</artifactId>",
    re.I
)
_LEGACY_POM_RE = re.compile(
    r"io\.github\.seleniumboot|com\.seleniumboot|<artifactId>\s*selenium-boot\s*</artifactId>",
    re.I
)

# Gradle dependency fingerprints
_TESTFLY_GRADLE_RE = re.compile(
    r"io\.testfly\s*[:'\"]\s*testfly",
    re.I
)
_LEGACY_GRADLE_RE = re.compile(
    r"io\.github\.seleniumboot\s*[:'\"]\s*selenium-boot|seleniumboot",
    re.I
)


def _read(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8", errors="ignore")
    except Exception:
        return ""


def _scan_dir(d: Path) -> list[str]:
    """Return a list of evidence strings for TestFly found directly in dir d."""
    evidence = []

    # 1. Root-level YAML configs (testfly.yml, testfly-staging.yml, etc.)
    for f in d.glob("testfly*.yml"):
        if f.is_file():
            evidence.append(f"{f.name} at {d}")
    for f in d.glob("testfly*.yaml"):
        if f.is_file():
            evidence.append(f"{f.name} at {d}")

    # Legacy yaml configs
    for name in _LEGACY_YAML_PATTERNS:
        if (d / name).is_file():
            evidence.append(f"{name} at {d}")

    # 2. Config under src/test/resources or src/main/resources
    for sub in ("src/test/resources", "src/main/resources"):
        sub_path = d / sub
        if sub_path.is_dir():
            for f in sub_path.glob("testfly*.yml"):
                if f.is_file():
                    evidence.append(f"{sub}/{f.name} at {d}")
            for f in sub_path.glob("testfly*.yaml"):
                if f.is_file():
                    evidence.append(f"{sub}/{f.name} at {d}")
            for name in _LEGACY_YAML_PATTERNS:
                p = sub_path / name
                if p.is_file():
                    evidence.append(f"{sub}/{name} at {d}")

    # 3. pom.xml dependency
    pom = d / "pom.xml"
    if pom.is_file():
        content = _read(pom)
        if _TESTFLY_POM_RE.search(content):
            evidence.append(f"TestFly dependency in {pom}")
        elif _LEGACY_POM_RE.search(content):
            evidence.append(f"selenium-boot dependency in {pom}")

    # 4. Gradle builds
    for gname in ("build.gradle", "build.gradle.kts"):
        g = d / gname
        if g.is_file():
            content = _read(g)
            if _TESTFLY_GRADLE_RE.search(content):
                evidence.append(f"TestFly dependency in {g}")
            elif _LEGACY_GRADLE_RE.search(content):
                evidence.append(f"selenium-boot dependency in {g}")

    return evidence


def detect_testfly(start: str | None = None) -> dict:
    """Walk up from `start` (default: cwd) looking for TestFly fingerprints.

    Returns {"detected": bool, "evidence": [str, ...], "root": str|None}.
    """
    try:
        cur = Path(start or os.getcwd()).resolve()
    except Exception:
        return {"detected": False, "evidence": [], "root": None}

    for _ in range(_MAX_UP + 1):
        evidence = _scan_dir(cur)
        if evidence:
            return {"detected": True, "evidence": evidence, "root": str(cur)}
        if cur.parent == cur:
            break
        cur = cur.parent
    return {"detected": False, "evidence": [], "root": None}


# Backward-compatible alias
detect_selenium_boot = detect_testfly


def recommendation_banner(framework_arg: str | None, start: str | None = None) -> str:
    """If a TestFly project is detected but the caller did NOT request the
    testfly flavor, return a prominent banner recommending it. Empty string
    otherwise (so callers can unconditionally prepend it)."""
    if framework_arg in ("testfly", "selenium_boot"):
        return ""
    result = detect_testfly(start)
    if not result["detected"]:
        return ""
    ev = result["evidence"][0] if result["evidence"] else "project markers"
    return (
        "// ⚠️  TestFly detected in this project (" + ev + ").\n"
        "// This is RAW Selenium. Regenerate with framework=\"testfly\" to get the\n"
        "// framework-native test: extends BaseTest/BasePage, framework-managed driver,\n"
        "// accessibility-first locators (getByRole / getByLabel / getByTestId) and\n"
        "// web-first assertThat(...) assertions.\n\n"
    )
