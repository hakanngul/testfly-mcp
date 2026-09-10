"""
TestFly MCP Command-Line Interface (CLI)
Provides command parsing for testfly-mcp:
  --help / -h        Show help and usage
  --version / -v     Show installed version
  doctor             Run environment health checks
  tools              List all available MCP tools
  ui                 Launch interactive web studio
  init-config        Generate standard testfly.yml in current directory
  stdio              Start MCP stdio server (default for IDE / Claude pipes)
  interactive        Interactive terminal menu
"""

import argparse
import sys
from pathlib import Path
from typing import List, Optional

from testfly_mcp.constants import DEFAULT_TESTFLY_YML


def get_version() -> str:
    from testfly_mcp.server import __version__
    return __version__


def run_stdio_server():
    """Runs the standard MCP stdio server."""
    import asyncio
    from testfly_mcp.server import main
    asyncio.run(main())


def cmd_doctor():
    """Runs environment checks and prints a formatted terminal report."""
    from testfly_mcp.ui.server import run_doctor_checks
    report = run_doctor_checks()

    print("\n========================================================")
    print(f"✈  TestFly MCP Environment Doctor — Status: {report['status'].upper()}")
    print("========================================================\n")

    for check in report["checks"]:
        cat = check["category"]
        name = check["name"]
        status = check["status"]
        details = check["details"]
        hint = check.get("hint")

        if status == "pass":
            symbol = "✓ [PASS]"
        elif status == "warn":
            symbol = "⚠ [WARN]"
        elif status == "fail":
            symbol = "✗ [FAIL]"
        else:
            symbol = "ℹ [INFO]"

        print(f"{symbol:<9} [{cat}] {name}")
        print(f"          Details: {details}")
        if hint:
            print(f"          Hint:    {hint}")
        print()

    print("========================================================\n")


def cmd_tools(search: Optional[str] = None):
    """Lists all available MCP tools."""
    from testfly_mcp.server import ALL_TOOLS

    query = (search or "").lower()
    tools = [t for t in ALL_TOOLS if not query or query in t.name.lower() or query in (t.description or "").lower()]

    term = search or "all"
    print(f"\n✈  TestFly MCP Tools ({len(tools)} of {len(ALL_TOOLS)} tools matching '{term}'):\n")
    for idx, t in enumerate(tools, 1):
        schema = getattr(t, "input_schema", getattr(t, "inputSchema", {}))
        props = schema.get("properties", {}) if isinstance(schema, dict) else {}
        params_count = len(props)
        desc = (t.description or "").split("\n")[0]
        print(f" {idx:2d}. {t.name:<32} ({params_count} params) — {desc}")
    print()


def cmd_init_config(force: bool = False):
    """Generates standard testfly.yml in current directory."""
    target = Path.cwd() / "testfly.yml"
    if target.exists() and not force:
        print(f"\n[!] testfly.yml already exists at: {target}")
        print("    Use --force to overwrite.\n")
        return

    target.write_text(DEFAULT_TESTFLY_YML, encoding="utf-8")
    print(f"\n✓ Generated standard TestFly configuration at:")
    print(f"  {target}\n")


def cmd_init(
    project_name: str = "my-testfly-suite",
    framework: str = "testng",
    test_type: str = "web",
    group_id: str = "com.example",
    artifact_id: Optional[str] = None,
    base_url: str = "https://example.com",
    target_dir: Optional[Path] = None,
):
    """Scaffolds a new TestFly test automation project."""
    from testfly_mcp.scaffold import scaffold_project

    dest = target_dir or (Path.cwd() / project_name)
    art_id = artifact_id or project_name.lower().replace(" ", "-").replace("_", "-")

    print("\n========================================================")
    print(f"✈  TestFly Project Generator — Scaffolding '{project_name}'")
    print("========================================================")
    print(f"   Framework : {framework.upper()}")
    print(f"   Test Type : {test_type.upper()}")
    print(f"   GroupId   : {group_id}")
    print(f"   ArtifactId: {art_id}")
    print(f"   BaseURL   : {base_url}")
    print(f"   Directory : {dest.resolve()}\n")

    scaffold_project(
        target_dir=dest,
        project_name=project_name,
        framework=framework,
        test_type=test_type,
        group_id=group_id,
        artifact_id=art_id,
        base_url=base_url,
    )

    print("✓ Project created successfully!")
    print("\nNext steps:")
    rel_path = dest.name if target_dir is None else str(dest)
    print(f"  cd {rel_path}")
    print("  mvn test (or run tests from your IDE)\n")


def cmd_ui(port: int = 8765, open_browser: bool = True):
    """Starts the Interactive Studio Web UI."""
    from testfly_mcp.ui.server import start_ui_server
    start_ui_server(port=port, open_browser=open_browser)


def cmd_interactive():
    """Presents an interactive terminal menu when run directly in a human terminal."""
    ver = get_version()
    while True:
        print("\n========================================================")
        print(f"✈  TestFly CLI & MCP Server (v{ver}) — Interactive Menu")
        print("========================================================")
        print("  [1] Scaffold New TestFly Project (TestNG / JUnit 5 / Cucumber)")
        print("  [2] Launch Interactive Web Studio (http://127.0.0.1:8765)")
        print("  [3] Run Environment Doctor (Diagnostics)")
        print("  [4] List MCP Tools (88 tools)")
        print("  [5] Generate testfly.yml in Current Directory")
        print("  [6] Start MCP Stdio Server (for AI Assistants / IDEs)")
        print("  [q] Exit")
        print("--------------------------------------------------------")

        try:
            choice = input("Select an option [1-6, q]: ").strip().lower()
        except (KeyboardInterrupt, EOFError):
            print("\nExiting.")
            break

        if choice == "1":
            print("\n--- Create New TestFly Project ---")
            p_name = input("Project name [my-testfly-suite]: ").strip() or "my-testfly-suite"
            p_fw = input("Framework (testng / junit5 / cucumber) [testng]: ").strip().lower() or "testng"
            p_type = input("Test type (web / api / hybrid) [web]: ").strip().lower() or "web"
            p_url = input("Base URL [https://example.com]: ").strip() or "https://example.com"
            cmd_init(project_name=p_name, framework=p_fw, test_type=p_type, base_url=p_url)
        elif choice == "2":
            cmd_ui()
            break
        elif choice == "3":
            cmd_doctor()
        elif choice == "4":
            cmd_tools()
        elif choice == "5":
            cmd_init_config()
        elif choice == "6":
            print("\nStarting MCP Stdio server... (Waiting for JSON-RPC messages)")
            run_stdio_server()
            break
        elif choice in ("q", "quit", "exit"):
            print("Goodbye!")
            break
        else:
            print("Invalid selection. Please enter a number 1 to 6 or 'q'.")


def build_parser() -> argparse.ArgumentParser:
    ver = get_version()
    parser = argparse.ArgumentParser(
        prog="testfly",
        description=f"TestFly CLI & MCP Server (v{ver}) — Test Automation Toolkit & AI Assistant Protocol",
        epilog="Examples:\n"
               "  testfly init my-suite --framework testng --type web\n"
               "  testfly init my-api-tests --framework junit5 --type api\n"
               "  testfly studio                  # Launch interactive web studio in browser\n"
               "  testfly doctor                  # Verify Python, Selenium, Chrome, and IDE setup\n"
               "  testfly tools                   # List all available MCP tools\n"
               "  testfly init-config             # Generate standard testfly.yml in current directory\n"
               "  testfly mcp                     # Start MCP stdio server (for AI Assistants)\n",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )

    parser.add_argument(
        "-v", "--version",
        action="version",
        version=f"%(prog)s {ver}",
        help="Show program's version number and exit",
    )

    subparsers = parser.add_subparsers(dest="subcommand", help="Available subcommands")

    # init
    init_p = subparsers.add_parser("init", help="Scaffold a new TestFly test automation project")
    init_p.add_argument("name", nargs="?", default="my-testfly-suite", help="Project name / directory (default: my-testfly-suite)")
    init_p.add_argument("--framework", "-f", choices=["testng", "junit5", "cucumber"], default="testng", help="Test runner framework (default: testng)")
    init_p.add_argument("--type", "-t", dest="test_type", choices=["web", "api", "hybrid"], default="web", help="Project test type (default: web)")
    init_p.add_argument("--group-id", "-g", default="com.example", help="Maven groupId (default: com.example)")
    init_p.add_argument("--artifact-id", "-a", help="Maven artifactId (default: derived from project name)")
    init_p.add_argument("--base-url", "-u", default="https://example.com", help="Target app baseUrl (default: https://example.com)")
    init_p.add_argument("--dir", "-d", help="Explicit target directory path (default: ./<name>)")

    # stdio & mcp
    subparsers.add_parser("stdio", help="Start MCP server over standard I/O (default when piped by IDE or Claude)")
    subparsers.add_parser("mcp", help="Start MCP server over standard I/O (alias for stdio)")

    # doctor
    subparsers.add_parser("doctor", help="Run environment and dependency diagnostic checks")

    # tools
    tools_p = subparsers.add_parser("tools", help="List all available MCP tools")
    tools_p.add_argument("--search", "-s", type=str, help="Filter tools by name or description keyword")

    # ui & studio
    ui_p = subparsers.add_parser("ui", help="Launch interactive web studio in default browser")
    ui_p.add_argument("--port", "-p", type=int, default=8765, help="Port for web studio (default: 8765)")
    ui_p.add_argument("--no-browser", action="store_true", help="Do not open browser automatically")

    studio_p = subparsers.add_parser("studio", help="Launch interactive web studio in default browser (alias for ui)")
    studio_p.add_argument("--port", "-p", type=int, default=8765, help="Port for web studio (default: 8765)")
    studio_p.add_argument("--no-browser", action="store_true", help="Do not open browser automatically")

    # init-config
    cfg_p = subparsers.add_parser("init-config", help="Generate standard testfly.yml template in current directory")
    cfg_p.add_argument("--force", "-f", action="store_true", help="Overwrite existing testfly.yml if present")

    # interactive
    subparsers.add_parser("interactive", help="Interactive terminal menu")

    return parser


def main_cli(args: Optional[List[str]] = None):
    """Main CLI entry point."""
    if args is None:
        args = sys.argv[1:]

    # If no arguments provided:
    if not args:
        # Check if stdin is an interactive terminal or a pipe
        if sys.stdin.isatty():
            # Human running from terminal -> show interactive menu
            cmd_interactive()
            return
        else:
            # Subprocess pipe (spawned by Claude Code, JetBrains, or Cursor) -> run MCP server
            run_stdio_server()
            return

    parser = build_parser()
    parsed = parser.parse_args(args)

    if parsed.subcommand in ("stdio", "mcp"):
        run_stdio_server()
    elif parsed.subcommand == "doctor":
        cmd_doctor()
    elif parsed.subcommand == "tools":
        cmd_tools(search=getattr(parsed, "search", None))
    elif parsed.subcommand in ("ui", "studio"):
        cmd_ui(port=parsed.port, open_browser=not parsed.no_browser)
    elif parsed.subcommand == "init-config":
        cmd_init_config(force=parsed.force)
    elif parsed.subcommand == "init":
        t_dir = Path(parsed.dir) if getattr(parsed, "dir", None) else None
        cmd_init(
            project_name=parsed.name,
            framework=parsed.framework,
            test_type=parsed.test_type,
            group_id=parsed.group_id,
            artifact_id=parsed.artifact_id,
            base_url=parsed.base_url,
            target_dir=t_dir,
        )
    elif parsed.subcommand == "interactive":
        cmd_interactive()
    else:
        # If unknown or not matched
        parser.print_help()


if __name__ == "__main__":
    main_cli()
