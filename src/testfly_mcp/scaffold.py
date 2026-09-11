"""
TestFly Project Scaffolder (testfly init)
Generates complete, production-ready TestFly test automation projects
for TestNG, JUnit 5, Cucumber BDD, API testing, and Load testing.
"""

from pathlib import Path
from typing import Optional


POM_TEMPLATE_TESTNG = """<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>{group_id}</groupId>
    <artifactId>{artifact_id}</artifactId>
    <version>1.0.0-SNAPSHOT</version>

    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <testfly.version>1.1.0</testfly.version>
        <testng.version>7.9.0</testng.version>
        <surefire.version>3.2.5</surefire.version>
    </properties>

    <dependencies>
        <!-- TestFly Framework Core -->
        <dependency>
            <groupId>io.github.hakanngul</groupId>
            <artifactId>testfly</artifactId>
            <version>${{testfly.version}}</version>
            <scope>test</scope>
        </dependency>

        <!-- TestNG Test Runner -->
        <dependency>
            <groupId>org.testng</groupId>
            <artifactId>testng</artifactId>
            <version>${{testng.version}}</version>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>${{surefire.version}}</version>
                <configuration>
                    <systemPropertyVariables>
                        <!-- Forward testfly profile property if set -->
                        <testfly.profile>${{testfly.profile}}</testfly.profile>
                    </systemPropertyVariables>
                </configuration>
            </plugin>
        </plugins>
    </build>
</project>
"""

POM_TEMPLATE_JUNIT5 = """<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>{group_id}</groupId>
    <artifactId>{artifact_id}</artifactId>
    <version>1.0.0-SNAPSHOT</version>

    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <testfly.version>1.1.0</testfly.version>
        <junit.jupiter.version>5.10.2</junit.jupiter.version>
        <surefire.version>3.2.5</surefire.version>
    </properties>

    <dependencies>
        <!-- TestFly Framework Core -->
        <dependency>
            <groupId>io.github.hakanngul</groupId>
            <artifactId>testfly</artifactId>
            <version>${{testfly.version}}</version>
            <scope>test</scope>
        </dependency>

        <!-- JUnit 5 Jupiter -->
        <dependency>
            <groupId>org.junit.jupiter</groupId>
            <artifactId>junit-jupiter</artifactId>
            <version>${{junit.jupiter.version}}</version>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>${{surefire.version}}</version>
            </plugin>
        </plugins>
    </build>
</project>
"""

POM_TEMPLATE_CUCUMBER = """<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>{group_id}</groupId>
    <artifactId>{artifact_id}</artifactId>
    <version>1.0.0-SNAPSHOT</version>

    <properties>
        <maven.compiler.source>17</maven.compiler.source>
        <maven.compiler.target>17</maven.compiler.target>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <testfly.version>1.1.0</testfly.version>
        <cucumber.version>7.20.1</cucumber.version>
        <testng.version>7.9.0</testng.version>
        <surefire.version>3.2.5</surefire.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>io.github.hakanngul</groupId>
            <artifactId>testfly</artifactId>
            <version>${{testfly.version}}</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>io.cucumber</groupId>
            <artifactId>cucumber-java</artifactId>
            <version>${{cucumber.version}}</version>
            <scope>test</scope>
        </dependency>
        <dependency>
            <groupId>io.cucumber</groupId>
            <artifactId>cucumber-testng</artifactId>
            <version>${{cucumber.version}}</version>
            <scope>test</scope>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>${{surefire.version}}</version>
            </plugin>
        </plugins>
    </build>
</project>
"""

TESTFLY_YML_TEMPLATE = """# TestFly Configuration — https://testfly.io
execution:
  mode: local
  baseUrl: {base_url}
  parallel: none       # none | tests | methods | classes
  threadCount: 2

browser:
  name: chrome         # chrome | firefox | edge | safari
  headless: false      # true for CI/CD environments
  arguments:
    - "--start-maximized"
    - "--disable-dev-shm-usage"
  lifecycle: per-test  # per-test | per-suite

timeouts:
  explicit: 10         # Auto-waiting timeout in seconds
  pageLoad: 30

reporting:
  html:
    enabled: true
    outputDir: target/testfly-reports
  allure:
    enabled: true

retry:
  enabled: true
  maxAttempts: 2
"""

GITIGNORE_TEMPLATE = """target/
*.log
testfly-reports/
allure-results/
allure-report/
.DS_Store
.idea/
*.iml
.vscode/
"""

README_TEMPLATE = """# {project_name}

An automated testing suite powered by **[TestFly](https://github.com/hakanngul/testfly)**.

## Quick Start

### 1. Run Tests
```bash
# Run all tests headfully
mvn test

# Run tests headlessly (recommended for CI/CD)
mvn test -Dtestfly.browser.headless=true

# Run with a specific environment profile (loads testfly-staging.yml)
mvn test -Dtestfly.profile=staging
```

### 2. View HTML Report
After execution, open the generated interactive report:
```bash
open target/testfly-reports/index.html
```

### 3. Project Structure
```
{project_name}/
├── pom.xml               # Maven configuration & TestFly dependencies
├── testfly.yml           # Central TestFly settings (browsers, timeouts, reports)
└── src/test/java/        # Test classes and Page Objects
```
"""

SAMPLE_TESTNG_WEB_TEST = """package {package_name}.tests;

import io.testfly.test.BaseTest;
import org.testng.annotations.Test;

public class SampleWebTest extends BaseTest {{

    @Test(description = "Verify landing page loads and main heading is visible")
    public void testLandingPageHeading() {{
        // Navigates to baseUrl defined in testfly.yml
        open("/");

        // TestFly web-first assertions with auto-wait
        assertThat(find("body")).isVisible();
    }}
}}
"""

SAMPLE_JUNIT5_WEB_TEST = """package {package_name}.tests;

import io.testfly.junit5.BaseJUnit5Test;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

public class SampleWebTest extends BaseJUnit5Test {{

    @Test
    @DisplayName("Verify landing page loads and main heading is visible")
    void testLandingPageHeading() {{
        open("/");
        assertThat(find("body")).isVisible();
    }}
}}
"""

SAMPLE_API_TEST = """package {package_name}.tests;

import io.testfly.test.BaseApiTest;
import io.testfly.client.ApiResponse;
import org.testng.annotations.Test;

public class SampleApiTest extends BaseApiTest {{

    @Test(description = "Verify public API returns 200 OK")
    public void testApiHealthCheck() {{
        ApiResponse response = apiClient().get("/api/health")
            .send();

        // Fluent assertions on status and headers
        response.assertStatus(200);
    }}
}}
"""

SAMPLE_HYBRID_TEST = """package {package_name}.tests;

import io.testfly.test.BaseTest;
import io.testfly.client.ApiResponse;
import org.testng.annotations.Test;
import java.util.Map;

public class SampleHybridTest extends BaseTest {{

    @Test(description = "Seed user session via API and verify profile in WebUI")
    public void testApiSeedingAndBrowserValidation() {{
        // 1. Fast backend setup via ApiClient
        // ApiResponse res = apiClient().post("/api/auth/login")
        //     .body(Map.of("username", "admin", "password", "secret"))
        //     .send()
        //     .assertStatus(200);

        // 2. Open browser directly to target page
        open("/");
        assertThat(find("body")).isVisible();
    }}
}}
"""


def scaffold_project(
    target_dir: Path,
    project_name: str = "my-testfly-suite",
    framework: str = "testng",
    test_type: str = "web",
    group_id: str = "com.example",
    artifact_id: Optional[str] = None,
    base_url: str = "https://example.com",
) -> Path:
    """Scaffolds a complete TestFly project."""
    target_dir.mkdir(parents=True, exist_ok=True)
    clean_name = target_dir.resolve().name if project_name in (".", "") else project_name
    art_id = artifact_id or clean_name.lower().replace(" ", "-").replace("_", "-")
    pkg_name = f"{group_id}.{art_id.replace('-', '_')}"
    pkg_path = pkg_name.replace(".", "/")

    # 1. pom.xml
    if framework == "junit5":
        pom_content = POM_TEMPLATE_JUNIT5.format(group_id=group_id, artifact_id=art_id)
    elif framework == "cucumber":
        pom_content = POM_TEMPLATE_CUCUMBER.format(group_id=group_id, artifact_id=art_id)
    else:
        pom_content = POM_TEMPLATE_TESTNG.format(group_id=group_id, artifact_id=art_id)

    (target_dir / "pom.xml").write_text(pom_content, encoding="utf-8")

    # 2. testfly.yml
    yml_content = TESTFLY_YML_TEMPLATE.format(base_url=base_url)
    (target_dir / "testfly.yml").write_text(yml_content, encoding="utf-8")

    # 3. .gitignore
    (target_dir / ".gitignore").write_text(GITIGNORE_TEMPLATE, encoding="utf-8")

    # 4. README.md
    readme_content = README_TEMPLATE.format(project_name=clean_name)
    (target_dir / "README.md").write_text(readme_content, encoding="utf-8")

    # 5. Java test directories
    java_test_dir = target_dir / "src" / "test" / "java" / pkg_path / "tests"
    java_test_dir.mkdir(parents=True, exist_ok=True)

    # 6. Sample Test
    if test_type == "api":
        sample_code = SAMPLE_API_TEST.format(package_name=pkg_name)
        (java_test_dir / "SampleApiTest.java").write_text(sample_code, encoding="utf-8")
    elif test_type == "hybrid":
        sample_code = SAMPLE_HYBRID_TEST.format(package_name=pkg_name)
        (java_test_dir / "SampleHybridTest.java").write_text(sample_code, encoding="utf-8")
    else:
        if framework == "junit5":
            sample_code = SAMPLE_JUNIT5_WEB_TEST.format(package_name=pkg_name)
        else:
            sample_code = SAMPLE_TESTNG_WEB_TEST.format(package_name=pkg_name)
        (java_test_dir / "SampleWebTest.java").write_text(sample_code, encoding="utf-8")

    return target_dir
