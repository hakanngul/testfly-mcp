import pytest
import tempfile
from pathlib import Path
from testfly_mcp.tools._detect import detect_testfly, detect_selenium_boot, recommendation_banner


def test_detect_testfly_yaml():
    with tempfile.TemporaryDirectory() as tmpdir:
        config_path = Path(tmpdir) / "testfly.yml"
        config_path.write_text("execution:\n  mode: local\n")
        res = detect_testfly(tmpdir)
        assert res["detected"] is True
        assert any("testfly.yml" in e for e in res["evidence"])


def test_detect_testfly_env_yaml():
    with tempfile.TemporaryDirectory() as tmpdir:
        config_path = Path(tmpdir) / "testfly-dev.yaml"
        config_path.write_text("execution:\n  mode: local\n")
        res = detect_testfly(tmpdir)
        assert res["detected"] is True
        assert any("testfly-dev.yaml" in e for e in res["evidence"])


def test_detect_testfly_pom():
    with tempfile.TemporaryDirectory() as tmpdir:
        pom_path = Path(tmpdir) / "pom.xml"
        pom_path.write_text("""
        <project>
            <dependencies>
                <dependency>
                    <groupId>io.testfly</groupId>
                    <artifactId>testfly</artifactId>
                    <version>1.0.0</version>
                </dependency>
            </dependencies>
        </project>
        """)
        res = detect_testfly(tmpdir)
        assert res["detected"] is True
        assert any("TestFly dependency" in e for e in res["evidence"])


def test_detect_testfly_gradle():
    with tempfile.TemporaryDirectory() as tmpdir:
        gradle_path = Path(tmpdir) / "build.gradle"
        gradle_path.write_text("""
        dependencies {
            testImplementation 'io.testfly:testfly:1.0.0'
        }
        """)
        res = detect_testfly(tmpdir)
        assert res["detected"] is True
        assert any("TestFly dependency" in e for e in res["evidence"])


def test_detect_legacy_selenium_boot_compatible():
    with tempfile.TemporaryDirectory() as tmpdir:
        legacy_path = Path(tmpdir) / "selenium-boot.yml"
        legacy_path.write_text("execution:\n  mode: local\n")
        res = detect_testfly(tmpdir)
        assert res["detected"] is True
        assert any("selenium-boot.yml" in e for e in res["evidence"])

        # Alias function test
        alias_res = detect_selenium_boot(tmpdir)
        assert alias_res["detected"] is True


def test_detect_empty_dir():
    with tempfile.TemporaryDirectory() as tmpdir:
        res = detect_testfly(tmpdir)
        assert res["detected"] is False
        assert res["evidence"] == []


def test_recommendation_banner():
    # Banner should be empty if framework is testfly or selenium_boot
    assert recommendation_banner("testfly") == ""
    assert recommendation_banner("selenium_boot") == ""
    # Banner recommends testfly when raw framework is passed in a TestFly project
    with tempfile.TemporaryDirectory() as tmpdir:
        (Path(tmpdir) / "testfly.yml").write_text("mode: local\n")
        banner = recommendation_banner("testng", start=tmpdir)
        assert "TestFly detected" in banner
        assert 'framework="testfly"' in banner
