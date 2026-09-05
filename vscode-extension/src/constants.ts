export const EXTENSION_ID = 'testfly-mcp';
export const DISPLAY_NAME = 'TestFly MCP';
export const INSTALL_CMD = 'pip install git+https://github.com/hakanngul/testfly-mcp.git';
export const UPGRADE_CMD = 'pip install --upgrade git+https://github.com/hakanngul/testfly-mcp.git';
export const MCP_SERVER_KEY = 'testfly';
export const DOCS_URL = 'https://github.com/hakanngul/testfly-mcp';

export const DEFAULT_TESTFLY_YML = `# TestFly Configuration
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
`;
