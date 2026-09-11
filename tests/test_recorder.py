import json
import pytest
from pathlib import Path
from testfly_mcp.recorder.server import (
    RecorderState,
    RecorderServer,
    INSPECTOR_HTML_PATH,
    INJECTED_JS_PATH,
)


def test_recorder_files_exist():
    assert INSPECTOR_HTML_PATH.exists()
    assert INJECTED_JS_PATH.exists()
    html = INSPECTOR_HTML_PATH.read_text(encoding="utf-8")
    assert "TestFly Studio" in html
    assert "embeddedBrowser" in html
    assert "Playwright" in INJECTED_JS_PATH.read_text(encoding="utf-8") or "TestFly" in INJECTED_JS_PATH.read_text(encoding="utf-8")


def test_inject_recorder_into_html():
    from testfly_mcp.recorder.server import inject_recorder_into_html

    sample_html = b"<!DOCTYPE html><html><head><title>Test</title></head><body><h1>Hello</h1></body></html>"
    injected = inject_recorder_into_html(sample_html, "https://example.com/app/index.html")
    text = injected.decode("utf-8")
    assert "<base href=\"https://example.com/app/\">" in text
    assert "window.__TESTFLY_EMBEDDED__ = true;" in text
    assert "/injected_recorder.js" in text


def test_recorder_state_event_processing():
    state = RecorderState()
    assert state.mode == "record"
    assert len(state.events) == 0

    # Add navigation event
    state.add_event({"action": "navigate", "url": "https://example.com/login"})
    assert len(state.events) == 1
    assert "open(" in state.last_codes["testng"]

    # Add click event
    state.add_event({
        "action": "click",
        "selector": "role=button[name=\"Sign In\"]",
        "code": "getByRole(Role.BUTTON, \"Sign In\")"
    })
    assert len(state.events) == 2
    assert "Sign In" in state.last_codes["testng"]

    # Mode switching
    state.set_mode("assert_visible")
    assert state.mode == "assert_visible"

    # Clear
    state.clear()
    assert len(state.events) == 0
    assert state.last_codes["testng"] == "// Ready to record..."


def test_recorder_server_endpoints(tmp_path):
    import urllib.request

    port = 8799
    server = RecorderServer(port=port)
    server.start()

    try:
        base_url = f"http://127.0.0.1:{port}"

        # 1. GET /
        with urllib.request.urlopen(f"{base_url}/") as resp:
            assert resp.status == 200
            content = resp.read().decode("utf-8")
            assert "TestFly Studio" in content
            assert "embeddedBrowser" in content

        # 2. GET /injected_recorder.js
        with urllib.request.urlopen(f"{base_url}/injected_recorder.js") as resp:
            assert resp.status == 200
            js_content = resp.read().decode("utf-8")
            assert "TESTFLY_RECORDER_INITIALIZED" in js_content

        # 3. GET /proxy with empty URL
        with urllib.request.urlopen(f"{base_url}/proxy") as resp:
            assert resp.status == 200
            content = resp.read().decode("utf-8")
            assert "Enter a URL" in content

        # 4. GET /api/mode
        with urllib.request.urlopen(f"{base_url}/api/mode") as resp:
            assert resp.status == 200
            mode_data = json.loads(resp.read().decode("utf-8"))
            assert "mode" in mode_data

        # 5. POST /api/mode
        req = urllib.request.Request(
            f"{base_url}/api/mode",
            data=json.dumps({"mode": "assert_text"}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            res = json.loads(resp.read().decode("utf-8"))
            assert res["mode"] == "assert_text"

        # 6. POST /api/event
        event_data = {
            "action": "click",
            "selector": "#submit-btn",
            "code": "find(\"#submit-btn\")",
            "target_desc": "#submit-btn"
        }
        req = urllib.request.Request(
            f"{base_url}/api/event",
            data=json.dumps(event_data).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            res = json.loads(resp.read().decode("utf-8"))
            assert res["success"] is True

        # 7. POST /api/save
        save_file = tmp_path / "SavedTest.java"
        req = urllib.request.Request(
            f"{base_url}/api/save",
            data=json.dumps({"file_path": str(save_file), "tab": "testng"}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            res = json.loads(resp.read().decode("utf-8"))
            assert res["success"] is True
            assert save_file.exists()

    finally:
        server.stop()


def test_recorder_type_text_coalescing_and_consecutive_flow():
    """Verify click -> type_text coalescing and subsequent interactions without deadlocks."""
    state = RecorderState()

    # 1. Navigate
    state.add_event({"action": "navigate", "url": "https://www.saucedemo.com/"})
    assert len(state.events) == 1

    # 2. Click username input
    state.add_event({"action": "click", "selector": "username", "code": 'getByTestId("username")'})
    assert len(state.events) == 2

    # 3. Type username (should replace preceding click without deadlock)
    state.add_event({"action": "type_text", "selector": "username", "code": 'getByTestId("username")', "text": "standard_user"})
    assert len(state.events) == 2
    assert state.events[-1]["action"] == "type_text"
    assert state.events[-1]["text"] == "standard_user"

    # 4. Click password input
    state.add_event({"action": "click", "selector": "password", "code": 'getByTestId("password")'})
    assert len(state.events) == 3

    # 5. Type password
    state.add_event({"action": "type_text", "selector": "password", "code": 'getByTestId("password")', "text": "secret_sauce"})
    assert len(state.events) == 3
    assert state.events[-1]["action"] == "type_text"
    assert state.events[-1]["text"] == "secret_sauce"

    # 6. Click login button
    state.add_event({"action": "click", "selector": "login-button", "code": 'getByTestId("login-button")'})
    assert len(state.events) == 4

    # 7. Navigate inventory & add to cart
    state.add_event({"action": "navigate", "url": "https://www.saucedemo.com/inventory.html"})
    state.add_event({"action": "click", "selector": "add-to-cart", "code": 'getByTestId("add-to-cart")'})
    assert len(state.events) == 6

    # 8. Assert enabled & disabled
    state.add_event({"action": "assert_enabled", "selector": "checkout", "code": 'getByTestId("checkout")'})
    state.add_event({"action": "assert_disabled", "selector": "disabled-btn", "code": 'getByTestId("disabled-btn")'})
    assert len(state.events) == 8

    # Verify generated TestNG contains all elements and assertions
    testng_code = state.last_codes["testng"]
    assert 'find("username").type("standard_user")' in testng_code
    assert 'find("password").type("secret_sauce")' in testng_code
    assert 'find("login-button").click()' in testng_code
    assert 'find("add-to-cart").click()' in testng_code
    # 9. Assert text and test dynamic text update
    state.add_event({"action": "assert_text", "selector": "login-button", "code": 'getByTestId("login-button")', "expected": "Login", "exact": True})
    assert len(state.events) == 9
    assert 'assertThat(getByTestId("login-button")).hasText("Login");' in state.last_codes["testng"] or 'assertThat(find("login-button")).hasText("Login");' in state.last_codes["testng"]

    # Test updating expected text dynamically
    state.update_event_text(8, new_text="LOGIN")
    assert 'assertThat(getByTestId("login-button")).hasText("LOGIN");' in state.last_codes["testng"] or 'assertThat(find("login-button")).hasText("LOGIN");' in state.last_codes["testng"]


def test_assertion_mode_auto_reset_and_ui_isolation():
    """Verify that recording an assertion resets mode back to record, and JS excludes UI elements."""
    state = RecorderState()

    # Set mode to assert_text
    state.set_mode("assert_text")
    assert state.mode == "assert_text"

    # Adding an assert_text event should auto-revert mode to record
    state.add_event({
        "action": "assert_text",
        "selector": "login-button",
        "code": 'getByTestId("login-button")',
        "expected": "Login",
        "exact": True
    })
    assert state.mode == "record"

    # Set mode to assert_visible
    state.set_mode("assert_visible")
    state.add_event({
        "action": "assert_visible",
        "selector": "login-button",
        "code": 'getByTestId("login-button")'
    })
    assert state.mode == "record"

    # Check that injected_recorder.js includes UI isolation and return-to-record mechanism
    js = INJECTED_JS_PATH.read_text(encoding="utf-8")
    assert "isTestFlyUI" in js
    assert "switchBackToRecord" in js
    assert "__testfly_modal_backdrop__" in js
    assert "__testfly_assert_text_modal__" in js


@pytest.mark.asyncio
async def test_reserved_keyword_and_commented_file_headers():
    from testfly_mcp.tools.codegen_tools import CodegenTools
    from testfly_mcp.recorder.server import SessionBrowserMock

    # Session with a "continue" button (which is a Java reserved keyword)
    session_log = [
        {"action": "navigate", "url": "https://www.saucedemo.com/checkout-step-one.html"},
        {"action": "click", "selector": "continue", "code": 'getByTestId("continue")', "attrs": {"testid": "continue", "tag": "input"}}
    ]
    browser = SessionBrowserMock(session_log)
    codegen = CodegenTools(browser)

    pom_code = await codegen._generate_java_page_object({
        "framework": "testfly",
        "page_name": "CheckoutPage",
        "package_name": "com.example.tests"
    })

    # 1. Separators and File: headers must be commented
    assert "// ============================================================" in pom_code
    assert "// File: com/example/pages/CheckoutPage.java" in pom_code
    assert "// File: com/example/tests/CheckoutTest.java" in pom_code
    assert not pom_code.startswith("============================================================")

    # 2. "continue" reserved keyword must be sanitized to "continueElement"
    assert "continueElement" in pom_code
    assert "Locator continue =" not in pom_code
    assert "continue.click()" not in pom_code
    assert "clickContinueElement" in pom_code


def test_save_multi_file_pom_splitting(tmp_path):
    import urllib.request

    port = 8801
    server = RecorderServer(port=port)
    server.start()

    try:
        base_url = f"http://127.0.0.1:{port}"

        from testfly_mcp.recorder.server import state

        # Add interactions including reserved keyword
        state.add_event({"action": "navigate", "url": "https://www.saucedemo.com/"})
        state.add_event({"action": "click", "selector": "continue", "code": 'getByTestId("continue")', "attrs": {"testid": "continue"}})

        # Save POM
        save_file = tmp_path / "RecordedPage.java"
        req = urllib.request.Request(
            f"{base_url}/api/save",
            data=json.dumps({"file_path": str(save_file), "tab": "pom"}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST"
        )
        with urllib.request.urlopen(req) as resp:
            assert resp.status == 200
            res = json.loads(resp.read().decode("utf-8"))
            assert res["success"] is True

        assert len(res["saved_files"]) == 2
        page_file = Path(res["saved_files"][0])
        test_file = Path(res["saved_files"][1])
        assert page_file.exists()
        assert test_file.exists()
        assert "HomePage.java" in str(page_file)
        assert "HomeTest.java" in str(test_file)
        page_content = page_file.read_text(encoding="utf-8")
        assert "continueElement" in page_content
        assert "class HomePage extends BasePage" in page_content
        test_content = test_file.read_text(encoding="utf-8")
        assert "clickContinueElement()" in test_content
        assert "class HomeTest extends BaseTest" in test_content
        # Ensure merged file does not exist
        assert not save_file.exists()
    finally:
        server.stop()





