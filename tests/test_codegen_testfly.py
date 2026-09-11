import pytest
from testfly_mcp.tools.codegen_tools import CodegenTools


class DummyBrowser:
    def __init__(self, session_log=None):
        self._session_log = session_log or []


@pytest.fixture
def sample_session():
    return [
        {"action": "navigate", "url": "https://example.com/login"},
        {
            "action": "type_text",
            "selector": "#username",
            "by": "css",
            "text": "admin",
            "attrs": {"label": "Username", "tag": "input", "type": "text"}
        },
        {
            "action": "type_text",
            "selector": "#password",
            "by": "css",
            "text": "secret",
            "attrs": {"label": "Password", "tag": "input", "type": "password"}
        },
        {
            "action": "click",
            "selector": "button[type='submit']",
            "by": "css",
            "attrs": {"role": "button", "text": "Sign in", "tag": "button"}
        },
        {
            "action": "assert_title",
            "expected": "Dashboard",
            "exact": True
        },
        {
            "action": "assert_url",
            "expected": "/dashboard",
            "exact": False
        },
        {
            "action": "assert_page_contains",
            "text": "Welcome"
        }
    ]


@pytest.mark.asyncio
async def test_generate_testfly_config(sample_session):
    browser = DummyBrowser(sample_session)
    codegen = CodegenTools(browser)

    config_str = await codegen._generate_testfly_config({
        "browser": "chrome",
        "headless": True,
        "thread_count": 8,
        "retry_attempts": 3
    })

    assert "execution:" in config_str
    assert "baseUrl: https://example.com" in config_str
    assert "name: chrome" in config_str
    assert "headless: true" in config_str
    assert "threadCount: 8" in config_str
    assert "maxAttempts: 3" in config_str


@pytest.mark.asyncio
async def test_generate_testfly_pom():
    browser = DummyBrowser([])
    codegen = CodegenTools(browser)

    pom_str = await codegen._generate_testfly_pom({
        "group_id": "com.mycompany",
        "artifact_id": "my-tests",
        "testfly_version": "1.0.0"
    })

    assert "<groupId>com.mycompany</groupId>" in pom_str
    assert "<artifactId>my-tests</artifactId>" in pom_str
    assert "<groupId>io.testfly</groupId>" in pom_str
    assert "<artifactId>testfly</artifactId>" in pom_str
    assert "<testfly.version>1.0.0</testfly.version>" in pom_str
    assert "<version>${testfly.version}</version>" in pom_str


@pytest.mark.asyncio
async def test_generate_java_testng_testfly(sample_session):
    browser = DummyBrowser(sample_session)
    codegen = CodegenTools(browser)

    # Default framework is testfly
    code = await codegen._generate_java_testng({
        "test_name": "LoginFlowTest",
        "package_name": "com.example.tests"
    })

    assert "import io.testfly.test.BaseTest;" in code
    assert "public class LoginFlowTest extends BaseTest" in code
    assert "getByLabel(\"Username\").type(\"admin\");" in code
    assert "getByLabel(\"Password\").type(\"secret\");" in code
    assert "getByRole(Role.BUTTON, \"Sign in\").click();" in code
    assert "assertThat(getDriver()).hasTitle(\"Dashboard\");" in code
    assert "assertThat(getDriver()).urlContains(\"/dashboard\");" in code
    assert "assertThat(getByText(\"Welcome\")).isVisible();" in code
    # Must NOT have manual ChromeDriver setup
    assert "new ChromeDriver" not in code
    assert "driver.quit()" not in code


@pytest.mark.asyncio
async def test_generate_java_junit5_testfly(sample_session):
    browser = DummyBrowser(sample_session)
    codegen = CodegenTools(browser)

    code = await codegen._generate_java_junit5({
        "test_name": "LoginFlowJUnit5Test",
        "package_name": "com.example.tests"
    })

    assert "import io.testfly.junit5.BaseJUnit5Test;" in code
    assert "public class LoginFlowJUnit5Test extends BaseJUnit5Test" in code
    assert "getByLabel(\"Username\").type(\"admin\");" in code
    assert "assertThat(getDriver()).hasTitle(\"Dashboard\");" in code
    assert "new ChromeDriver" not in code


@pytest.mark.asyncio
async def test_generate_java_page_object_testfly(sample_session):
    browser = DummyBrowser(sample_session)
    codegen = CodegenTools(browser)

    code = await codegen._generate_java_page_object({
        "package_name": "com.example",
        "page_name": "LoginPage"
    })

    # Verifies both Page Object and Test class
    assert "File: com/example/pages/LoginPage.java" in code
    assert "File: com/example/tests/LoginTest.java" in code
    # Page class checks
    assert "import io.testfly.test.BasePage;" in code
    assert "import io.testfly.locator.Locator;" in code
    assert "public class LoginPage extends BasePage" in code
    assert "getByLabel(\"Username\")" in code
    assert "getByRole(Role.BUTTON, \"Sign in\")" in code
    assert "public LoginPage enterUsername(String text)" in code
    assert "username.type(text);" in code
    # Test class checks
    assert "import io.testfly.test.BaseTest;" in code
    assert "public class LoginTest extends BaseTest" in code
    assert "page.enterUsername(\"admin\");" in code
    assert "page.clickSignIn();" in code
    assert "assertThat(getDriver()).hasTitle(\"Dashboard\");" in code


@pytest.mark.asyncio
async def test_generate_gherkin_testfly(sample_session):
    browser = DummyBrowser(sample_session)
    codegen = CodegenTools(browser)

    code = await codegen._generate_gherkin({
        "package_name": "com.example.cucumber",
        "feature_name": "Login"
    })

    # Verifies feature file, steps class, and test runner
    assert "File: src/test/resources/features/login.feature" in code
    assert "Feature: Login" in code
    assert "Given I navigate to \"https://example.com/login\"" in code
    assert "File: com/example/cucumber/steps/LoginSteps.java" in code
    assert "import io.testfly.cucumber.BaseCucumberSteps;" in code
    assert "public class LoginSteps extends BaseCucumberSteps" in code
    assert "File: com/example/cucumber/RunCucumberTest.java" in code
    assert "import io.testfly.cucumber.BaseCucumberTest;" in code
    assert "public class RunCucumberTest extends BaseCucumberTest" in code


@pytest.mark.asyncio
async def test_compound_xpath_not_collapsed_to_id():
    """Verify that ancestor-anchored XPaths like //*[@id='login_credentials']//h4
    are NOT collapsed to By.id('login_credentials') but preserved as By.xpath(...)."""
    session = [
        {"action": "navigate", "url": "https://saucedemo.com"},
        {
            "action": "click",
            "selector": "//*[@id='login_credentials']//h4",
            "by": "xpath",
            "attrs": {"tag": "h4", "text": "Accepted usernames are:"}
        },
        {
            "action": "click",
            "selector": "//*[@id='user-name']",
            "by": "xpath",
            "attrs": {"tag": "input", "idAttr": "user-name"}
        }
    ]
    browser = DummyBrowser(session)
    codegen = CodegenTools(browser)

    code = await codegen._generate_java_testng({
        "test_name": "SauceDemoTest",
        "package_name": "com.example.tests"
    })

    # The h4 must NOT be collapsed to By.id("login_credentials")
    assert 'By.id("login_credentials")' not in code
    # With accessibility attrs (tag=h4, text), it generates getByRole(Role.HEADING, ...).withLevel(4)
    assert 'getByRole(Role.HEADING, "Accepted usernames are:").withLevel(4)' in code

    # Now test raw selector without attrs (must preserve By.xpath, not collapse to By.id)
    raw_session = [
        {"action": "navigate", "url": "https://saucedemo.com"},
        {
            "action": "click",
            "selector": "//*[@id='login_credentials']//h4",
            "by": "xpath"
        }
    ]
    raw_browser = DummyBrowser(raw_session)
    raw_codegen = CodegenTools(raw_browser)
    raw_code = await raw_codegen._generate_java_testng({
        "test_name": "RawXPathTest",
        "package_name": "com.example.tests"
    })
    assert 'By.id("login_credentials")' not in raw_code
    assert 'find(By.xpath("//*[@id=\'login_credentials\']//h4")).click();' in raw_code

    # The exact single element query on user-name SHOULD be collapsed to By.id("user-name")
    assert 'find(By.id("user-name")).click();' in code


def test_element_tools_alternatives_container_conversion():
    """Verify element_tools generates container-anchored XPath alternatives for CSS."""
    from testfly_mcp.tools.element_tools import ElementTools
    tools = ElementTools(DummyBrowser([]))

    # #login_credentials h4 -> //*[@id='login_credentials']//h4
    alts = tools._alternatives("#login_credentials h4", "css")
    assert ("//*[@id='login_credentials']//h4", "xpath") in alts

    # [data-test='login-credentials'] h4 -> //*[@data-test='login-credentials']//h4
    alts_test = tools._alternatives("[data-test='login-credentials'] h4", "css")
    assert ("//*[@data-test='login-credentials']//h4", "xpath") in alts_test

    # Reverse: //*[@id='login_credentials']//h4 -> #login_credentials h4
    alts_rev = tools._alternatives("//*[@id='login_credentials']//h4", "xpath")
    assert ("#login_credentials h4", "css") in alts_rev

