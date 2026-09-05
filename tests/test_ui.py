import json
import socket
import threading
import time
from urllib.request import urlopen, Request
import pytest
from testfly_mcp.ui.server import ThreadingHTTPServer, StudioRequestHandler


@pytest.fixture(scope="module")
def ui_server():
    # Pick a random free port
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()

    httpd = ThreadingHTTPServer(("127.0.0.1", port), StudioRequestHandler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    time.sleep(0.1)

    base_url = f"http://127.0.0.1:{port}"
    yield base_url

    httpd.shutdown()
    httpd.server_close()


def test_ui_index_html(ui_server):
    with urlopen(f"{ui_server}/") as resp:
        assert resp.status == 200
        content = resp.read().decode("utf-8")
        assert "TestFly MCP Studio" in content
        assert "Browser Control Panel" in content
        assert "testfly.yml" in content


def test_ui_api_status(ui_server):
    with urlopen(f"{ui_server}/api/status") as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["status"] == "running"
        assert data["tools_count"] >= 88
        assert "version" in data


def test_ui_api_tools(ui_server):
    with urlopen(f"{ui_server}/api/tools") as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert "tools" in data
        assert len(data["tools"]) >= 88
        tool_names = [t["name"] for t in data["tools"]]
        assert "detect_testfly" in tool_names
        assert "generate_java_page_object" in tool_names


def test_ui_api_doctor(ui_server):
    with urlopen(f"{ui_server}/api/doctor") as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert "status" in data
        assert "checks" in data


def test_ui_save_config(ui_server, tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    req = Request(
        f"{ui_server}/api/save-config",
        data=json.dumps({"yaml": "custom_key: value"}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req) as resp:
        assert resp.status == 200
        data = json.loads(resp.read().decode("utf-8"))
        assert data["success"] is True

    saved_file = tmp_path / "testfly.yml"
    assert saved_file.exists()
    assert saved_file.read_text(encoding="utf-8") == "custom_key: value"
