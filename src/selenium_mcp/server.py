"""
Backward compatibility shim for selenium_mcp.server.
Redirects to testfly_mcp.server.
"""
from testfly_mcp.server import (
    app,
    main,
    run,
    ALL_TOOLS,
    TOOL_HANDLERS,
    SERVER_INSTRUCTIONS,
    __version__,
)

if __name__ == "__main__":
    run()
