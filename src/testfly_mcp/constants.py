"""
Shared constants for TestFly MCP.
"""

DEFAULT_TESTFLY_YML = """# TestFly Configuration
execution:
  mode: local
  baseUrl: http://localhost:8080
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
"""
