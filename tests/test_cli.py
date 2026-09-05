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
