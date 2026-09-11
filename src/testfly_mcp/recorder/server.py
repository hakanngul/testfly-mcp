"""
TestFly Recorder & Inspector Server
Serves the Playwright-style Inspector UI on http://127.0.0.1:8765,
manages live interaction streaming from Chrome, and renders real-time TestFly Java code.
"""

import asyncio
import json
import logging
import queue
import re
import threading
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional

from testfly_mcp.tools.codegen_tools import CodegenTools

log = logging.getLogger(__name__)

RECORDER_DIR = Path(__file__).parent
INSPECTOR_HTML_PATH = RECORDER_DIR / "inspector.html"
INJECTED_JS_PATH = RECORDER_DIR / "injected_recorder.js"


class SessionBrowserMock:
    def __init__(self, session_log: List[Dict[str, Any]]):
        self._session_log = session_log


class RecorderState:
    def __init__(self):
        self.lock = threading.RLock()
        self.events: List[Dict[str, Any]] = []
        self.mode: str = "record"  # 'record' | 'pause' | 'assert_visible' | 'assert_text' | 'assert_enabled' | 'pick_locator'
        self.subscribers: List[queue.Queue] = []
        self.last_codes: Dict[str, str] = {
            "pom": "// Waiting for user interactions in Google Chrome...",
            "testng": "// Waiting for user interactions in Google Chrome...",
            "junit5": "// Waiting for user interactions in Google Chrome...",
            "cucumber": "// Waiting for user interactions in Google Chrome...",
        }

    def subscribe(self) -> queue.Queue:
        q = queue.Queue()
        with self.lock:
            self.subscribers.append(q)
        return q

    def unsubscribe(self, q: queue.Queue):
        with self.lock:
            if q in self.subscribers:
                self.subscribers.remove(q)

    def broadcast(self, data: Dict[str, Any]):
        msg = f"data: {json.dumps(data)}\n\n"
        with self.lock:
            for q in list(self.subscribers):
                try:
                    q.put_nowait(msg)
                except Exception:
                    pass

    def add_event(self, event: Dict[str, Any]):
        broadcast_msg = None
        with self.lock:
            # If an assertion action was recorded while in an assertion mode, auto-revert mode to record
            if event.get("action") in ("assert_visible", "assert_text", "assert_enabled", "assert_disabled"):
                if self.mode in ("assert_visible", "assert_text", "assert_enabled", "assert_disabled"):
                    self.mode = "record"

            # Avoid duplicate consecutive navigate events to same URL
            if event.get("action") == "navigate" and self.events:
                last_ev = self.events[-1]
                if last_ev.get("action") == "navigate" and last_ev.get("url") == event.get("url"):
                    return

            # Coalesce typing into inputs: replace preceding click on same input, or update typing in-place
            if event.get("action") == "type_text" and self.events:
                last_ev = self.events[-1]
                same_target = (
                    (last_ev.get("selector") and last_ev.get("selector") == event.get("selector")) or
                    (last_ev.get("code") and last_ev.get("code") == event.get("code"))
                )
                if same_target:
                    if last_ev.get("action") == "click":
                        # Replace click with type_text (typing already focuses/clicks)
                        self.events[-1] = event
                        self._update_codes_locked()
                        broadcast_msg = {
                            "type": "update_event",
                            "index": len(self.events) - 1,
                            "event": event,
                            "codes": self.last_codes,
                            "mode": self.mode,
                        }
                    elif last_ev.get("action") == "type_text":
                        # Update text in-place
                        last_ev["text"] = event.get("text")
                        self._update_codes_locked()
                        broadcast_msg = {
                            "type": "update_event",
                            "index": len(self.events) - 1,
                            "event": last_ev,
                            "codes": self.last_codes,
                            "mode": self.mode,
                        }
                    else:
                        self.events.append(event)
                        self._update_codes_locked()
                        broadcast_msg = {
                            "type": "new_event",
                            "event": event,
                            "codes": self.last_codes,
                            "mode": self.mode,
                        }
            else:
                self.events.append(event)
                self._update_codes_locked()
                broadcast_msg = {
                    "type": "new_event",
                    "event": event,
                    "codes": self.last_codes,
                    "mode": self.mode,
                }

        if broadcast_msg:
            self.broadcast(broadcast_msg)

    def clear(self):
        with self.lock:
            self.events.clear()
            self.last_codes = {
                "pom": "// Ready to record...",
                "testng": "// Ready to record...",
                "junit5": "// Ready to record...",
                "cucumber": "// Ready to record...",
            }
        self.broadcast({
            "type": "state",
            "events": [],
            "codes": self.last_codes,
            "mode": self.mode,
        })

    def delete_event(self, index: int):
        with self.lock:
            if 0 <= index < len(self.events):
                self.events.pop(index)
                if not self.events:
                    self.last_codes = {
                        "pom": "// Waiting for user interactions in Google Chrome...",
                        "testng": "// Waiting for user interactions in Google Chrome...",
                        "junit5": "// Waiting for user interactions in Google Chrome...",
                        "cucumber": "// Waiting for user interactions in Google Chrome...",
                    }
                else:
                    self._update_codes_locked()
        self.broadcast({
            "type": "state",
            "events": self.events,
            "codes": self.last_codes,
            "mode": self.mode,
        })

    def update_event_text(self, index: int, new_text: Optional[str] = None, exact: Optional[bool] = None):
        with self.lock:
            if 0 <= index < len(self.events):
                ev = self.events[index]
                if new_text is not None:
                    if ev.get("action") == "type_text":
                        ev["text"] = new_text
                    elif ev.get("action") == "assert_text":
                        ev["expected"] = new_text
                if exact is not None and ev.get("action") == "assert_text":
                    ev["exact"] = exact
                self._update_codes_locked()
        self.broadcast({
            "type": "state",
            "events": self.events,
            "codes": self.last_codes,
            "mode": self.mode,
        })

    def set_mode(self, new_mode: str):
        with self.lock:
            self.mode = new_mode
        self.broadcast({
            "type": "state",
            "events": self.events,
            "codes": self.last_codes,
            "mode": self.mode,
        })

    def _update_codes_locked(self):
        """Recomputes TestFly Java codes for all frameworks."""
        if not self.events:
            return

        mock_browser = SessionBrowserMock(self.events)
        codegen = CodegenTools(mock_browser)

        async def generate_all():
            pom = await codegen._generate_java_page_object({
                "framework": "testfly",
                "class_name": "RecordedPage",
                "package_name": "com.example.tests",
            })
            testng = await codegen._generate_java_testng({
                "framework": "testfly",
                "class_name": "RecordedWebTest",
                "package_name": "com.example.tests",
            })
            junit5 = await codegen._generate_java_junit5({
                "framework": "testfly",
                "class_name": "RecordedWebTest",
                "package_name": "com.example.tests",
            })
            cucumber = await codegen._generate_gherkin({
                "framework": "testfly",
                "feature_name": "RecordedFeature",
                "package_name": "com.example.tests",
            })
            return {"pom": pom, "testng": testng, "junit5": junit5, "cucumber": cucumber}

        try:
            self.last_codes = asyncio.run(generate_all())
        except Exception as e:
            log.error(f"Error generating code: {e}")


state = RecorderState()


def fetch_proxied_resource(url: str) -> tuple[int, str, bytes, str]:
    """
    Fetches a remote resource and prepares it for embedding inside the TestFly Studio iframe.
    Returns: (status_code, content_type, content_bytes, final_url)
    """
    import ssl
    import urllib.request
    import urllib.error

    if not (url.startswith("http://") or url.startswith("https://")):
        url = "https://" + url

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,tr;q=0.8",
        }
    )

    try:
        with urllib.request.urlopen(req, context=ctx, timeout=15) as resp:
            content = resp.read()
            c_type = resp.headers.get("Content-Type", "text/html; charset=utf-8")
            status = resp.status
            final_url = resp.geturl()
            return status, c_type, content, final_url
    except urllib.error.HTTPError as e:
        content = e.read()
        c_type = e.headers.get("Content-Type", "text/html; charset=utf-8")
        return e.code, c_type, content, url
    except Exception as e:
        err_html = (
            f"<html><body style='font-family:sans-serif;background:#0f172a;color:#f8fafc;padding:2rem;'>"
            f"<h3>Failed to load URL</h3><p>{url}</p><pre style='color:#ef4444;'>{e}</pre></body></html>"
        )
        return 500, "text/html; charset=utf-8", err_html.encode("utf-8"), url


def inject_recorder_into_html(html_bytes: bytes, target_url: str) -> bytes:
    """Injects base tag, testfly bridge, and injected_recorder.js into HTML content."""
    try:
        html = html_bytes.decode("utf-8", errors="replace")
    except Exception:
        return html_bytes

    base_url = target_url.split("#")[0].split("?")[0]
    if not base_url.endswith("/"):
        if "." in base_url.split("/")[-1]:
            base_url = base_url.rsplit("/", 1)[0] + "/"
        else:
            base_url = base_url + "/"

    bridge_snippet = f"""
    <!-- TestFly Embedded Studio Bridge -->
    <base href="{base_url}">
    <script>
      window.__TESTFLY_SERVER_URL__ = 'http://127.0.0.1:8765';
      window.__TESTFLY_EMBEDDED__ = true;
      window.__TESTFLY_ORIGINAL_URL__ = '{target_url}';
    </script>
    <script src="/injected_recorder.js"></script>
    """

    head_pos = html.lower().find("<head")
    if head_pos != -1:
        close_tag_pos = html.find(">", head_pos)
        if close_tag_pos != -1:
            html = html[:close_tag_pos + 1] + bridge_snippet + html[close_tag_pos + 1:]
        else:
            html = bridge_snippet + html
    else:
        html = bridge_snippet + html

    return html.encode("utf-8")


class InspectorRequestHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # Suppress default noisy access log

    def _set_headers(self, content_type: str = "application/json", status: int = 200):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.end_headers()

    def do_OPTIONS(self):
        self._set_headers()

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path in ("/", "/index.html"):
            self._set_headers("text/html; charset=utf-8")
            if INSPECTOR_HTML_PATH.exists():
                self.wfile.write(INSPECTOR_HTML_PATH.read_bytes())
            else:
                self.wfile.write(b"<h1>Inspector UI not found</h1>")
            return

        if path == "/injected_recorder.js":
            self._set_headers("application/javascript; charset=utf-8")
            if INJECTED_JS_PATH.exists():
                self.wfile.write(INJECTED_JS_PATH.read_bytes())
            else:
                self.wfile.write(b"// Injected script not found")
            return

        if path == "/proxy":
            query = urllib.parse.parse_qs(parsed.query)
            target_url = query.get("url", [""])[0]
            if not target_url:
                self._set_headers("text/html; charset=utf-8")
                self.wfile.write(
                    b"<html><body style='font-family:sans-serif;background:#0f172a;color:#94a3b8;"
                    b"display:flex;align-items:center;justify-content:center;height:100vh;margin:0;'>"
                    b"<h3>Enter a URL in the address bar above to begin testing</h3></body></html>"
                )
                return

            status, c_type, content, final_url = fetch_proxied_resource(target_url)
            if "text/html" in c_type.lower():
                content = inject_recorder_into_html(content, final_url)
                self._set_headers("text/html; charset=utf-8", status=status)
            else:
                self._set_headers(c_type, status=status)
            self.wfile.write(content)
            return

        if path == "/api/mode":
            self._set_headers()
            self.wfile.write(json.dumps({"mode": state.mode}).encode("utf-8"))
            return

        if path == "/api/status":
            self._set_headers()
            data = {
                "status": "running",
                "events_count": len(state.events),
                "mode": state.mode,
            }
            self.wfile.write(json.dumps(data).encode("utf-8"))
            return

        if path == "/api/stream":
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "keep-alive")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Private-Network", "true")
            self.end_headers()

            q = state.subscribe()
            try:
                # Send initial state
                init_data = json.dumps({
                    "type": "state",
                    "events": state.events,
                    "codes": state.last_codes,
                    "mode": state.mode,
                })
                self.wfile.write(f"data: {init_data}\n\n".encode("utf-8"))
                self.wfile.flush()

                # Stream new messages
                while True:
                    msg = q.get(timeout=25.0)
                    self.wfile.write(msg.encode("utf-8"))
                    self.wfile.flush()
            except (queue.Empty, BrokenPipeError, ConnectionResetError):
                pass
            finally:
                state.unsubscribe(q)
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

        if path == "/api/event":
            state.add_event(body)
            self._set_headers()
            self.wfile.write(json.dumps({"success": True}).encode("utf-8"))
            return

        if path == "/api/mode":
            new_mode = body.get("mode", "record")
            state.set_mode(new_mode)
            self._set_headers()
            self.wfile.write(json.dumps({"success": True, "mode": state.mode}).encode("utf-8"))
            return

        if path == "/api/clear":
            state.clear()
            self._set_headers()
            self.wfile.write(json.dumps({"success": True}).encode("utf-8"))
            return

        if path == "/api/event/delete":
            idx = body.get("index")
            if idx is not None:
                try:
                    state.delete_event(int(idx))
                except Exception:
                    pass
            self._set_headers()
            self.wfile.write(json.dumps({"success": True}).encode("utf-8"))
            return

        if path == "/api/event/update":
            idx = body.get("index")
            new_text = body.get("text")
            exact = body.get("exact")
            if idx is not None:
                try:
                    state.update_event_text(int(idx), new_text=new_text, exact=exact)
                except Exception:
                    pass
            self._set_headers()
            self.wfile.write(json.dumps({"success": True}).encode("utf-8"))
            return

        if path == "/api/browser/launch-external":
            target_url = body.get("url", "https://example.com")
            threading.Thread(target=self._launch_external_chrome, args=(target_url,), daemon=True).start()
            self._set_headers()
            self.wfile.write(json.dumps({"success": True, "url": target_url}).encode("utf-8"))
            return

        if path == "/api/save":
            file_path_str = body.get("file_path", "").strip()
            tab = body.get("tab", "pom")
            code = state.last_codes.get(tab, "")

            if not code or code.startswith("// Waiting for user"):
                self._set_headers(status=400)
                self.wfile.write(json.dumps({"success": False, "error": "No recorded code to save"}).encode("utf-8"))
                return

            try:
                # Detect multi-file markers (File: <path>)
                pattern = re.compile(
                    r"(?:(?://|#)\s*=+\s*\n)?(?:(?://|#)\s*)?File:\s*([^\n\r]+)\n(?:(?://|#)\s*=+\s*\n)?",
                    re.MULTILINE
                )
                matches = list(pattern.finditer(code))

                # Determine project root from input path or environment
                p = Path(file_path_str) if file_path_str else Path.cwd()
                if not p.is_absolute():
                    p = (Path.cwd() / p).resolve()
                else:
                    p = p.resolve()

                p_str = str(p)
                project_root = None
                for marker in ("src/test/java", "src/test/resources", "src/test"):
                    if marker in p_str:
                        project_root = Path(p_str.split(marker)[0])
                        break

                if not project_root:
                    if p.is_dir() and (p / "src/test/java").exists():
                        project_root = p
                    elif (Path.cwd() / "src/test/java").exists():
                        project_root = Path.cwd()
                    else:
                        # Check immediate subdirectories (e.g. demo-testfly-mcp)
                        for sub in Path.cwd().iterdir():
                            if sub.is_dir() and (sub / "src/test/java").exists() and not sub.name.startswith("."):
                                project_root = sub
                                break
                        if not project_root:
                            project_root = p if p.is_dir() else p.parent

                saved_files = []

                if len(matches) > 1:
                    # Multi-file output: save each file individually into its proper directory.
                    # NEVER write the merged raw string to a single java file!
                    for i, m in enumerate(matches):
                        rel_path = m.group(1).strip()
                        start_idx = m.end()
                        end_idx = matches[i + 1].start() if i + 1 < len(matches) else len(code)
                        file_content = code[start_idx:end_idx].strip() + "\n"

                        if rel_path.startswith("src/"):
                            sub_dest = project_root / rel_path
                        elif rel_path.endswith(".feature"):
                            sub_dest = project_root / "src/test/resources/features" / Path(rel_path).name
                        elif rel_path.endswith(".java"):
                            if (project_root / "src/test/java").exists() or not (project_root / rel_path).parent.exists():
                                sub_dest = project_root / "src/test/java" / rel_path
                            else:
                                sub_dest = project_root / rel_path
                        else:
                            sub_dest = project_root / rel_path

                        sub_dest.parent.mkdir(parents=True, exist_ok=True)
                        sub_dest.write_text(file_content, encoding="utf-8")
                        saved_files.append(str(sub_dest.resolve()))

                    # Clean up any legacy corrupt merged file (e.g. RecordedPage.java) if it was specified
                    if p.is_file() and p.name in ("RecordedPage.java", "RecordedWebTest.java"):
                        try:
                            old_text = p.read_text(encoding="utf-8")
                            if "File:" in old_text and ("package com.example.pages" in old_text and "package com.example.tests" in old_text):
                                p.unlink(missing_ok=True)
                        except Exception:
                            pass

                    self._set_headers()
                    self.wfile.write(json.dumps({
                        "success": True,
                        "saved_path": saved_files[0] if saved_files else str(project_root),
                        "saved_files": saved_files
                    }).encode("utf-8"))
                else:
                    # Single-file output (e.g. testng, junit5)
                    dest = p
                    if dest.is_dir() or not dest.suffix:
                        test_file_name = "RecordedWebTest.java"
                        if (project_root / "src/test/java").exists():
                            dest = project_root / "src/test/java/com/example/tests" / test_file_name
                        else:
                            dest = dest / test_file_name

                    dest.parent.mkdir(parents=True, exist_ok=True)
                    clean_code = code
                    if len(matches) == 1:
                        clean_code = code[matches[0].end():].strip() + "\n"
                    dest.write_text(clean_code, encoding="utf-8")
                    saved_files.append(str(dest.resolve()))

                    self._set_headers()
                    self.wfile.write(json.dumps({
                        "success": True,
                        "saved_path": str(dest.resolve()),
                        "saved_files": saved_files
                    }).encode("utf-8"))
            except Exception as e:
                self._set_headers(status=500)
                self.wfile.write(json.dumps({"success": False, "error": str(e)}).encode("utf-8"))
            return

        self.send_error(404, "Not Found")

    def _launch_external_chrome(self, url: str):
        """Launches detached Google Chrome with web security disabled for flawless localhost callbacks."""
        try:
            import tempfile
            from selenium import webdriver
            from selenium.webdriver.chrome.options import Options
            opts = Options()
            user_data = tempfile.mkdtemp(prefix="testfly_ext_chrome_")
            opts.add_argument(f"--user-data-dir={user_data}")
            opts.add_argument("--disable-web-security")
            opts.add_argument("--allow-running-insecure-content")
            opts.add_argument("--disable-features=IsolateOrigins,site-per-process,PrivateNetworkAccessSendPreflights,BlockInsecurePrivateNetworkRequests")
            opts.add_argument("--window-size=1200,960")
            driver = webdriver.Chrome(options=opts)
            if INJECTED_JS_PATH.exists():
                driver.execute_cdp_cmd(
                    "Page.addScriptToEvaluateOnNewDocument",
                    {"source": INJECTED_JS_PATH.read_text(encoding="utf-8")}
                )
            driver.get(url)
        except Exception as e:
            log.error(f"Error launching external Chrome: {e}")


class ReusableServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


class RecorderServer:
    def __init__(self, port: int = 8765):
        self.port = port
        self.server: Optional[ThreadingHTTPServer] = None
        self.thread: Optional[threading.Thread] = None

    def start(self):
        start_port = self.port
        bound = False
        for p in range(start_port, start_port + 20):
            try:
                self.server = ReusableServer(("127.0.0.1", p), InspectorRequestHandler)
                self.port = p
                bound = True
                break
            except OSError as e:
                if e.errno == 48:  # Address already in use
                    continue
                raise

        if not bound or not self.server:
            raise OSError(f"Could not bind to any port in range {start_port}-{start_port + 20}")

        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def stop(self):
        if self.server:
            self.server.shutdown()
            self.server.server_close()
