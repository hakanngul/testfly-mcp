"""
TestFly MCP Server
A Python-based MCP server for TestFly and Selenium WebDriver automation.
Serves both Java (TestFly / TestNG / JUnit 5 / Cucumber) and Python/C# test automation users.
"""

import asyncio
import logging
import tempfile
from importlib.metadata import PackageNotFoundError, version as _pkg_version
from pathlib import Path
from mcp.server import Server, ServerRequestContext
from mcp.server.stdio import stdio_server
from mcp.types import (
    CallToolRequestParams,
    CallToolResult,
    ImageContent,
    ListToolsResult,
    PaginatedRequestParams,
    TextContent,
)

from testfly_mcp.tools.browser_tools import BrowserTools
from testfly_mcp.tools.element_tools import ElementTools
from testfly_mcp.tools.assertion_tools import AssertionTools
from testfly_mcp.tools.codegen_tools import CodegenTools

_log_path = Path(tempfile.gettempdir()) / "testfly-mcp.log"
_log_path.touch(mode=0o600, exist_ok=True)
logging.basicConfig(
    filename=str(_log_path),
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(message)s"
)
log = logging.getLogger(__name__)

try:
    # Single source of truth is pyproject.toml; read it back off the installed
    # distribution rather than duplicating the number in the source.
    __version__ = _pkg_version("testfly-mcp")
except PackageNotFoundError:
    try:
        __version__ = _pkg_version("seleniumboot-mcp")
    except PackageNotFoundError:
        __version__ = "1.0.0.dev0"

SERVER_INSTRUCTIONS = """\
TestFly MCP — real-browser automation plus test-code generation.

GOLDEN RULE: never hand-write test or page-object source. After driving the
browser, ALWAYS produce code with the generate_* codegen tools and save their
output verbatim. Hand-written code drifts from the framework API (wrong driver
access, non-existent helpers) and invents UI elements that do not exist.

Workflow for "automate X" / "write a test for the X form":
1. start_browser, then navigate to the page.
2. Inspect the live DOM (get_page_source) and interact ONLY with elements that
   are really there. Do NOT assume a form has fields it does not render — e.g.
   only fill username / password if the page actually shows them. Use the
   assert_* tools to capture the checks you want in the test (visible / text /
   title / url); passing assertions are recorded and become web-first
   assertThat(...) assertions in the TestFly output.
3. BEFORE generating Java, call detect_testfly. If it reports detected=true
   (or you otherwise know this is a TestFly project), generate with
   framework="testfly" (default) — EVERY Java generator supports it:
     - generate_java_page_object  -> Page extends BasePage, Test extends BaseTest
     - generate_java_testng       -> extends BaseTest
     - generate_java_junit5       -> extends BaseJUnit5Test
     - generate_gherkin           -> steps extend BaseCucumberSteps, runner extends BaseCucumberTest
     - generate_testfly_config    -> generates testfly.yml configuration
     - generate_testfly_pom       -> generates pom.xml with io.testfly:testfly
   The testfly flavor uses framework-managed driver (no ChromeDriver
   setUp/tearDown), accessibility-first locators (getByRole / getByLabel /
   getByTestId / getByPlaceholder / getByText / find), a SmartLocator fallback for
   brittle selectors, and web-first assertThat(...) assertions. It compiles
   against the framework as-is.
   For a non-TestFly project use framework="testng" / "junit5" / "raw",
   or generate_python_test / generate_csharp_nunit.
4. Write each emitted file at the path in its "File:" header, unchanged.
5. close_browser when finished.

Generated code contains ONLY the elements and actions actually performed, so it
compiles and never references non-existent fields. To cover more, interact with
more real elements first, then regenerate — do not pad the test by hand.
"""

browser = BrowserTools()
element = ElementTools(browser)
assertion = AssertionTools(browser)
codegen = CodegenTools(browser)

ALL_TOOLS = [
    *browser.get_tools(),
    *element.get_tools(),
    *assertion.get_tools(),
    *codegen.get_tools(),
]

TOOL_HANDLERS = {
    **browser.get_handlers(),
    **element.get_handlers(),
    **assertion.get_handlers(),
    **codegen.get_handlers(),
}


# mcp 2.0 replaced the @app.list_tools() / @app.call_tool() decorators with
# constructor callbacks. The handlers now take a ServerRequestContext plus typed
# request params, and return Result models instead of bare content lists.
#
# The wire output is deliberately unchanged from 0.4.x — same content, same
# text, same error strings. A migration that also changes behaviour cannot be
# verified as a migration. (Returning is_error=True on the exception path is
# the semantically correct thing and is a follow-up, not part of this change.)


async def list_tools(
    ctx: ServerRequestContext[None],
    params: PaginatedRequestParams | None,
) -> ListToolsResult:
    return ListToolsResult(tools=ALL_TOOLS)


async def call_tool(
    ctx: ServerRequestContext[None],
    params: CallToolRequestParams,
) -> CallToolResult:
    name = params.name
    arguments = params.arguments or {}
    log.info(f"Tool called: {name} | args: {arguments}")
    handler = TOOL_HANDLERS.get(name)
    if not handler:
        return CallToolResult(
            content=[TextContent(type="text", text=f"Unknown tool: {name}")]
        )
    try:
        result = await handler(arguments)
        if isinstance(result, str) and result.startswith("screenshot:base64:"):
            b64 = result[len("screenshot:base64:"):]
            return CallToolResult(
                content=[ImageContent(type="image", data=b64, mimeType="image/png")]
            )
        return CallToolResult(content=[TextContent(type="text", text=result)])
    except Exception as e:
        log.error(f"Tool error [{name}]: {e}")
        return CallToolResult(
            content=[TextContent(type="text", text=f"Error: {str(e)}")]
        )


app = Server(
    "testfly-mcp",
    version=__version__,
    instructions=SERVER_INSTRUCTIONS,
    on_list_tools=list_tools,
    on_call_tool=call_tool,
)


async def main():
    async with stdio_server() as (r, w):
        await app.run(r, w, app.create_initialization_options())


def run():
    asyncio.run(main())


if __name__ == "__main__":
    run()
