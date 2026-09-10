import json
from pathlib import Path
import pytest
from testfly_mcp.cli import build_parser, cmd_doctor, cmd_tools, cmd_init_config
from testfly_mcp.ui.server import run_doctor_checks, StudioRequestHandler
from unittest.mock import MagicMock


def test_cli_parser_subcommands():
    parser = build_parser()
    
    args = parser.parse_args(["doctor"])
    assert args.subcommand == "doctor"
    
    args = parser.parse_args(["tools", "--search", "testfly"])
    assert args.subcommand == "tools"
    assert args.search == "testfly"

    args = parser.parse_args(["ui", "--port", "9999", "--no-browser"])
    assert args.subcommand == "ui"
    assert args.port == 9999
    assert args.no_browser is True

    args = parser.parse_args(["init-config", "--force"])
    assert args.subcommand == "init-config"
    assert args.force is True

    args = parser.parse_args(["init", "my-app", "--framework", "junit5", "--type", "api"])
    assert args.subcommand == "init"
    assert args.name == "my-app"
    assert args.framework == "junit5"
    assert args.test_type == "api"

    args = parser.parse_args(["studio", "--port", "8000", "--no-browser"])
    assert args.subcommand == "studio"
    assert args.port == 8000
    assert args.no_browser is True

    args = parser.parse_args(["mcp"])
    assert args.subcommand == "mcp"


def test_doctor_checks():
    report = run_doctor_checks()
    assert "status" in report
    assert "checks" in report
    assert len(report["checks"]) >= 5
    
    names = [c["name"] for c in report["checks"]]
    assert "Python Version" in names
    assert "Selenium Package" in names
    assert "Model Context Protocol SDK" in names


def test_cmd_tools_execution(capsys):
    cmd_tools(search="detect_testfly")
    captured = capsys.readouterr()
    assert "detect_testfly" in captured.out
    assert "TestFly MCP Tools" in captured.out


def test_cmd_init_config(tmp_path, monkeypatch, capsys):
    monkeypatch.chdir(tmp_path)
    cmd_init_config(force=False)
    
    cfg = tmp_path / "testfly.yml"
    assert cfg.exists()
    content = cfg.read_text(encoding="utf-8")
    assert "execution:" in content
    assert "browser:" in content
    
    # Second run without force should not overwrite
    cmd_init_config(force=False)
    captured = capsys.readouterr()
    assert "already exists" in captured.out


def test_cmd_init_scaffolding_testng_web(tmp_path, capsys):
    from testfly_mcp.cli import cmd_init

    proj_dir = tmp_path / "demo-testng-web"
    cmd_init(
        project_name="demo-testng-web",
        framework="testng",
        test_type="web",
        group_id="org.mycorp",
        base_url="https://qa.mycorp.internal",
        target_dir=proj_dir,
    )

    captured = capsys.readouterr()
    assert "Project created successfully!" in captured.out

    assert (proj_dir / "pom.xml").exists()
    pom_text = (proj_dir / "pom.xml").read_text(encoding="utf-8")
    assert "<groupId>org.mycorp</groupId>" in pom_text
    assert "<artifactId>demo-testng-web</artifactId>" in pom_text
    assert "testng" in pom_text

    assert (proj_dir / "testfly.yml").exists()
    yml_text = (proj_dir / "testfly.yml").read_text(encoding="utf-8")
    assert "https://qa.mycorp.internal" in yml_text

    assert (proj_dir / ".gitignore").exists()
    assert (proj_dir / "README.md").exists()

    sample_test = proj_dir / "src/test/java/org/mycorp/demo_testng_web/tests/SampleWebTest.java"
    assert sample_test.exists()
    test_text = sample_test.read_text(encoding="utf-8")
    assert "public class SampleWebTest extends BaseTest" in test_text
    assert "open(\"/\")" in test_text


def test_cmd_init_scaffolding_junit5_api(tmp_path, capsys):
    from testfly_mcp.cli import cmd_init

    proj_dir = tmp_path / "demo-junit5-api"
    cmd_init(
        project_name="demo-junit5-api",
        framework="junit5",
        test_type="api",
        group_id="com.myapi",
        target_dir=proj_dir,
    )

    assert (proj_dir / "pom.xml").exists()
    pom_text = (proj_dir / "pom.xml").read_text(encoding="utf-8")
    assert "junit-jupiter" in pom_text

    sample_test = proj_dir / "src/test/java/com/myapi/demo_junit5_api/tests/SampleApiTest.java"
    assert sample_test.exists()
    test_text = sample_test.read_text(encoding="utf-8")
    assert "public class SampleApiTest extends BaseApiTest" in test_text


def test_cmd_init_scaffolding_cucumber_hybrid(tmp_path, capsys):
    from testfly_mcp.cli import cmd_init

    proj_dir = tmp_path / "demo-cucumber-hybrid"
    cmd_init(
        project_name="demo-cucumber-hybrid",
        framework="cucumber",
        test_type="hybrid",
        group_id="com.hybrid",
        target_dir=proj_dir,
    )

    assert (proj_dir / "pom.xml").exists()
    pom_text = (proj_dir / "pom.xml").read_text(encoding="utf-8")
    assert "cucumber-java" in pom_text

    sample_test = proj_dir / "src/test/java/com/hybrid/demo_cucumber_hybrid/tests/SampleHybridTest.java"
    assert sample_test.exists()
    test_text = sample_test.read_text(encoding="utf-8")
    assert "public class SampleHybridTest extends BaseTest" in test_text

