import pytest
from mcp.types import CallToolRequestParams
import testfly_mcp.server as tf_server
import selenium_mcp.server as legacy_server


def test_tool_count_and_handlers():
    assert len(tf_server.ALL_TOOLS) == 88
    tool_names = {t.name for t in tf_server.ALL_TOOLS}
    assert "detect_testfly" in tool_names
    assert "detect_selenium_boot" in tool_names
    assert "generate_testfly_config" in tool_names
    assert "generate_testfly_pom" in tool_names
    assert "generate_java_testng" in tool_names
    assert "generate_java_junit5" in tool_names
    assert "generate_java_page_object" in tool_names
    assert "generate_gherkin" in tool_names

    # Ensure each tool has a registered handler
    for tool in tf_server.ALL_TOOLS:
        assert tool.name in tf_server.TOOL_HANDLERS, f"Missing handler for {tool.name}"


def test_legacy_shim_exports():
    assert legacy_server.ALL_TOOLS == tf_server.ALL_TOOLS
    assert legacy_server.TOOL_HANDLERS == tf_server.TOOL_HANDLERS
    assert legacy_server.app == tf_server.app


@pytest.mark.asyncio
async def test_call_tool_detect_testfly():
    params = CallToolRequestParams(name="detect_testfly", arguments={})
    res = await tf_server.call_tool(None, params)
    assert len(res.content) == 1
    assert "TestFly" in res.content[0].text
