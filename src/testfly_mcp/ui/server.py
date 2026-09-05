"""
TestFly MCP Interactive Studio Server
Provides a zero-dependency local web dashboard on http://127.0.0.1:8765
to interact with the browser, test MCP tools, generate TestFly code, and configure testfly.yml.
"""

import asyncio
import base64
import json
import logging
import os
import platform
import shutil
import sys
import threading
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict

from testfly_mcp.constants import DEFAULT_TESTFLY_YML

log = logging.getLogger(__name__)

# Dedicated background thread event loop to run async MCP tool handlers safely
class AsyncToolExecutor:
    def __init__(self):
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run_loop, daemon=True)
        self._thread.start()

    def _run_loop(self):
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()

    def run(self, coro, timeout: float = 60.0):
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result(timeout=timeout)


_executor: AsyncToolExecutor | None = None

def get_executor() -> AsyncToolExecutor:
    global _executor
    if _executor is None:
        _executor = AsyncToolExecutor()
    return _executor


def run_doctor_checks() -> Dict[str, Any]:
    """Run environment health checks for Python, Selenium, Chrome, and IDE configs."""
    results = []

    # 1. Python
    py_ver = platform.python_version()
    py_ok = sys.version_info >= (3, 10)
    results.append({
        "category": "Runtime",
        "name": "Python Version",
        "status": "pass" if py_ok else "fail",
        "details": f"Python {py_ver} ({sys.executable})",
        "hint": "Python >= 3.10 required" if not py_ok else None
    })

    # 2. Selenium
    try:
        import selenium
        results.append({
            "category": "Dependencies",
            "name": "Selenium Package",
            "status": "pass",
            "details": f"Version {getattr(selenium, '__version__', 'Installed')}",
        })
    except ImportError:
        results.append({
            "category": "Dependencies",
            "name": "Selenium Package",
            "status": "fail",
            "details": "Not installed",
            "hint": "Run: pip install selenium"
        })

    # 3. MCP SDK
    try:
        import mcp
        results.append({
            "category": "Dependencies",
            "name": "Model Context Protocol SDK",
            "status": "pass",
            "details": f"Installed ({getattr(mcp, '__version__', '>=2.0.0')})",
        })
    except ImportError:
        results.append({
            "category": "Dependencies",
            "name": "MCP SDK",
            "status": "fail",
            "details": "Not installed",
            "hint": "Run: pip install \"mcp>=2.0.0,<3.0.0\""
        })

    # 4. Google Chrome
    chrome_paths = [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/chromium-browser",
        "/usr/bin/chromium",
        "google-chrome",
        "chrome"
    ]
    found_chrome = None
    for cp in chrome_paths:
        if os.path.exists(cp) or shutil.which(cp):
            found_chrome = cp
            break
    
    results.append({
        "category": "Browser",
        "name": "Google Chrome",
        "status": "pass" if found_chrome else "warn",
        "details": f"Detected at {found_chrome}" if found_chrome else "Not detected in default paths (Selenium Manager will attempt automatic resolution)",
    })

    # 5. Claude Code Config
    claude_settings = Path.home() / ".claude" / "settings.json"
    claude_has_testfly = False
    if claude_settings.exists():
        try:
            data = json.loads(claude_settings.read_text(encoding="utf-8"))
            servers = data.get("mcpServers", {})
            claude_has_testfly = "testfly-mcp" in servers or "seleniumboot-mcp" in servers
        except Exception:
            pass

    results.append({
        "category": "IDE / AI Assistant",
        "name": "Claude Code Registration",
        "status": "pass" if claude_has_testfly else "warn",
        "details": f"Registered in {claude_settings}" if claude_has_testfly else "Not yet registered in ~/.claude/settings.json",
        "hint": "Run: testfly-mcp or use VS Code extension to auto-register"
    })

    # 6. testfly.yml in current directory
    testfly_yml = Path.cwd() / "testfly.yml"
    results.append({
        "category": "Project",
        "name": "testfly.yml in Working Directory",
        "status": "pass" if testfly_yml.exists() else "info",
        "details": f"Found at {testfly_yml}" if testfly_yml.exists() else f"Not found in {Path.cwd()}",
        "hint": "Click 'Initialize testfly.yml' to generate standard config" if not testfly_yml.exists() else None
    })

    all_pass = all(r["status"] in ("pass", "info") for r in results)
    return {
        "status": "healthy" if all_pass else "needs_attention",
        "checks": results
    }


HTML_PAGE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>TestFly MCP Studio</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-primary: #090d16;
      --bg-secondary: #0f172a;
      --bg-card: rgba(30, 41, 59, 0.7);
      --bg-card-hover: rgba(51, 65, 85, 0.8);
      --border-color: rgba(148, 163, 184, 0.15);
      --border-glow: rgba(99, 102, 241, 0.4);
      --accent: #6366f1;
      --accent-hover: #4f46e5;
      --accent-gradient: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);
      --text-primary: #f8fafc;
      --text-secondary: #94a3b8;
      --text-muted: #64748b;
      --success: #10b981;
      --warning: #f59e0b;
      --danger: #ef4444;
      --font-sans: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-primary);
      color: var(--text-primary);
      font-family: var(--font-sans);
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      overflow-x: hidden;
    }

    /* Header */
    header {
      background: rgba(15, 23, 42, 0.85);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid var(--border-color);
      padding: 0.85rem 2rem;
      position: sticky;
      top: 0;
      z-index: 50;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .logo-group {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .logo-badge {
      width: 38px;
      height: 38px;
      border-radius: 10px;
      background: var(--accent-gradient);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 1.15rem;
      color: white;
      box-shadow: 0 4px 15px rgba(99, 102, 241, 0.35);
    }
    .brand-title {
      font-size: 1.15rem;
      font-weight: 700;
      letter-spacing: -0.02em;
    }
    .brand-subtitle {
      font-size: 0.72rem;
      color: var(--text-secondary);
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .nav-tabs {
      display: flex;
      gap: 0.4rem;
      background: rgba(15, 23, 42, 0.6);
      padding: 0.25rem;
      border-radius: 10px;
      border: 1px solid var(--border-color);
    }
    .tab-btn {
      background: transparent;
      border: none;
      color: var(--text-secondary);
      padding: 0.5rem 1rem;
      border-radius: 7px;
      font-size: 0.85rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
    }
    .tab-btn:hover {
      color: var(--text-primary);
      background: rgba(255, 255, 255, 0.05);
    }
    .tab-btn.active {
      color: white;
      background: var(--accent);
      box-shadow: 0 2px 8px rgba(99, 102, 241, 0.35);
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.85rem;
    }
    .status-indicator {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.78rem;
      color: var(--text-secondary);
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      padding: 0.35rem 0.75rem;
      border-radius: 999px;
    }
    .pulse-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--success);
      box-shadow: 0 0 8px var(--success);
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.4; transform: scale(0.85); }
      100% { opacity: 1; transform: scale(1); }
    }

    /* Main Container */
    main {
      flex: 1;
      max-width: 1400px;
      width: 100%;
      margin: 0 auto;
      padding: 2rem;
    }

    .tab-pane {
      display: none;
      animation: fadeIn 0.25s ease-in-out;
    }
    .tab-pane.active {
      display: block;
    }
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(6px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Grid & Cards */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1.5rem;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
      gap: 1.25rem;
    }
    .card {
      background: var(--bg-card);
      backdrop-filter: blur(10px);
      border: 1px solid var(--border-color);
      border-radius: 14px;
      padding: 1.5rem;
      position: relative;
      overflow: hidden;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
    }
    .card-title {
      font-size: 1.1rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .card-desc {
      color: var(--text-secondary);
      font-size: 0.85rem;
      margin-bottom: 1.25rem;
      line-height: 1.5;
    }

    /* Forms & Inputs */
    .form-group {
      margin-bottom: 1rem;
    }
    .form-group label {
      display: block;
      font-size: 0.8rem;
      font-weight: 600;
      color: var(--text-secondary);
      margin-bottom: 0.4rem;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .input-text, .select-box, textarea {
      width: 100%;
      background: rgba(15, 23, 42, 0.8);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      color: var(--text-primary);
      padding: 0.65rem 0.9rem;
      font-size: 0.9rem;
      font-family: inherit;
      transition: all 0.2s;
    }
    .input-text:focus, .select-box:focus, textarea:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.2);
    }
    textarea {
      font-family: var(--font-mono);
      font-size: 0.82rem;
      resize: vertical;
    }

    /* Buttons */
    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      background: var(--accent);
      color: white;
      border: none;
      border-radius: 8px;
      padding: 0.65rem 1.25rem;
      font-size: 0.88rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      box-shadow: 0 4px 12px rgba(99, 102, 241, 0.25);
    }
    .btn:hover {
      background: var(--accent-hover);
      transform: translateY(-1px);
    }
    .btn-secondary {
      background: rgba(51, 65, 85, 0.8);
      color: var(--text-primary);
      box-shadow: none;
    }
    .btn-secondary:hover {
      background: rgba(71, 85, 105, 1);
    }
    .btn-sm {
      padding: 0.4rem 0.75rem;
      font-size: 0.78rem;
    }

    /* Code View */
    .code-container {
      background: #060911;
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 1rem;
      position: relative;
      margin-top: 1rem;
      max-height: 520px;
      overflow: auto;
    }
    pre {
      font-family: var(--font-mono);
      font-size: 0.82rem;
      line-height: 1.6;
      color: #e2e8f0;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .copy-btn {
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;
      z-index: 10;
    }

    /* Screenshot Box */
    .screenshot-viewer {
      width: 100%;
      min-height: 480px;
      max-height: 720px;
      background: #060911;
      border: 1px solid var(--border-color);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--text-muted);
      overflow: auto;
      margin-top: 1rem;
      position: relative;
      padding: 0.75rem;
    }
    .screenshot-viewer img {
      width: 100%;
      height: auto;
      border-radius: 6px;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
      display: block;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    /* Tools Search & Badges */
    .tool-item {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      padding: 1rem;
      transition: all 0.2s;
      cursor: pointer;
    }
    .tool-item:hover {
      border-color: var(--accent);
      background: rgba(30, 41, 59, 0.8);
      transform: translateY(-2px);
    }
    .tool-badge {
      display: inline-block;
      font-size: 0.68rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      border-radius: 999px;
      background: rgba(99, 102, 241, 0.15);
      color: #818cf8;
      margin-bottom: 0.4rem;
      text-transform: uppercase;
    }
    .tool-name {
      font-family: var(--font-mono);
      font-size: 0.88rem;
      font-weight: 600;
      color: #f1f5f9;
      margin-bottom: 0.35rem;
    }
    .tool-desc {
      font-size: 0.78rem;
      color: var(--text-secondary);
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    /* Modal / Drawer for Tool Execution */
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      backdrop-filter: blur(5px);
      z-index: 100;
      align-items: center;
      justify-content: center;
    }
    .modal-overlay.active {
      display: flex;
    }
    .modal-card {
      background: var(--bg-secondary);
      border: 1px solid var(--border-color);
      border-radius: 14px;
      width: 90%;
      max-width: 720px;
      max-height: 85vh;
      overflow-y: auto;
      padding: 1.75rem;
      position: relative;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.5);
    }
    .modal-close {
      position: absolute;
      top: 1rem;
      right: 1rem;
      background: transparent;
      border: none;
      color: var(--text-secondary);
      font-size: 1.5rem;
      cursor: pointer;
    }

    /* Table for Doctor */
    .doctor-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }
    .doctor-table th, .doctor-table td {
      padding: 0.85rem 1rem;
      text-align: left;
      border-bottom: 1px solid var(--border-color);
      font-size: 0.88rem;
    }
    .doctor-table th {
      color: var(--text-muted);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 0.72rem;
      letter-spacing: 0.05em;
    }
    .badge {
      display: inline-block;
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.25rem 0.6rem;
      border-radius: 999px;
    }
    .badge-pass { background: rgba(16, 185, 129, 0.15); color: #34d399; }
    .badge-warn { background: rgba(245, 158, 11, 0.15); color: #fbbf24; }
    .badge-fail { background: rgba(239, 68, 68, 0.15); color: #f87171; }
    .badge-info { background: rgba(59, 130, 246, 0.15); color: #60a5fa; }
  </style>
</head>
<body>

  <header>
    <div class="logo-group">
      <div class="logo-badge">✈</div>
      <div>
        <div class="brand-title">TestFly MCP Studio</div>
        <div class="brand-subtitle">Interactive Testing &amp; Codegen</div>
      </div>
    </div>

    <nav class="nav-tabs">
      <button class="tab-btn active" onclick="switchTab('dashboard')">Dashboard</button>
      <button class="tab-btn" onclick="switchTab('browser')">Browser Playground</button>
      <button class="tab-btn" onclick="switchTab('codegen')">Codegen Studio</button>
      <button class="tab-btn" onclick="switchTab('tools')">Tools Directory</button>
      <button class="tab-btn" onclick="switchTab('config')">testfly.yml</button>
      <button class="tab-btn" onclick="switchTab('doctor')">Doctor</button>
    </nav>

    <div class="header-actions">
      <div class="status-indicator">
        <span class="pulse-dot"></span>
        <span id="headerStatus">MCP Connected</span>
      </div>
      <a href="https://github.com/seleniumboot/selenium-mcp" target="_blank" class="btn btn-secondary btn-sm">GitHub</a>
    </div>
  </header>

  <main>
    <!-- TAB 1: DASHBOARD -->
    <div id="tab-dashboard" class="tab-pane active">
      <div class="grid-3" style="margin-bottom: 1.5rem;">
        <div class="card">
          <div class="card-title">🚀 TestFly MCP Server</div>
          <div class="card-desc">Active model context protocol server exposing real Selenium browser capabilities to AI agents.</div>
          <div style="font-size: 2rem; font-weight: 700; color: var(--accent);" id="dashToolCount">88</div>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">Automated MCP Tools Loaded</div>
        </div>
        <div class="card">
          <div class="card-title">🧩 Framework Target</div>
          <div class="card-desc">Native integration with Java TestFly v1.0.0, Page Object Model, TestNG, JUnit 5, and Cucumber.</div>
          <div style="font-size: 1.1rem; font-weight: 600; color: #38bdf8;">io.testfly.* (v1.0.0)</div>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">Fluent Assertions &amp; a11y Locators</div>
        </div>
        <div class="card">
          <div class="card-title">🩺 Environment Status</div>
          <div class="card-desc">System health across Python, Selenium WebDriver, Google Chrome, and IDE assistants.</div>
          <div style="font-size: 1.1rem; font-weight: 600; color: var(--success);" id="dashHealth">Healthy</div>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 0.25rem;">Ready for automated runs</div>
        </div>
      </div>

      <div class="card">
        <div class="card-title">⚡ Quick Actions</div>
        <div class="card-desc">Frequently used workflows for interactive test creation and setup:</div>
        <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
          <button class="btn" onclick="switchTab('browser')">🌐 Open Live Browser</button>
          <button class="btn" onclick="switchTab('codegen')">⚡ Generate Page Object</button>
          <button class="btn btn-secondary" onclick="switchTab('config')">⚙️ Setup testfly.yml</button>
          <button class="btn btn-secondary" onclick="switchTab('doctor')">🩺 Run Environment Doctor</button>
        </div>
      </div>
    </div>

    <!-- TAB 2: BROWSER PLAYGROUND -->
    <div id="tab-browser" class="tab-pane">
      <div class="grid-2">
        <div class="card">
          <div class="card-title">🌐 Browser Control Panel</div>
          <div class="card-desc">Navigate to any web application, click elements, fill forms, and observe live responses.</div>
          
          <div class="form-group" style="background: rgba(15, 23, 42, 0.5); padding: 0.75rem 1rem; border-radius: 8px; border: 1px solid var(--border-color); margin-bottom: 1rem;">
            <label style="margin-bottom: 0.35rem;">Browser Execution Mode</label>
            <div style="display: flex; gap: 1.5rem; align-items: center;">
              <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; text-transform: none; color: var(--text-primary); font-size: 0.85rem;">
                <input type="radio" name="browserMode" value="headless" checked onchange="onModeChange()">
                <span>🤖 <strong>Headless (Background)</strong> — streams directly to Live Preview (no popup window)</span>
              </label>
              <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer; text-transform: none; color: var(--text-primary); font-size: 0.85rem;">
                <input type="radio" name="browserMode" value="visible" onchange="onModeChange()">
                <span>🖥️ <strong>Visible Window</strong> — opens Chrome desktop window</span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label>Target URL</label>
            <div style="display: flex; gap: 0.5rem;">
              <input type="text" id="browserUrl" class="input-text" value="https://www.saucedemo.com" placeholder="https://...">
              <button class="btn" onclick="navigateBrowser()">Go</button>
            </div>
          </div>

          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1rem;">
            <button class="btn btn-secondary btn-sm" onclick="takeScreenshot()">📸 Refresh Screenshot</button>
            <button class="btn btn-secondary btn-sm" onclick="inspectPageElements()">🔍 Inspect Elements</button>
            <button class="btn btn-secondary btn-sm" onclick="getA11yAudit()">♿ A11y Audit</button>
            <button class="btn btn-secondary btn-sm" onclick="getPageSource()">📄 View HTML Source</button>
            <button class="btn btn-secondary btn-sm" style="color: #f87171;" onclick="closeBrowserSession()">✖ Close Browser</button>
          </div>

          <div class="form-group">
            <label>Interact: Click Element (by text or selector)</label>
            <div style="display: flex; gap: 0.5rem;">
              <input type="text" id="clickTarget" class="input-text" placeholder="e.g. Login or #login-button">
              <button class="btn btn-secondary" onclick="clickElement()">Click</button>
            </div>
          </div>

          <div class="form-group">
            <label>Interact: Type Text</label>
            <div style="display: grid; grid-template-columns: 1fr 1fr auto; gap: 0.5rem;">
              <input type="text" id="typeSelector" class="input-text" placeholder="Selector / placeholder">
              <input type="text" id="typeValue" class="input-text" placeholder="Text value">
              <button class="btn btn-secondary" onclick="typeText()">Type</button>
            </div>
          </div>

          <div id="browserLog" style="font-family: var(--font-mono); font-size: 0.78rem; color: var(--text-secondary); margin-top: 0.5rem;">Ready.</div>
        </div>

        <div class="card">
          <div class="card-title">Live Preview / Output</div>
          <div class="screenshot-viewer" id="screenViewer">
            <span>No screenshot captured yet. Click "Capture Screenshot" or navigate to a URL.</span>
          </div>
          <div class="code-container" style="display:none; max-height: 250px;" id="domViewerContainer">
            <pre id="domViewer"></pre>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 3: CODEGEN STUDIO -->
    <div id="tab-codegen" class="tab-pane">
      <div class="grid-2">
        <div class="card">
          <div class="card-title">⚡ TestFly Codegen Studio</div>
          <div class="card-desc">Transform live browser interactions into production-grade TestFly Java code adhering to best practices.</div>

          <div class="form-group">
            <label>Target Framework / Pattern</label>
            <select id="codegenType" class="select-box" onchange="updateCodegenDefaults()">
              <option value="page_object">TestFly Page Object (BasePage)</option>
              <option value="testng">TestFly TestNG Test (BaseTest)</option>
              <option value="junit5">TestFly JUnit 5 Test (BaseJUnit5Test)</option>
              <option value="cucumber">Cucumber BDD (BaseCucumberSteps + Runner)</option>
            </select>
          </div>

          <div class="form-group">
            <label>Class Name</label>
            <input type="text" id="codegenClass" class="input-text" value="LoginPage">
          </div>

          <div class="form-group">
            <label>Package Name</label>
            <input type="text" id="codegenPackage" class="input-text" value="io.testfly.examples.pages">
          </div>

          <div class="form-group">
            <label>Page URL / Context</label>
            <input type="text" id="codegenUrl" class="input-text" value="https://www.saucedemo.com">
          </div>

          <button class="btn" style="width: 100%; margin-top: 0.5rem;" onclick="generateCode()">✨ Generate TestFly Code</button>
        </div>

        <div class="card">
          <div class="card-title">Generated Java Code</div>
          <div class="card-desc">Zero hand-crafted boilerplate. Auto-waiting locators, PageAssert assertions, and thread-safe driver access.</div>
          <div class="code-container">
            <button class="btn btn-secondary btn-sm copy-btn" onclick="copyCode('generatedCode')">📋 Copy</button>
            <pre id="generatedCode">// Click "Generate TestFly Code" to produce clean Java code...</pre>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 4: TOOLS DIRECTORY -->
    <div id="tab-tools" class="tab-pane">
      <div class="card" style="margin-bottom: 1.5rem;">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
          <div>
            <div class="card-title">🧰 MCP Tools Directory (88 Tools)</div>
            <div class="card-desc" style="margin-bottom: 0;">Explore all tools exposed to AI Assistants. Click any tool to test-execute it.</div>
          </div>
          <div style="width: 300px;">
            <input type="text" id="toolsSearch" class="input-text" placeholder="Search tools..." oninput="filterTools()">
          </div>
        </div>
      </div>

      <div class="grid-3" id="toolsGrid">
        <!-- Dynamically rendered -->
      </div>
    </div>

    <!-- TAB 5: TESTFLY.YML CONFIG -->
    <div id="tab-config" class="tab-pane">
      <div class="grid-2">
        <div class="card">
          <div class="card-title">⚙️ Visual testfly.yml Editor</div>
          <div class="card-desc">Configure framework settings without manually editing YAML.</div>

          <div class="form-group">
            <label>Browser</label>
            <select id="cfgBrowser" class="select-box" onchange="renderYamlPreview()">
              <option value="chrome">Google Chrome</option>
              <option value="firefox">Mozilla Firefox</option>
              <option value="edge">Microsoft Edge</option>
            </select>
          </div>

          <div class="form-group">
            <label>Headless Mode</label>
            <select id="cfgHeadless" class="select-box" onchange="renderYamlPreview()">
              <option value="false">false (Show browser window)</option>
              <option value="true">true (Headless in CI)</option>
            </select>
          </div>

          <div class="form-group">
            <label>Parallel Execution</label>
            <select id="cfgParallel" class="select-box" onchange="renderYamlPreview()">
              <option value="methods">methods (Parallel test methods)</option>
              <option value="classes">classes (Parallel classes)</option>
              <option value="none">none (Sequential)</option>
            </select>
          </div>

          <div class="form-group">
            <label>Thread Count</label>
            <input type="number" id="cfgThreads" class="input-text" value="4" min="1" max="16" oninput="renderYamlPreview()">
          </div>

          <div class="form-group">
            <label>Base URL</label>
            <input type="text" id="cfgBaseUrl" class="input-text" value="https://www.saucedemo.com" oninput="renderYamlPreview()">
          </div>

          <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
            <button class="btn" onclick="saveTestFlyYml()">💾 Save testfly.yml to Project Root</button>
            <button class="btn btn-secondary" onclick="downloadYaml()">⬇ Download</button>
          </div>
        </div>

        <div class="card">
          <div class="card-title">YAML Preview</div>
          <div class="code-container">
            <button class="btn btn-secondary btn-sm copy-btn" onclick="copyCode('yamlPreview')">📋 Copy</button>
            <pre id="yamlPreview"></pre>
          </div>
        </div>
      </div>
    </div>

    <!-- TAB 6: DOCTOR -->
    <div id="tab-doctor" class="tab-pane">
      <div class="card">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
          <div>
            <div class="card-title">🩺 Environment Health Check (Doctor)</div>
            <div class="card-desc" style="margin-bottom: 0;">Comprehensive verification of your test automation prerequisites.</div>
          </div>
          <button class="btn btn-secondary btn-sm" onclick="loadDoctor()">🔄 Re-run Checks</button>
        </div>

        <table class="doctor-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Check</th>
              <th>Status</th>
              <th>Details &amp; Suggestions</th>
            </tr>
          </thead>
          <tbody id="doctorTableBody">
            <!-- Dynamically populated -->
          </tbody>
        </table>
      </div>
    </div>
  </main>

  <!-- MODAL FOR TOOL EXECUTION -->
  <div class="modal-overlay" id="toolModal">
    <div class="modal-card">
      <button class="modal-close" onclick="closeToolModal()">×</button>
      <div class="card-title" id="modalToolName">tool_name</div>
      <div class="card-desc" id="modalToolDesc">Description</div>
      
      <div class="form-group">
        <label>Arguments (JSON)</label>
        <textarea id="modalToolArgs" rows="5" class="input-text">{}</textarea>
      </div>

      <button class="btn" onclick="executeModalTool()">▶ Execute Tool</button>

      <div class="code-container" style="margin-top: 1rem;">
        <pre id="modalToolResult">// Result will appear here...</pre>
      </div>
    </div>
  </div>

  <script>
    let allTools = [];

    function switchTab(tabId) {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      
      const targetBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabId));
      if (targetBtn) targetBtn.classList.add('active');

      const pane = document.getElementById('tab-' + tabId);
      if (pane) pane.classList.add('active');

      if (tabId === 'tools' && allTools.length === 0) loadTools();
      if (tabId === 'doctor') loadDoctor();
      if (tabId === 'config') renderYamlPreview();
    }

    async function apiCall(endpoint, method = 'GET', body = null) {
      const opts = { method, headers: { 'Content-Type': 'application/json' } };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(endpoint, opts);
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || 'Server error (' + res.status + ')');
      }
      return data;
    }

    // Browser Playground state & actions
    let currentBrowserSession = { running: false, headless: true };

    async function ensureBrowserSession() {
      const mode = document.querySelector('input[name="browserMode"]:checked')?.value || 'headless';
      const isHeadless = mode === 'headless';

      if (!currentBrowserSession.running || currentBrowserSession.headless !== isHeadless) {
        if (currentBrowserSession.running) {
          try { await apiCall('/api/call-tool', 'POST', { name: 'close_browser', arguments: {} }); } catch(e){}
        }
        setBrowserLog(`Starting Chrome (${isHeadless ? 'Headless/Silent' : 'Visible Window'})...`);
        await apiCall('/api/call-tool', 'POST', {
          name: 'start_browser',
          arguments: { browser: 'chrome', headless: isHeadless, window_size: '1280x800' }
        });
        currentBrowserSession.running = true;
        currentBrowserSession.headless = isHeadless;
      }
    }

    async function onModeChange() {
      if (currentBrowserSession.running) {
        setBrowserLog('Execution mode changed. Will re-launch browser on next action.');
        currentBrowserSession.running = false;
      }
    }

    function showScreenLoading(msg) {
      document.getElementById('screenViewer').innerHTML = `
        <div style="text-align: center; color: var(--text-secondary);">
          <div class="pulse-dot" style="margin: 0 auto 0.75rem auto; width: 12px; height: 12px;"></div>
          <span>${msg}</span>
        </div>
      `;
    }

    async function navigateBrowser() {
      const url = document.getElementById('browserUrl').value.trim();
      if (!url) return;
      setBrowserLog('Navigating to ' + url + '...');
      showScreenLoading('Loading ' + url + ' and rendering live preview...');
      try {
        await ensureBrowserSession();
        const res = await apiCall('/api/call-tool', 'POST', { name: 'navigate', arguments: { url } });
        setBrowserLog(res.result || 'Navigated.');
        // Allow DOM to settle
        await new Promise(r => setTimeout(r, 600));
        await takeScreenshot();
      } catch (err) {
        setBrowserLog('Navigation error: ' + err.message);
        document.getElementById('screenViewer').innerHTML = `<span style="color: var(--danger);">Failed to navigate: ${err.message}</span>`;
      }
    }

    async function takeScreenshot() {
      setBrowserLog('Capturing live screenshot...');
      try {
        await ensureBrowserSession();
        const res = await apiCall('/api/call-tool', 'POST', { name: 'take_screenshot', arguments: {} });
        if (res.result && res.result.startsWith('screenshot:base64:')) {
          const b64 = res.result.substring('screenshot:base64:'.length);
          document.getElementById('screenViewer').innerHTML = `
            <img src="data:image/png;base64,${b64}" alt="Live Preview" style="width: 100%; height: auto; display: block; border-radius: 6px; box-shadow: 0 4px 20px rgba(0,0,0,0.5);">
          `;
          setBrowserLog('Live preview updated.');
        } else {
          setBrowserLog(res.result || 'Screenshot taken.');
        }
      } catch (err) {
        setBrowserLog('Screenshot error: ' + err.message);
      }
    }

    async function inspectPageElements() {
      setBrowserLog('Inspecting elements on page...');
      try {
        await ensureBrowserSession();
        const res = await apiCall('/api/call-tool', 'POST', { name: 'inspect_page', arguments: {} });
        document.getElementById('domViewerContainer').style.display = 'block';
        document.getElementById('domViewer').textContent = res.result || 'No interactive elements detected.';
        setBrowserLog('Elements inspected.');
      } catch (err) {
        setBrowserLog('Inspect error: ' + err.message);
      }
    }

    async function getA11yAudit() {
      setBrowserLog('Running accessibility audit...');
      try {
        await ensureBrowserSession();
        const res = await apiCall('/api/call-tool', 'POST', { name: 'check_accessibility', arguments: {} });
        document.getElementById('domViewerContainer').style.display = 'block';
        document.getElementById('domViewer').textContent = res.result || 'No accessibility issues reported.';
        setBrowserLog('Accessibility audit complete.');
      } catch (err) {
        setBrowserLog('A11y error: ' + err.message);
      }
    }

    async function getPageSource() {
      setBrowserLog('Fetching DOM source...');
      try {
        await ensureBrowserSession();
        const res = await apiCall('/api/call-tool', 'POST', { name: 'get_page_source', arguments: {} });
        document.getElementById('domViewerContainer').style.display = 'block';
        document.getElementById('domViewer').textContent = (res.result || '').substring(0, 3000) + '... (truncated)';
        setBrowserLog('Page source loaded.');
      } catch (err) {
        setBrowserLog('Error: ' + err.message);
      }
    }

    async function closeBrowserSession() {
      setBrowserLog('Closing browser session...');
      try {
        const res = await apiCall('/api/call-tool', 'POST', { name: 'close_browser', arguments: {} });
        currentBrowserSession.running = false;
        setBrowserLog(res.result || 'Browser closed.');
        document.getElementById('screenViewer').innerHTML = '<span>Browser session closed. Click "Go" to start a new session.</span>';
      } catch (err) {
        setBrowserLog('Error: ' + err.message);
      }
    }

    async function clickElement() {
      const target = document.getElementById('clickTarget').value.trim();
      if (!target) return;
      setBrowserLog('Clicking: ' + target + '...');
      try {
        await ensureBrowserSession();
        const res = await apiCall('/api/call-tool', 'POST', { name: 'click', arguments: { selector: target } });
        setBrowserLog(res.result || 'Clicked.');
        await new Promise(r => setTimeout(r, 400));
        await takeScreenshot();
      } catch (err) {
        setBrowserLog('Click error: ' + err.message);
      }
    }

    async function typeText() {
      const selector = document.getElementById('typeSelector').value.trim();
      const text = document.getElementById('typeValue').value;
      if (!selector) return;
      setBrowserLog('Typing text into ' + selector + '...');
      try {
        await ensureBrowserSession();
        const res = await apiCall('/api/call-tool', 'POST', { name: 'type_text', arguments: { selector, text } });
        setBrowserLog(res.result || 'Typed.');
        await new Promise(r => setTimeout(r, 300));
        await takeScreenshot();
      } catch (err) {
        setBrowserLog('Typing error: ' + err.message);
      }
    }

    function setBrowserLog(msg) {
      document.getElementById('browserLog').textContent = msg;
    }

    // Codegen actions
    function updateCodegenDefaults() {
      const type = document.getElementById('codegenType').value;
      if (type === 'page_object') {
        document.getElementById('codegenClass').value = 'LoginPage';
        document.getElementById('codegenPackage').value = 'io.testfly.examples.pages';
      } else if (type === 'testng') {
        document.getElementById('codegenClass').value = 'SauceDemoLoginTest';
        document.getElementById('codegenPackage').value = 'io.testfly.examples.testng';
      } else if (type === 'junit5') {
        document.getElementById('codegenClass').value = 'SauceDemoLoginJUnitTest';
        document.getElementById('codegenPackage').value = 'io.testfly.examples.junit5';
      } else if (type === 'cucumber') {
        document.getElementById('codegenClass').value = 'SauceDemoSteps';
        document.getElementById('codegenPackage').value = 'io.testfly.examples.cucumber.steps';
      }
    }

    async function generateCode() {
      const type = document.getElementById('codegenType').value;
      const className = document.getElementById('codegenClass').value;
      const packageName = document.getElementById('codegenPackage').value;
      const url = document.getElementById('codegenUrl').value;

      let toolName = 'generate_java_page_object';
      let args = { class_name: className, package_name: packageName, page_url: url, framework: 'testfly' };

      if (type === 'testng') {
        toolName = 'generate_java_testng';
        args = { test_class_name: className, package_name: packageName, framework: 'testfly' };
      } else if (type === 'junit5') {
        toolName = 'generate_java_junit5';
        args = { test_class_name: className, package_name: packageName, framework: 'testfly' };
      } else if (type === 'cucumber') {
        toolName = 'generate_gherkin';
        args = { feature_name: 'SauceDemo Login', step_definitions_class: className, package_name: packageName };
      }

      document.getElementById('generatedCode').textContent = '// Generating code from TestFly MCP...';
      try {
        const res = await apiCall('/api/call-tool', 'POST', { name: toolName, arguments: args });
        document.getElementById('generatedCode').textContent = res.result || '// No code returned';
      } catch (err) {
        document.getElementById('generatedCode').textContent = '// Error: ' + err.message;
      }
    }

    // Tools directory actions
    async function loadTools() {
      const data = await apiCall('/api/tools');
      allTools = data.tools || [];
      renderTools(allTools);
      document.getElementById('dashToolCount').textContent = allTools.length;
    }

    function renderTools(tools) {
      const grid = document.getElementById('toolsGrid');
      grid.innerHTML = tools.map(t => {
        let cat = 'Browser';
        if (t.name.startsWith('generate_')) cat = 'Codegen';
        else if (t.name.startsWith('assert_')) cat = 'Assertion';
        else if (t.name.includes('element') || t.name.includes('click') || t.name.includes('type')) cat = 'Element';

        return `
          <div class="tool-item" onclick="openToolModal('${t.name}')">
            <span class="tool-badge">${cat}</span>
            <div class="tool-name">${t.name}</div>
            <div class="tool-desc">${t.description || 'No description provided.'}</div>
          </div>
        `;
      }).join('');
    }

    function filterTools() {
      const q = document.getElementById('toolsSearch').value.toLowerCase();
      const filtered = allTools.filter(t => t.name.toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q));
      renderTools(filtered);
    }

    function openToolModal(name) {
      const tool = allTools.find(t => t.name === name);
      if (!tool) return;
      document.getElementById('modalToolName').textContent = tool.name;
      document.getElementById('modalToolDesc').textContent = tool.description;
      
      const sampleArgs = {};
      if (tool.inputSchema?.properties) {
        for (const [k, v] of Object.entries(tool.inputSchema.properties)) {
          sampleArgs[k] = v.default !== undefined ? v.default : (v.type === 'string' ? '' : null);
        }
      }
      document.getElementById('modalToolArgs').value = JSON.stringify(sampleArgs, null, 2);
      document.getElementById('modalToolResult').textContent = '// Ready to execute';
      document.getElementById('toolModal').classList.add('active');
    }

    function closeToolModal() {
      document.getElementById('toolModal').classList.remove('active');
    }

    async function executeModalTool() {
      const name = document.getElementById('modalToolName').textContent;
      let args = {};
      try {
        args = JSON.parse(document.getElementById('modalToolArgs').value);
      } catch (e) {
        alert('Invalid JSON in arguments');
        return;
      }
      document.getElementById('modalToolResult').textContent = '// Executing...';
      try {
        const res = await apiCall('/api/call-tool', 'POST', { name, arguments: args });
        document.getElementById('modalToolResult').textContent = res.result || '// Success (empty response)';
      } catch (err) {
        document.getElementById('modalToolResult').textContent = '// Error: ' + err.message;
      }
    }

    // Config YAML
    function renderYamlPreview() {
      const browser = document.getElementById('cfgBrowser').value;
      const headless = document.getElementById('cfgHeadless').value;
      const parallel = document.getElementById('cfgParallel').value;
      const threads = document.getElementById('cfgThreads').value;
      const baseUrl = document.getElementById('cfgBaseUrl').value;

      const yaml = `# TestFly Configuration (Generated by TestFly MCP Studio)
execution:
  mode: local
  baseUrl: ${baseUrl}
  parallel: ${parallel}
  threadCount: ${threads}
  maxActiveSessions: ${threads}

browser:
  name: ${browser}
  headless: ${headless}
  lifecycle: per-test
  captureConsoleErrors: true
  arguments:
    - --start-maximized
    - --disable-notifications

retry:
  enabled: true
  maxAttempts: 2

timeouts:
  explicit: 10
  pageLoad: 30

reporting:
  html:
    enabled: true
    title: TestFly Test Automation Report
`;
      document.getElementById('yamlPreview').textContent = yaml;
    }

    async function saveTestFlyYml() {
      const yaml = document.getElementById('yamlPreview').textContent;
      try {
        const res = await apiCall('/api/save-config', 'POST', { yaml });
        if (res.success) {
          alert('✓ testfly.yml successfully saved to current project directory!');
        } else {
          alert('Failed to save: ' + (res.error || 'Unknown error'));
        }
      } catch (err) {
        alert('Error: ' + err.message);
      }
    }

    function downloadYaml() {
      const yaml = document.getElementById('yamlPreview').textContent;
      const blob = new Blob([yaml], { type: 'text/yaml' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'testfly.yml';
      a.click();
    }

    // Doctor checks
    async function loadDoctor() {
      const tbody = document.getElementById('doctorTableBody');
      tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;">Running diagnostics...</td></tr>';
      try {
        const res = await apiCall('/api/doctor');
        tbody.innerHTML = (res.checks || []).map(c => {
          const badgeClass = c.status === 'pass' ? 'badge-pass' : (c.status === 'fail' ? 'badge-fail' : (c.status === 'warn' ? 'badge-warn' : 'badge-info'));
          return `
            <tr>
              <td><strong>${c.category}</strong></td>
              <td>${c.name}</td>
              <td><span class="badge ${badgeClass}">${c.status.toUpperCase()}</span></td>
              <td>
                <div>${c.details}</div>
                ${c.hint ? `<div style="font-size: 0.75rem; color: #f59e0b; margin-top: 0.2rem;">💡 ${c.hint}</div>` : ''}
              </td>
            </tr>
          `;
        }).join('');
      } catch (err) {
        tbody.innerHTML = `<tr><td colspan="4" style="color:red;">Failed to run checks: ${err.message}</td></tr>`;
      }
    }

    function copyCode(elemId) {
      const text = document.getElementById(elemId).textContent;
      navigator.clipboard.writeText(text).then(() => {
        alert('✓ Copied to clipboard!');
      });
    }

    // Initial loading
    window.addEventListener('DOMContentLoaded', () => {
      loadTools();
      renderYamlPreview();
    });
  </script>
</body>
</html>
"""


class StudioRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Silence default request logging to avoid terminal spam
        pass

    def _set_headers(self, content_type="application/json", status=200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path in ("/", "/index.html"):
            self._set_headers("text/html; charset=utf-8")
            self.wfile.write(HTML_PAGE.encode("utf-8"))
            return

        if path == "/api/status":
            from testfly_mcp.server import ALL_TOOLS, __version__
            data = {
                "version": __version__,
                "tools_count": len(ALL_TOOLS),
                "status": "running",
                "python": sys.version,
                "cwd": str(Path.cwd()),
            }
            self._set_headers()
            self.wfile.write(json.dumps(data).encode("utf-8"))
            return

        if path == "/api/tools":
            from testfly_mcp.server import ALL_TOOLS
            tools_list = [
                {
                    "name": t.name,
                    "description": t.description,
                    "inputSchema": getattr(t, "input_schema", getattr(t, "inputSchema", {})),
                }
                for t in ALL_TOOLS
            ]
            self._set_headers()
            self.wfile.write(json.dumps({"tools": tools_list}).encode("utf-8"))
            return

        if path == "/api/doctor":
            data = run_doctor_checks()
            self._set_headers()
            self.wfile.write(json.dumps(data).encode("utf-8"))
            return

        self.send_error(404, "Not Found")

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_len = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_len).decode("utf-8")
        try:
            body = json.loads(post_data) if post_data else {}
        except Exception:
            body = {}

        if path == "/api/call-tool":
            from testfly_mcp.server import TOOL_HANDLERS
            name = body.get("name")
            arguments = body.get("arguments", {})

            handler = TOOL_HANDLERS.get(name)
            if not handler:
                self._set_headers(status=404)
                self.wfile.write(json.dumps({"error": f"Tool not found: {name}"}).encode("utf-8"))
                return

            try:
                executor = get_executor()
                result = executor.run(handler(arguments), timeout=60.0)
                self._set_headers()
                self.wfile.write(json.dumps({"success": True, "result": result}).encode("utf-8"))
            except Exception as e:
                self._set_headers(status=500)
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        if path == "/api/save-config":
            yaml_content = body.get("yaml", DEFAULT_TESTFLY_YML)
            try:
                target = Path.cwd() / "testfly.yml"
                target.write_text(yaml_content, encoding="utf-8")
                self._set_headers()
                self.wfile.write(json.dumps({"success": True, "path": str(target)}).encode("utf-8"))
            except Exception as e:
                self._set_headers(status=500)
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        self.send_error(404, "Not Found")


def start_ui_server(port: int = 8765, open_browser: bool = True):
    """Starts the TestFly MCP Studio web server and optionally opens it in the browser."""
    server_address = ("127.0.0.1", port)
    httpd = ThreadingHTTPServer(server_address, StudioRequestHandler)
    url = f"http://127.0.0.1:{port}"

    print(f"\n========================================================")
    print(f"✈  TestFly MCP Interactive Studio running at:")
    print(f"   {url}")
    print(f"========================================================\n")
    print("Press Ctrl+C to stop the studio server.\n")

    if open_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping TestFly MCP Studio server...")
    finally:
        httpd.server_close()
