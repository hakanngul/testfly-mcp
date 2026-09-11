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

    dest = target_dir or (Path.cwd() if project_name in (".", "") else Path.cwd() / project_name)
    clean_name = dest.resolve().name if project_name in (".", "") else project_name
    art_id = artifact_id or clean_name.lower().replace(" ", "-").replace("_", "-")

    print("\n========================================================")
    print(f"✈  TestFly Project Generator — Scaffolding '{clean_name}'")
    print("========================================================")
    print(f"   Framework : {framework.upper()}")
    print(f"   Test Type : {test_type.upper()}")
    print(f"   GroupId   : {group_id}")
    print(f"   ArtifactId: {art_id}")
    print(f"   BaseURL   : {base_url}")
    print(f"   Directory : {dest.resolve()}\n")

    scaffold_project(
        target_dir=dest,
        project_name=clean_name,
        framework=framework,
        test_type=test_type,
        group_id=group_id,
        artifact_id=art_id,
        base_url=base_url,
    )

    print("✓ Project created successfully!")
    print("\nNext steps:")
    rel_path = "." if (target_dir is None and project_name in (".", "")) else (dest.name if target_dir is None else str(dest))
    if rel_path != ".":
        print(f"  cd {rel_path}")
    print("  mvn test (or run tests from your IDE)\n")


def cmd_record(url: Optional[str] = None, port: int = 8765, open_inspector: bool = True):
    """Starts the TestFly Recorder & Playwright-style Inspector."""
    from testfly_mcp.recorder import start_recorder
    # Check if testfly.yml exists in current directory for default baseUrl
    if not url:
        yml = Path.cwd() / "testfly.yml"
        if yml.exists():
            try:
                for line in yml.read_text(encoding="utf-8").splitlines():
                    if "baseUrl:" in line:
                        found_url = line.split("baseUrl:", 1)[1].strip().strip('"').strip("'")
                        if found_url:
                            url = found_url
                        break
            except Exception:
                pass
    start_recorder(start_url=url, port=port, open_inspector=open_inspector)


def cmd_ui(port: int = 8765, open_browser: bool = True):
    """Starts the TestFly Recorder Inspector (compatibility alias)."""
    cmd_record(port=port, open_inspector=open_browser)


def cmd_shard(
    total: int = 2,
    index: int = 0,
    metrics_path: Optional[str] = None,
    output_format: str = "surefire",
    output_file: Optional[str] = None,
):
    """Calculates optimal test partition for CI/CD parallel jobs using LPT bin-packing."""
    import json
    from testfly_mcp.sharder import (
        load_metrics_durations,
        compute_lpt_shards,
        format_surefire_pattern,
        format_testng_xml,
        format_ascii_dashboard,
        ShardedTestItem,
    )

    m_file = Path(metrics_path) if metrics_path else Path.cwd() / "target" / "testfly-metrics.json"
    items = load_metrics_durations(m_file)
    if not items:
        # Fallback: scan test directory for *Test.java classes
        test_dir = Path.cwd() / "src" / "test" / "java"
        if test_dir.exists():
            for java_file in test_dir.rglob("*Test.java"):
                rel = java_file.relative_to(test_dir)
                cls_name = str(rel).replace("/", ".").replace("\\", ".")[:-5]
                items.append(ShardedTestItem(id=cls_name, duration_ms=5000, class_name=cls_name))

    plan = compute_lpt_shards(items, total)

    if index < 0 or index >= len(plan.shards):
        print(f"Error: Shard index {index} out of range [0, {total})", file=sys.stderr)
        sys.exit(1)

    shard = plan.shards[index]

    if output_format == "surefire":
        result = format_surefire_pattern(shard)
        if output_file:
            Path(output_file).write_text(result, encoding="utf-8")
        else:
            print(result)
    elif output_format in ("xml", "testng-xml"):
        xml = format_testng_xml(shard)
        if output_file:
            Path(output_file).write_text(xml, encoding="utf-8")
            print(f"Generated TestNG suite at {output_file}")
        else:
            print(xml)
    elif output_format == "json":
        data = {
            "total_shards": plan.total_shards,
            "current_shard": index,
            "makespan_ms": plan.makespan_ms,
            "balance_efficiency": plan.balance_efficiency,
            "tests": [it.class_name or it.id for it in shard.items],
            "estimated_duration_ms": shard.total_duration_ms,
        }
        print(json.dumps(data, indent=2))
    else:
        print(format_ascii_dashboard(plan, index))


def cmd_interactive():
    """Presents an interactive terminal menu when run directly in a human terminal."""
    ver = get_version()
    while True:
        print("\n========================================================")
        print(f"✈  TestFly CLI & MCP Server (v{ver}) — Interactive Menu")
        print("========================================================")
        print("  [1] Scaffold New TestFly Project (TestNG / JUnit 5 / Cucumber)")
        print("  [2] Start TestFly Recorder (Playwright-Style Codegen in Chrome)")
        print("  [3] Run Environment Doctor (Diagnostics)")
        print("  [4] List MCP Tools (88 tools)")
        print("  [5] Generate testfly.yml in Current Directory")
        print("  [6] Start MCP Stdio Server (for AI Assistants / IDEs)")
        print("  [7] Smart Test Sharder (CI Parallel Bin-Packing)")
        print("  [q] Exit")
        print("--------------------------------------------------------")

        try:
            choice = input("Select an option [1-7, q]: ").strip().lower()
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
            p_url = input("Target URL [https://example.com]: ").strip() or "https://example.com"
            cmd_record(url=p_url)
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
        elif choice == "7":
            tot = input("Total shards [4]: ").strip() or "4"
            idx = input("Current shard index [0]: ").strip() or "0"
            cmd_shard(total=int(tot), index=int(idx), output_format="dashboard")
        elif choice in ("q", "quit", "exit"):
            print("Goodbye!")
            break
        else:
            print("Invalid selection. Please enter a number 1 to 7 or 'q'.")


def build_parser() -> argparse.ArgumentParser:
    ver = get_version()
    parser = argparse.ArgumentParser(
        prog="testfly",
        description=f"TestFly CLI & MCP Server (v{ver}) — Test Automation Toolkit & AI Assistant Protocol",
        epilog="Examples:\n"
               "  testfly init my-suite --framework testng --type web\n"
               "  testfly init my-api-tests --framework junit5 --type api\n"
               "  testfly record https://example.com # Record browser actions & generate TestFly Java tests\n"
               "  testfly studio                  # Launch TestFly Recorder Inspector in browser\n"
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

    # record, codegen, studio, ui
    record_p = subparsers.add_parser("record", help="Start Playwright-style browser recorder & live TestFly Java codegen inspector")
    record_p.add_argument("url", nargs="?", help="Target URL to start recording (default: https://example.com or testfly.yml baseUrl)")
    record_p.add_argument("--port", "-p", type=int, default=8765, help="Inspector port (default: 8765)")
    record_p.add_argument("--no-browser", action="store_true", help="Do not open inspector automatically")

    codegen_p = subparsers.add_parser("codegen", help="Start Playwright-style browser recorder (alias for record)")
    codegen_p.add_argument("url", nargs="?", help="Target URL to start recording")
    codegen_p.add_argument("--port", "-p", type=int, default=8765, help="Inspector port (default: 8765)")
    codegen_p.add_argument("--no-browser", action="store_true", help="Do not open inspector automatically")

    studio_p = subparsers.add_parser("studio", help="Start Playwright-style browser recorder & inspector (alias for record)")
    studio_p.add_argument("url", nargs="?", help="Target URL to start recording")
    studio_p.add_argument("--port", "-p", type=int, default=8765, help="Port for web studio (default: 8765)")
    studio_p.add_argument("--no-browser", action="store_true", help="Do not open browser automatically")

    ui_p = subparsers.add_parser("ui", help="Start Playwright-style browser recorder & inspector (alias for record)")
    ui_p.add_argument("url", nargs="?", help="Target URL to start recording")
    ui_p.add_argument("--port", "-p", type=int, default=8765, help="Port for web studio (default: 8765)")
    ui_p.add_argument("--no-browser", action="store_true", help="Do not open browser automatically")

    # shard
    shard_p = subparsers.add_parser("shard", help="Split test suite across parallel CI nodes using LPT bin-packing")
    shard_p.add_argument("--total", "-t", type=int, default=2, help="Total number of parallel shards (default: 2)")
    shard_p.add_argument("--index", "-i", type=int, default=0, help="0-based index of current shard node (default: 0)")
    shard_p.add_argument("--metrics", "-m", type=str, help="Path to testfly-metrics.json (default: target/testfly-metrics.json)")
    shard_p.add_argument("--format", "-f", choices=["surefire", "json", "xml", "testng-xml", "dashboard"], default="surefire", help="Output format (default: surefire)")
    shard_p.add_argument("--output", "-o", type=str, help="File to write shard output to (optional)")

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
    elif parsed.subcommand in ("record", "codegen", "ui", "studio"):
        cmd_record(
            url=getattr(parsed, "url", None),
            port=parsed.port,
            open_inspector=not parsed.no_browser,
        )
    elif parsed.subcommand == "shard":
        cmd_shard(
            total=parsed.total,
            index=parsed.index,
            metrics_path=parsed.metrics,
            output_format=parsed.format,
            output_file=parsed.output,
        )
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
