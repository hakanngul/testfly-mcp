"""
TestFly Smart Test Sharder (CLI)
Calculates optimal test partitions for CI/CD parallel jobs
using the Longest Processing Time (LPT) first Bin-Packing algorithm.
"""

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple


@dataclass
class ShardedTestItem:
    id: str
    duration_ms: int
    class_name: Optional[str] = None


@dataclass
class ShardBucket:
    index: int
    items: List[ShardedTestItem] = field(default_factory=list)
    total_duration_ms: int = 0

    def add_item(self, item: ShardedTestItem):
        self.items.append(item)
        self.total_duration_ms += item.duration_ms


@dataclass
class ShardingPlanResult:
    total_shards: int
    shards: List[ShardBucket]
    total_duration_ms: int
    makespan_ms: int
    balance_efficiency: float


def load_metrics_durations(metrics_file: Path) -> List[ShardedTestItem]:
    """Loads historical durations from testfly-metrics.json."""
    if not metrics_file.exists():
        return []

    try:
        data = json.loads(metrics_file.read_text(encoding="utf-8"))
        tests = data.get("tests", [])
        items: List[ShardedTestItem] = []

        seen_classes: Dict[str, int] = {}

        for t in tests:
            test_id = t.get("testId") or ""
            tot_ms = int(t.get("totalMs", 5000))
            cls_name = t.get("testClassName")
            if not cls_name and "." in test_id:
                cls_name = test_id.rsplit(".", 1)[0]

            if cls_name:
                seen_classes[cls_name] = seen_classes.get(cls_name, 0) + tot_ms

        for cls, d_ms in seen_classes.items():
            items.append(ShardedTestItem(id=cls, duration_ms=d_ms, class_name=cls))

        return items
    except Exception:
        return []


def compute_lpt_shards(items: List[ShardedTestItem], total_shards: int) -> ShardingPlanResult:
    """Partitions test items across total_shards using LPT bin-packing."""
    safe_total = max(1, total_shards)
    shards = [ShardBucket(index=i) for i in range(safe_total)]

    if not items:
        return ShardingPlanResult(
            total_shards=safe_total,
            shards=shards,
            total_duration_ms=0,
            makespan_ms=0,
            balance_efficiency=100.0,
        )

    # 1. Sort descending by duration
    sorted_items = sorted(items, key=lambda x: x.duration_ms, reverse=True)

    # 2. Greedily assign to shard with lowest accumulated duration
    for item in sorted_items:
        least_loaded = min(shards, key=lambda s: (s.total_duration_ms, s.index))
        least_loaded.add_item(item)

    total_dur = sum(s.total_duration_ms for s in shards)
    makespan = max(s.total_duration_ms for s in shards) if shards else 0
    ideal_avg = total_dur / safe_total if safe_total > 0 else 0
    efficiency = min(100.0, (ideal_avg / makespan * 100.0)) if makespan > 0 else 100.0

    return ShardingPlanResult(
        total_shards=safe_total,
        shards=shards,
        total_duration_ms=total_dur,
        makespan_ms=makespan,
        balance_efficiency=efficiency,
    )


def format_duration(ms: int) -> str:
    if ms < 1000:
        return f"{ms}ms"
    sec = ms // 1000
    if sec < 60:
        return f"{sec}s"
    mins = sec // 60
    rem = sec % 60
    return f"{mins}m {rem}s"


def format_surefire_pattern(shard: ShardBucket) -> str:
    """Returns comma-separated test classes suitable for Maven Surefire -Dtest=..."""
    classes = [it.class_name or it.id for it in shard.items]
    # Simple class names preferred by Surefire
    simple_names = [c.split(".")[-1] for c in classes]
    return ",".join(simple_names)


def format_testng_xml(shard: ShardBucket) -> str:
    """Generates dynamic TestNG XML suite for this shard."""
    classes = [it.class_name or it.id for it in shard.items]
    class_tags = "\n".join(f'            <class name="{c}"/>' for c in classes)

    return f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE suite SYSTEM "https://testng.org/testng-1.0.dtd">
<suite name="TestFly-Shard-{shard.index}" verbose="1">
    <test name="Shard-{shard.index}-Tests">
        <classes>
{class_tags}
        </classes>
    </test>
</suite>
"""


def format_ascii_dashboard(plan: ShardingPlanResult, current_shard_index: int) -> str:
    lines = [
        "\n================================================================================",
        "✈  TestFly Smart Test Sharder — LPT Bin-Packing",
        "================================================================================",
    ]
    total_tests = sum(len(s.items) for s in plan.shards)
    lines.append(
        f"Total Tests: {total_tests} | Total Shards: {plan.total_shards} | Active Shard: {current_shard_index + 1} of {plan.total_shards} (Index: {current_shard_index})"
    )
    lines.append(
        f"Suite Total Time: {format_duration(plan.total_duration_ms)} | Makespan: {format_duration(plan.makespan_ms)} | Efficiency: {plan.balance_efficiency:.1f}%"
    )
    lines.append("--------------------------------------------------------------------------------")

    for s in plan.shards:
        pct = (s.total_duration_ms * 100.0 / plan.total_duration_ms) if plan.total_duration_ms > 0 else 0.0
        mark = " [CURRENT NODE]" if s.index == current_shard_index else ""
        lines.append(
            f"Shard {s.index:<2}{mark:<15}: {len(s.items):>3} tests ~ {format_duration(s.total_duration_ms):<9} ({pct:.1f}% load)"
        )

    lines.append("================================================================================\n")
    return "\n".join(lines)
