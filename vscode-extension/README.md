# TestFly MCP — AI Browser Automation & Codegen

**TestFly MCP** brings real-browser automation and framework-native test code generation to **GitHub Copilot**, **Claude Code**, **Cursor**, and other AI coding assistants using the **Model Context Protocol (MCP)**.

With **88 specialized tools**, zero ChromeDriver setup, an **Interactive Web Studio**, and a dedicated **VS Code Activity Bar Panel**, your AI assistant can drive real web browsers, observe live DOM & accessibility trees, and emit 100% compliant, compile-ready **TestFly Java (TestNG / JUnit 5 / Cucumber)** test suites.

---

## ✈️ Key Capabilities

- 🤖 **Zero-Driver Browser Automation:** Automated WebDriver lifecycle via Selenium Manager — no manual ChromeDriver downloads or PATH setups.
- 🎯 **Accessibility-First & Smart Locators:** AI drives the page using `getByRole`, `getByLabel`, `getByTestId`, `find(...)`, and self-healing selectors.
- 🛡️ **Web-First Auto-Waiting Assertions:** Passing browser checks (`assert_element_visible`, `assert_text`, `assert_title`) become fluent `assertThat(...)` assertions in generated code.
- ☕ **TestFly Framework-Native Codegen:** Generates production-ready Page Objects (`BasePage`), TestNG tests (`BaseTest`), JUnit 5 tests (`BaseJUnit5Test`), and Cucumber steps (`BaseCucumberSteps`).
- 🏗️ **Project Scaffolding (`testfly init`):** Instant creation of complete TestFly automation projects (Web, API, Hybrid) directly from VS Code.
- ⚡ **Smart CI/CD Sharder (`testfly shard`):** Cuts pipeline execution time by balancing test loads across parallel CI nodes using LPT (Longest Processing Time) Bin-Packing.
- 🎨 **Interactive Web Studio (`testfly studio`):** A zero-dependency local web dashboard on `http://127.0.0.1:8765` to visually explore tools and manage `testfly.yml`.
- 🗂️ **VS Code Activity Bar Sidebar:** Dedicated left sidebar panel with Quick Actions, Live Environment Status, and an interactive 88-Tools Explorer.

---

## 🚀 Quick Start

### 1. Install `testfly-mcp` Python Package & CLI

Install locally from source in editable mode (recommended):

```bash
# Using uv (fastest):
uv tool install -e /path/to/testfly-mcp

# Or using pip:
pip install git+https://github.com/hakanngul/testfly-mcp.git
```

Verify the installation:
```bash
testfly --version
# Output: testfly 1.0.0
```

### 2. Open TestFly in the VS Code Sidebar

Click the **TestFly (✈️)** icon in the VS Code Activity Bar (left menu) to access:
1. **Quick Actions:** Launch Web Studio, scaffold projects, balance CI shards, run environment diagnostics.
2. **Environment & Status:** Check Python, TestFly CLI, Chrome, and current project configurations.
3. **MCP Tools Explorer:** Browse all 88 available MCP tools with descriptions and schemas.

### 3. Start Automating in AI Chat

In **GitHub Copilot Chat** (Agent mode) or **Claude Code**:

```
Navigate to https://example.com, verify the main heading is visible, and generate a TestFly Page Object and TestNG test.
```

The AI assistant will:
1. Open Chrome and navigate to the live URL.
2. Observe real DOM elements and run web-first assertions.
3. Generate valid TestFly Java code that compiles as-is:

```java
package com.example.tests;

import io.testfly.test.BaseTest;
import org.testng.annotations.Test;

public class LandingPageTest extends BaseTest {

    @Test(description = "Verify landing page loads and main heading is visible")
    public void testLandingPageHeading() {
        open("/");
        assertThat(find("h1")).isVisible();
    }
}
```

---

## 🛠️ VS Code Commands (`Ctrl+Shift+P` / `Cmd+Shift+P`)

| Command | Description |
|---|---|
| `TestFly MCP: Open Actions Menu` | Opens the QuickPick action menu with all options |
| `TestFly MCP: Launch Interactive Web Studio` | Starts the visual dashboard at `http://127.0.0.1:8765` |
| `TestFly MCP: Scaffold New Project` | Interactive wizard to generate TestNG / JUnit 5 / Cucumber test suites |
| `TestFly MCP: Run CI Test Sharder` | Partitions test suite across parallel CI nodes using LPT Bin-Packing |
| `TestFly MCP: Check Installation & Diagnostics` | Runs environment doctor checks (Python, Selenium, Chrome, Claude) |
| `TestFly MCP: Initialize testfly.yml Config` | Generates a standard `testfly.yml` file in the workspace root |
| `TestFly MCP: Register with AI Assistants` | Configures Claude Code and Copilot MCP server registrations |
| `TestFly MCP: Refresh Status` | Refreshes the sidebar environment status tree |
| `TestFly MCP: Open Documentation` | Opens the official documentation |

---

## 📦 88 Registered MCP Tools Overview

- **Browser (22 tools):** `start_browser`, `close_browser`, `navigate_to`, `take_screenshot`, `get_page_source`, `execute_script`, `go_back`, `go_forward`, `refresh_page`, `set_window_size`, `get_title`, `get_current_url`, `new_tab`, `switch_tab`, `close_tab`, `get_cookies`, `set_cookie`, `delete_cookie`, `delete_all_cookies`, `get_console_logs`, `emulate_device`.
- **Elements (26 tools):** `click`, `type_text`, `get_text`, `get_attribute`, `select_option`, `hover`, `double_click`, `right_click`, `drag_and_drop`, `is_displayed`, `is_enabled`, `wait_for_element`, `scroll_to_element`, `clear_field`, `fill_form`, `send_keys`, `upload_file`, `find_shadow_element`, `switch_to_frame`, `switch_to_default_content`, `get_table_data`, `accept_alert`, `dismiss_alert`, `get_alert_text`, `type_in_alert`, `get_healed_locators`, `clear_healed_locators`.
- **Assertions (8 tools):** `assert_title`, `assert_url`, `assert_text`, `assert_element_visible`, `assert_element_not_visible`, `assert_attribute`, `assert_page_contains`, `assert_element_count`.
- **Codegen (16 tools):** `detect_testfly`, `generate_java_page_object`, `generate_java_testng`, `generate_java_junit5`, `generate_gherkin`, `generate_testfly_config`, `generate_testfly_pom`, `generate_python_test`, `generate_csharp_nunit`, `generate_github_actions`, `generate_jenkins_pipeline`, `generate_gitlab_ci`, `generate_playwright_hints`, `get_session_log`, `clear_session_log`.

---

## 🔗 Useful Links

- [TestFly Framework GitHub](https://github.com/hakanngul/testfly)
- [TestFly MCP GitHub](https://github.com/hakanngul/testfly-mcp)
- [Issues & Support](https://github.com/hakanngul/testfly-mcp/issues)
