import json
from pathlib import Path
import pytest
from testfly_mcp.sharder import (
    ShardedTestItem,
    compute_lpt_shards,
    format_surefire_pattern,
    format_testng_xml,
    load_metrics_durations,
    format_ascii_dashboard,
)
from testfly_mcp.cli import build_parser, cmd_shard


def test_lpt_sharder_balances_load():
    # 6 items: 60s, 50s, 40s, 30s, 20s, 10s = 210s across 3 shards -> 70s each
    items = [
        ShardedTestItem(id="Test1", duration_ms=60000, class_name="com.example.Test1"),
        ShardedTestItem(id="Test2", duration_ms=50000, class_name="com.example.Test2"),
        ShardedTestItem(id="Test3", duration_ms=40000, class_name="com.example.Test3"),
        ShardedTestItem(id="Test4", duration_ms=30000, class_name="com.example.Test4"),
        ShardedTestItem(id="Test5", duration_ms=20000, class_name="com.example.Test5"),
        ShardedTestItem(id="Test6", duration_ms=10000, class_name="com.example.Test6"),
    ]

    plan = compute_lpt_shards(items, total_shards=3)
    assert plan.total_shards == 3
    assert plan.total_duration_ms == 210000
    assert plan.makespan_ms == 70000
    assert plan.balance_efficiency == 100.0

    # Verify each shard gets exactly 70s
    for s in plan.shards:
        assert s.total_duration_ms == 70000
        assert len(s.items) == 2


def test_format_surefire_and_testng_xml():
    items = [
        ShardedTestItem(id="LoginTest", duration_ms=10000, class_name="com.example.LoginTest"),
        ShardedTestItem(id="SearchTest", duration_ms=5000, class_name="com.example.SearchTest"),
    ]
    plan = compute_lpt_shards(items, total_shards=1)
    shard = plan.shards[0]

    surefire_pat = format_surefire_pattern(shard)
    assert "LoginTest,SearchTest" in surefire_pat

    xml = format_testng_xml(shard)
    assert '<class name="com.example.LoginTest"/>' in xml
    assert '<class name="com.example.SearchTest"/>' in xml


def test_load_metrics_durations(tmp_path):
    metrics = tmp_path / "testfly-metrics.json"
    data = {
        "tests": [
            {"testId": "com.example.LoginTest.testLogin", "testClassName": "com.example.LoginTest", "totalMs": 8000},
            {"testId": "com.example.ApiTest.testEndpoint", "testClassName": "com.example.ApiTest", "totalMs": 3000},
        ]
    }
    metrics.write_text(json.dumps(data), encoding="utf-8")

    items = load_metrics_durations(metrics)
    assert len(items) == 2
    classes = {it.class_name: it.duration_ms for it in items}
    assert classes["com.example.LoginTest"] == 8000
    assert classes["com.example.ApiTest"] == 3000


def test_cli_shard_command(tmp_path, capsys):
    metrics = tmp_path / "testfly-metrics.json"
    data = {
        "tests": [
            {"testId": "com.example.T1.t", "testClassName": "com.example.T1", "totalMs": 10000},
            {"testId": "com.example.T2.t", "testClassName": "com.example.T2", "totalMs": 10000},
        ]
    }
    metrics.write_text(json.dumps(data), encoding="utf-8")

    # Surefire format output
    cmd_shard(total=2, index=0, metrics_path=str(metrics), output_format="surefire")
    captured = capsys.readouterr()
    assert "T1" in captured.out or "T2" in captured.out

    # JSON format output
    cmd_shard(total=2, index=0, metrics_path=str(metrics), output_format="json")
    captured = capsys.readouterr()
    json_data = json.loads(captured.out)
    assert json_data["total_shards"] == 2
    assert json_data["current_shard"] == 0

    # Dashboard format output
    cmd_shard(total=2, index=0, metrics_path=str(metrics), output_format="dashboard")
    captured = capsys.readouterr()
    assert "TestFly Smart Test Sharder" in captured.out
    assert "[CURRENT NODE]" in captured.out
