"""
TestFly Recorder Runner
Orchestrates the Recorder Server, Google Chrome with CDP script injection,
and the Playwright-style Inspector UI.
"""

import os
import shutil
import sys
import tempfile
import time
import urllib.parse
import webbrowser
from pathlib import Path
from typing import Optional

from testfly_mcp.recorder.server import RecorderServer, INJECTED_JS_PATH, state


def start_recorder(
    start_url: Optional[str] = None,
    port: int = 8765,
    open_inspector: bool = True
):
    """
    Launches Google Chrome with injected recorder and the Inspector UI.
    Follows the Playwright companion-window architecture:
    - Native Chrome runs on the left with full 60 FPS and zero CORS/proxy issues.
    - TestFly Studio runs as the live Inspector & Codegen center.
    """
    from selenium import webdriver
    from selenium.webdriver.chrome.options import Options

    url = start_url or "https://example.com"
    if not (url.startswith("http://") or url.startswith("https://")):
        url = f"https://{url}"

    # 1. Start Recorder Server (with automatic port increment if busy)
    server = RecorderServer(port=port)
    server.start()
    actual_port = server.port
    inspector_url = f"http://127.0.0.1:{actual_port}/?target={urllib.parse.quote(url)}"

    print("\n" + "=" * 76)
    print("✈  TestFly Studio (Playwright-Style Companion Recorder & Codegen)")
    print("=" * 76)
    print(f"• Studio URL     : http://127.0.0.1:{actual_port}/")
    print(f"• Target Webpage : {url}")
    if actual_port != port:
        print(f"• Port Fallback  : Port {port} doluydu, otomatik olarak port {actual_port} seçildi.")
    print("-" * 76)
    print("• Google Chrome Companion launched on left with CDP injection.")
    print("• TestFly Studio launched on right with live Steps & Java Codegen.")
    print("• Interactions in Chrome immediately stream into TestFly Studio.")
    print("• Press Ctrl+C in this terminal when finished.")
    print("=" * 76 + "\n")

    user_data_dir = tempfile.mkdtemp(prefix="testfly_recorder_chrome_")

    chrome_opts = Options()
    chrome_opts.add_argument(f"--user-data-dir={user_data_dir}")
    chrome_opts.add_argument("--disable-web-security")
    chrome_opts.add_argument("--allow-running-insecure-content")
    chrome_opts.add_argument("--disable-features=IsolateOrigins,site-per-process,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests")
    chrome_opts.add_argument("--window-position=0,0")
    chrome_opts.add_argument("--window-size=960,1050")
    chrome_opts.add_argument("--no-first-run")
    chrome_opts.add_argument("--no-default-browser-check")

    driver = None
    try:
        driver = webdriver.Chrome(options=chrome_opts)
        if INJECTED_JS_PATH.exists():
            base_script = INJECTED_JS_PATH.read_text(encoding="utf-8")
            script = f"window.__TESTFLY_SERVER_URL__ = 'http://127.0.0.1:{actual_port}';\n" + base_script
            driver.execute_cdp_cmd("Page.addScriptToEvaluateOnNewDocument", {"source": script})
        driver.get(url)
    except Exception as e:
        print(f"[!] Warning: Could not auto-launch Chrome with Selenium: {e}")
        print(f"[*] You can manually open Google Chrome and navigate to: {url}")

    # 2. Open Embedded Studio UI in default browser
    if open_inspector:
        time.sleep(0.4)
        webbrowser.open(inspector_url)

    try:
        while True:
            time.sleep(1)
            if driver:
                try:
                    _ = driver.window_handles
                except Exception:
                    # User closed the Chrome companion window
                    print("\n[i] Google Chrome companion closed.")
                    break
    except KeyboardInterrupt:
        print("\nStopping TestFly Recorder...")
    except Exception as e:
        print(f"\n[!] Error running recorder: {e}", file=sys.stderr)
    finally:
        if driver:
            try:
                driver.quit()
            except Exception:
                pass
        shutil.rmtree(user_data_dir, ignore_errors=True)
        server.stop()
        print("✓ TestFly Recorder stopped.\n")
