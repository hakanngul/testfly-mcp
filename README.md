# testfly-mcp

A Python **Model Context Protocol (MCP)** server for **[TestFly](https://github.com/hakanngul/testfly)** and Selenium WebDriver automation.

Let **Claude**, **GitHub Copilot**, **Cursor**, or **JetBrains AI Assistant** control a real browser — navigate pages, interact with elements, run web-first assertions, and generate production-ready **TestFly (Java / TestNG / JUnit 5 / Cucumber)**, **Python pytest**, and **C# NUnit** test code from recorded sessions.

88 tools. Zero ChromeDriver setup. Built-in **Interactive Web Studio** (`testfly-mcp ui`). Browser auto-starts on first use.

[![Python](https://img.shields.io/badge/python-3.10%2B-blue.svg)](https://www.python.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![GitHub](https://img.shields.io/badge/GitHub-hakanngul%2Ftestfly--mcp-blue?logo=github)](https://github.com/hakanngul/testfly-mcp)
[![MCP Tools](https://img.shields.io/badge/MCP%20Tools-88-brightgreen)](#tools-reference-88-total)
[![IDE Extensions](https://img.shields.io/badge/IDE-VS%20Code%20%2B%20JetBrains-orange)](#ide-extensions-installation)

---

## 📦 Local Installation (From Source)

> ⚠️ **Notice:** `testfly-mcp` is currently distributed directly via its open-source repository and is **not published on public PyPI**. Please install it locally from source using one of the methods below.

### Prerequisites
- **Python 3.10+**
- **Google Chrome** (Selenium Manager automatically resolves and manages ChromeDriver — no manual driver downloads required).

---

### Option 1: Install from Local Clone (Recommended)

Clone the repository and install it in editable mode:

```bash
# 1. Clone the repository
git clone https://github.com/hakanngul/testfly-mcp.git
cd testfly-mcp

# 2. Install dependencies and CLI in editable mode
pip install -e .
```

*Or with `uv` (fastest):*
```bash
uv pip install -e .
```

### Option 2: Install directly via Git

You can install `testfly-mcp` directly into your environment without keeping a separate folder:

```bash
pip install git+https://github.com/hakanngul/testfly-mcp.git
```

---

## 🩺 Verifying Your Installation & CLI Commands

Once installed, the `testfly-mcp` command is available in your terminal. Run the built-in diagnostic and inspection commands:

```bash
# 1. Run system diagnostics (Python, Selenium, Chrome, Claude Desktop detection)
testfly-mcp doctor

# 2. View help and all subcommands
testfly-mcp --help

# 3. List all 88 available MCP tools with descriptions
testfly-mcp tools

# 4. Generate a starter testfly.yml in current directory
testfly-mcp init-config
```

### Available CLI Subcommands

| Command | Description |
|---|---|
| `testfly-mcp` / `testfly-mcp stdio` | Runs the standard MCP server over stdio (used by AI assistants like Claude and Copilot). |
| `testfly-mcp ui` | Launches the zero-dependency **Interactive Web Studio** on `http://127.0.0.1:8765`. |
| `testfly-mcp doctor` | Diagnoses your Python version, Selenium, Chrome binary, and MCP client configs. |
| `testfly-mcp tools` | Lists all 88 registered tools and their functional categories. |
| `testfly-mcp init-config` | Creates a ready-to-use `testfly.yml` file in the current directory. |
| `testfly-mcp interactive` | Starts an interactive terminal shell to execute tools directly. |

---

## 🎨 Interactive Web Studio (`testfly-mcp ui`)

Want to test tools and inspect web pages visually without an AI client?

Launch the built-in, zero-dependency Web Studio:

```bash
testfly-mcp ui
```

Then open **[http://127.0.0.1:8765](http://127.0.0.1:8765)** in your browser.

- 🌐 **Live Browser Playground**: Navigate to URLs, click buttons, fill forms, and test assertions.
- 🖼️ **Live Screenshot Preview**: Runs in Headless mode by default with live screenshots streaming directly to your web UI.
- 📜 **Session Inspector**: Inspect recorded DOM interactions in real-time.
- ⚡ **One-Click Code Generation**: Generate complete TestFly Page Objects, TestNG tests, or Cucumber steps instantly from your recorded session.

---

## 🧩 IDE Extensions Installation

Pre-packaged IDE extensions for VS Code and JetBrains IDEs are bundled in this repository:

### 1. Visual Studio Code (`.vsix`)

- **Artifact path:** `vscode-extension/testfly-mcp-1.0.0.vsix`

**Installation Methods:**
- **Via UI:** Open VS Code -> go to **Extensions** (`Ctrl+Shift+X` or `Cmd+Shift+X`) -> click the `···` menu at the top right -> choose **"Install from VSIX..."** -> select `vscode-extension/testfly-mcp-1.0.0.vsix`.
- **Via CLI:**
  ```bash
  code --install-extension vscode-extension/testfly-mcp-1.0.0.vsix
  ```

### 2. JetBrains IntelliJ IDEA / WebStorm / PyCharm (`.zip`)

- **Artifact path:** `jetbrains-plugin/build/distributions/testfly-mcp-jetbrains-1.0.0.zip`

**Installation Steps:**
1. Open IntelliJ IDEA (or any JetBrains IDE).
2. Go to **Settings / Preferences** (`Ctrl+Alt+S` or `Cmd+,`) -> **Plugins**.
3. Click the ⚙️ **Gear Icon** next to the "Installed" tab.
4. Select **"Install Plugin from Disk..."**.
5. Choose `jetbrains-plugin/build/distributions/testfly-mcp-jetbrains-1.0.0.zip`.
6. Restart the IDE when prompted.

---

## 🤖 AI Client Setup (MCP Configuration)

### 1. VS Code & GitHub Copilot

Add `.vscode/mcp.json` to your project root:

```json
{
  "servers": {
    "testfly": {
      "type": "stdio",
      "command": "testfly-mcp"
    }
  }
}
```

### 2. Claude Code

Add `.mcp.json` to your project root:

```json
{
  "mcpServers": {
    "testfly": {
      "command": "testfly-mcp",
      "args": []
    }
  }
}
```

### 3. Claude Desktop

Edit your Claude Desktop configuration file:
- **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "testfly": {
      "command": "testfly-mcp"
    }
  }
}
```

> **Tip:** If `testfly-mcp` is installed inside a virtual environment (e.g. pyenv, conda, or `.venv`), specify the full path to the executable (e.g., `/Users/username/.pyenv/shims/testfly-mcp` or `C:\\Users\\username\\.venv\\Scripts\\testfly-mcp.exe`). Run `which testfly-mcp` (or `where testfly-mcp` on Windows) to obtain the path.

### 4. Cursor IDE

1. Open **Cursor Settings** (`Cmd+,` / `Ctrl+,`).
2. Navigate to **Features** -> **MCP Servers**.
3. Click **Add New MCP Server**:
   - **Name:** `testfly`
   - **Type:** `command`
   - **Command:** `testfly-mcp`

---

## 🚀 How It Works

Interact naturally with your AI assistant in conversation:

```
1. "Go to https://example.com/login, fill username and password, then click Sign in"
2. "Assert the dashboard heading is visible and url contains '/dashboard'"
3. "Generate a TestFly page object and test class for this flow"
```

The assistant drives the browser, verifies interactions against the live DOM, records actions, and generates clean, framework-native code adhering to the **TestFly v1.0.0 SDK**.

---

## 💡 TestFly Native Codegen Highlights

Generated code for `framework="testfly"` (the default):
- **Driver Lifecycle**: Framework-managed via `BaseTest`, `BasePage`, or `BaseJUnit5Test`. Never creates manual `ChromeDriver` or explicit `setUp()`/`tearDown()` in test code.
- **Accessibility-First Locators**: Standardizes on `getByRole(Role.BUTTON, "...")`, `getByLabel("...")`, `getByTestId("...")`, and `find("...")`.
- **Web-First Assertions**: Emits auto-waiting `assertThat(getDriver()).hasTitle(...)`, `assertThat(getDriver()).hasUrl(...)`, `assertThat(locator).isVisible()`, and `assertThat(locator).hasText(...)`.
- **Configuration & POM**: Instant generation of `testfly.yml` via `generate_testfly_config` and `pom.xml` configured with `io.testfly:testfly` via `generate_testfly_pom`.

### Example: TestFly Page Object (`generate_java_page_object`)

```java
// src/test/java/com/example/pages/LoginPage.java
package com.example.pages;

import io.testfly.test.BasePage;
import io.testfly.locator.Locator;
import io.testfly.locator.Role;
import org.openqa.selenium.WebDriver;

public class LoginPage extends BasePage {

    private final Locator username = getByLabel("Username");
    private final Locator password = getByLabel("Password");
    private final Locator submitButton = getByRole(Role.BUTTON, "Sign in");

    public LoginPage(WebDriver driver) {
        super(driver);
    }

    public LoginPage enterUsername(String text) {
        username.type(text);
        return this;
    }

    public LoginPage enterPassword(String text) {
        password.type(text);
        return this;
    }

    public LoginPage clickSubmitButton() {
        submitButton.click();
        return this;
    }
}
```

```java
// src/test/java/com/example/tests/LoginTest.java
package com.example.tests;

import com.example.pages.LoginPage;
import io.testfly.test.BaseTest;
import org.testng.annotations.Test;

public class LoginTest extends BaseTest {

    @Test
    public void recordedFlowTest() {
        open("/login");
        LoginPage page = new LoginPage(getDriver());
        page.enterUsername("admin");
        page.enterPassword("secret");
        page.clickSubmitButton();
        assertThat(getDriver()).urlContains("/dashboard");
    }
}
```

### Example: TestFly Cucumber / BDD (`generate_gherkin`)

Emits both step definitions extending `BaseCucumberSteps` and the runner extending `BaseCucumberTest`:

```java
// Step Definitions extending BaseCucumberSteps
package com.example.cucumber.steps;

import io.cucumber.java.en.*;
import io.testfly.cucumber.BaseCucumberSteps;
import io.testfly.locator.Locator;
import io.testfly.locator.Role;

public class LoginSteps extends BaseCucumberSteps {

    @Given("I navigate to {string}")
    public void iNavigateTo(String url) {
        getDriver().get(url);
    }

    @And("I enter {string} in the username")
    public void iEnterInUsername(String text) {
        getByLabel("Username").type(text);
    }

    @And("I click the submit button")
    public void iClickTheSubmitButton() {
        getByRole(Role.BUTTON, "Sign in").click();
    }
}
```

```java
// Cucumber Runner extending BaseCucumberTest
package com.example.cucumber;

import io.cucumber.testng.CucumberOptions;
import io.testfly.cucumber.BaseCucumberTest;

@CucumberOptions(
    features = "src/test/resources/features",
    glue = "com.example.cucumber.steps",
    plugin = {
        "pretty",
        "html:target/cucumber-reports/cucumber.html",
        "json:target/cucumber-reports/cucumber.json",
        "io.qameta.allure.cucumber7jvm.AllureCucumber7Jvm"
    }
)
public class RunCucumberTest extends BaseCucumberTest {
}
```

---

## 🛠️ Tools Reference (88 total)

### Browser Control & Inspection (30 tools)
`start_browser`, `navigate`, `take_screenshot`, `get_page_title`, `get_current_url`, `get_page_source`, `execute_script`, `go_back`, `go_forward`, `refresh`, `switch_to_window`, `open_new_tab`, `close_current_tab`, `list_windows`, `close_browser`, `scroll_to_top`, `scroll_to_bottom`, `scroll_by`, `emulate_device`, `get_console_logs`, `get_cookies`, `set_cookie`, `delete_cookie`, `delete_all_cookies`, `get_local_storage`, `set_local_storage`, `get_session_storage`, `set_session_storage`, `wait_for_network_idle`, `inspect_page`, `get_network_logs`, `mock_response`, `clear_mock_responses`, `compare_screenshot`, `check_accessibility`.

### Element Interactions & Forms (27 tools)
`find_element`, `find_elements`, `click`, `type_text`, `get_text`, `get_attribute`, `select_option`, `hover`, `double_click`, `right_click`, `drag_and_drop`, `is_displayed`, `is_enabled`, `wait_for_element`, `scroll_to_element`, `clear_field`, `send_keys`, `upload_file`, `accept_alert`, `dismiss_alert`, `get_alert_text`, `type_in_alert`, `switch_to_frame`, `switch_to_default_content`, `find_shadow_element`, `get_table_data`, `fill_form`, `get_healed_locators`, `clear_healed_locators`.

### Assertions (8 tools)
`assert_title`, `assert_url`, `assert_text`, `assert_element_visible`, `assert_element_not_visible`, `assert_attribute`, `assert_page_contains`, `assert_element_count`.

### Code & Framework Generation (15 tools)
| Tool | Description |
|---|---|
| `detect_testfly` | Scans workspace for `testfly.yml`, `testfly.yaml`, or Maven/Gradle dependencies |
| `generate_testfly_config` | Generates standard `testfly.yml` configuration |
| `generate_testfly_pom` | Generates a complete `pom.xml` configured with TestFly dependencies |
| `generate_java_page_object` | Generates TestFly `BasePage` + `BaseTest` classes |
| `generate_java_testng` | Generates TestNG test class extending `BaseTest` |
| `generate_java_junit5` | Generates JUnit 5 test class extending `BaseJUnit5Test` |
| `generate_gherkin` | Generates Gherkin feature file + `BaseCucumberSteps` + `RunCucumberTest` runner |
| `generate_python_test` | Generates pytest test class from recorded session |
| `generate_csharp_nunit` | Generates C# NUnit + Selenium test class |
| `generate_github_actions` | Generates GitHub Actions workflow YAML |
| `generate_jenkins_pipeline` | Generates Declarative Jenkinsfile |
| `generate_gitlab_ci` | Generates GitLab CI pipeline YAML |
| `generate_playwright_hints` | Generates equivalent Playwright TypeScript code |
| `get_session_log` | Views recorded session actions |
| `clear_session_log` | Resets the recorded session |

---

## 🩹 Self-Healing Locators

When a selector fails, `testfly-mcp` automatically attempts healing strategies (CSS alternatives, ID fallbacks, accessible attributes, and text matching). Healed locators are tracked and reportable via `get_healed_locators`.

---

## 📄 License

MIT License. See [LICENSE](LICENSE) for details.
