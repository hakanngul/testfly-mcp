# testfly-mcp

A Python **Model Context Protocol (MCP)** server for **TestFly** and Selenium WebDriver automation.
Let Claude, GitHub Copilot, or JetBrains AI Assistant control a real browser — navigate pages, interact with elements, run web-first assertions, and generate production-ready **TestFly (Java / TestNG / JUnit 5 / Cucumber)**, **Python pytest**, and **C# NUnit** test code from recorded sessions.

88 tools. Zero ChromeDriver setup. Browser auto-starts on first use.

[![PyPI](https://img.shields.io/pypi/v/testfly-mcp)](https://pypi.org/project/testfly-mcp/)
[![Python](https://img.shields.io/pypi/pyversions/testfly-mcp)](https://pypi.org/project/testfly-mcp/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/testfly.testfly-mcp?label=VS%20Code)](https://marketplace.visualstudio.com/items?itemName=testfly.testfly-mcp)

---

## Installation

```bash
pip install testfly-mcp
```

*(For backward compatibility, `pip install seleniumboot-mcp` and the `seleniumboot-mcp` command remain fully supported).*

> Requires Python 3.10+ and Chrome. No separate ChromeDriver download needed — Selenium Manager handles driver binaries automatically.

---

## Quick Setup

### 1. VS Code (Marketplace Extension)

Install **TestFly MCP** from the VS Code Marketplace.

The extension automatically:
- Registers the MCP server with **GitHub Copilot**
- Configures `.mcp.json` for **Claude Code**
- Prompts to install `testfly-mcp` if missing

When Claude Code asks *"Allow MCP server testfly?"* — click **Allow**.

### 2. VS Code (Manual Configuration)

Add `.vscode/mcp.json` to your project root (for GitHub Copilot):

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

For Claude Code, add `.mcp.json` to your project root:

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

Edit your Claude Desktop config:
- **Windows:** `%APPDATA%\claude-desktop\config.json`
- **macOS:** `~/.config/claude-desktop/config.json`

```json
{
  "mcpServers": {
    "testfly": {
      "command": "testfly-mcp"
    }
  }
}
```

---

## How It Works

Interact naturally with your AI assistant:

```
1. "Go to https://example.com/login, fill username and password, then click Sign in"
2. "Assert the dashboard heading is visible and url contains '/dashboard'"
3. "Generate a TestFly page object and test class for this flow"
```

The assistant drives the browser, verifies interactions against the live DOM, records actions, and generates clean, framework-native code adhering to the **TestFly v1.0.0 SDK**.

---

## TestFly Native Codegen Highlights

Generated code for `framework="testfly"` (the default):
- **Driver Lifecycle**: Framework-managed via `BaseTest`, `BasePage`, or `BaseJUnit5Test`. Never creates manual `ChromeDriver` or explicit `setUp()`/`tearDown()` in tests.
- **Accessibility-First Locators**: Standardizes on `getByRole(Role.BUTTON, "...")`, `getByLabel("...")`, `getByTestId("...")`, and `find("...")` (replaces deprecated `$()`).
- **Web-First Assertions**: Emits auto-waiting `assertThat(getDriver()).hasTitle(...)`, `assertThat(getDriver()).hasUrl(...)`, `assertThat(locator).isVisible()`, and `assertThat(locator).hasText(...)`.
- **Configuration & POM**: Instant generation of `testfly.yml` via `generate_testfly_config` and `pom.xml` with `io.testfly:testfly` via `generate_testfly_pom`.

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

Emits both the step definitions and the test runner:

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

## Tools Reference (88 total)

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

## Self-Healing Locators

When a selector fails, `testfly-mcp` automatically attempts healing strategies (CSS alternatives, ID fallbacks, accessible attributes, and text matching). Healed locators are tracked and reportable via `get_healed_locators`.

---

## License

MIT
