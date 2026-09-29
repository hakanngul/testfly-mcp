export const EXTENSION_ID = 'testfly-vscode';
export const DISPLAY_NAME = 'TestFly Studio';
export const TESTFLY_VERSION = '1.0.6';
export const JAVA_VERSION = '21';
export const DOCS_URL = 'https://hakanngul.github.io/testfly';
export const REPO_URL = 'https://github.com/hakanngul/testfly';

export const DEFAULT_TESTFLY_YML = `# TestFly Configuration v${TESTFLY_VERSION}
execution:
  mode: local
  baseUrl: https://example.com
  parallel: methods
  threadCount: 4
  maxActiveSessions: 4

browser:
  name: chrome
  headless: false
  lifecycle: per-test
  captureConsoleErrors: true
  arguments:
    - --start-maximized
    - --disable-notifications

retry:
  enabled: true
  maxAttempts: 2

timeouts:
  explicit: 10
  pageLoad: 30

reporting:
  html:
    enabled: true
    title: TestFly Test Automation Report
  reportportal:
    enabled: false

ai:
  provider: gemini # gemini | claude | openai | openai-compatible
  model: gemini-2.0-flash
  apiKey: \${AI_API_KEY}
  selfHealing:
    enabled: true
    maxTokensPruned: 8000
    generatePatches: true
`;

export const DEFAULT_POM_XML = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0"
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 http://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>

    <groupId>com.example</groupId>
    <artifactId>testfly-automation</artifactId>
    <version>1.0.0-SNAPSHOT</version>

    <properties>
        <maven.compiler.release>${JAVA_VERSION}</maven.compiler.release>
        <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>
        <testfly.version>${TESTFLY_VERSION}</testfly.version>
    </properties>

    <dependencies>
        <dependency>
            <groupId>io.github.hakanngul</groupId>
            <artifactId>testfly</artifactId>
            <version>\${testfly.version}</version>
        </dependency>
    </dependencies>

    <build>
        <plugins>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-compiler-plugin</artifactId>
                <version>3.11.0</version>
            </plugin>
            <plugin>
                <groupId>org.apache.maven.plugins</groupId>
                <artifactId>maven-surefire-plugin</artifactId>
                <version>3.2.5</version>
            </plugin>
        </plugins>
    </build>
</project>
`;

export const DEFAULT_SMOKE_TEST = `package io.testfly.examples.testng;

import io.testfly.test.BaseTest;
import org.testng.annotations.Test;

public class SmokeTest extends BaseTest {

    @Test
    public void verifyHomePageLoads() {
        open();
        assertThatPage().hasTitle("Example Domain");
    }
}
`;
