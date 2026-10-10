import type { Scalar } from './yamlFields';

/**
 * Fields the visual testfly.yml editor offers, grouped the way people configure a suite.
 * Keys, allowed values and defaults follow io.testfly.config.TestFlyConfig / ConfigurationLoader;
 * anything not listed here stays untouched in the YAML.
 */
export type FieldType = 'select' | 'text' | 'number' | 'boolean';

export interface Field {
    path: string[];
    label: string;
    type: FieldType;
    options?: string[];
    /** One sentence on what the setting does. */
    description?: string;
    /** Shown as "e.g. …" and as the input placeholder. */
    example?: string;
    /** Value TestFly uses when the key is absent. */
    fallback?: Scalar;
    /** Holds a credential: should reference an environment variable, not the literal secret. */
    secret?: boolean;
    /** Only shown when another field has one of these values (or is set, when `equals` is omitted). */
    when?: { key: string; equals?: Scalar[] };
}

export interface Section {
    id: string;
    title: string;
    description: string;
    fields: Field[];
}

export interface Problem {
    /** Dotted field key the problem belongs to; undefined for file-level problems. */
    key?: string;
    level: 'error' | 'warning';
    message: string;
}

export const SECTIONS: Section[] = [
    {
        id: 'basics',
        title: 'Basics',
        description: 'Where tests run, which site they open and which browser drives it.',
        fields: [
            { path: ['execution', 'mode'], label: 'Run mode', type: 'select', options: ['local', 'remote', 'browserstack', 'saucelabs'], description: 'local starts a browser on this machine; remote uses a Selenium Grid; browserstack and saucelabs use those clouds. Required.' },
            { path: ['execution', 'baseUrl'], label: 'Base URL', type: 'text', example: 'https://staging.example.com', description: 'open("/login") is resolved against this. ${ENV_VAR} placeholders are supported.' },
            { path: ['execution', 'gridUrl'], label: 'Grid URL', type: 'text', example: 'http://localhost:4444/wd/hub', description: 'Selenium Grid hub address.', when: { key: 'execution.mode', equals: ['remote'] } },
            { path: ['execution', 'browserstack', 'username'], label: 'BrowserStack user', type: 'text', example: '${BROWSERSTACK_USERNAME}', secret: true, when: { key: 'execution.mode', equals: ['browserstack'] } },
            { path: ['execution', 'browserstack', 'accessKey'], label: 'BrowserStack access key', type: 'text', example: '${BROWSERSTACK_ACCESS_KEY}', secret: true, when: { key: 'execution.mode', equals: ['browserstack'] } },
            { path: ['execution', 'saucelabs', 'username'], label: 'Sauce Labs user', type: 'text', example: '${SAUCE_USERNAME}', secret: true, when: { key: 'execution.mode', equals: ['saucelabs'] } },
            { path: ['execution', 'saucelabs', 'accessKey'], label: 'Sauce Labs access key', type: 'text', example: '${SAUCE_ACCESS_KEY}', secret: true, when: { key: 'execution.mode', equals: ['saucelabs'] } },
            { path: ['execution', 'saucelabs', 'region'], label: 'Sauce Labs region', type: 'select', options: ['us-west-1', 'eu-central', 'apac-southeast'], fallback: 'us-west-1', when: { key: 'execution.mode', equals: ['saucelabs'] } },
            { path: ['browser', 'name'], label: 'Browser', type: 'select', options: ['chrome', 'firefox', 'edge', 'safari'], description: 'Required unless browser.matrix lists several browsers.' },
            { path: ['browser', 'headless'], label: 'Headless', type: 'boolean', fallback: false, description: 'Run without a visible window. Usually on in CI, off while writing tests.' }
        ]
    },
    {
        id: 'timing',
        title: 'Timeouts & retries',
        description: 'How long TestFly waits, and whether failed tests are tried again.',
        fields: [
            { path: ['timeouts', 'explicit'], label: 'Element wait (s)', type: 'number', example: '10', description: 'Maximum wait for an element to become ready. Required, greater than 0.' },
            { path: ['timeouts', 'pageLoad'], label: 'Page load (s)', type: 'number', example: '30', description: 'Maximum wait for a page to finish loading. Required, greater than 0.' },
            { path: ['retry', 'enabled'], label: 'Retry failed tests', type: 'boolean', fallback: true },
            { path: ['retry', 'maxAttempts'], label: 'Retry attempts', type: 'number', fallback: 1, description: 'Extra attempts after the first failure.', when: { key: 'retry.enabled', equals: [true] } }
        ]
    },
    {
        id: 'parallel',
        title: 'Parallel execution',
        description: 'Run tests side by side to finish faster.',
        fields: [
            { path: ['execution', 'parallel'], label: 'Parallel', type: 'select', options: ['none', 'methods', 'classes', 'tests', 'instances'], fallback: 'none', description: 'What runs concurrently. methods is the most parallel; classes keeps each class on one thread.' },
            { path: ['execution', 'threadCount'], label: 'Threads', type: 'number', fallback: 1, description: 'Between 1 and CPU cores × 2.' },
            { path: ['execution', 'maxActiveSessions'], label: 'Max browser sessions', type: 'number', fallback: 5, description: 'Upper bound on browsers open at the same time.' },
            { path: ['browser', 'lifecycle'], label: 'Browser lifecycle', type: 'select', options: ['per-test', 'per-suite'], fallback: 'per-test', description: 'per-test isolates tests; per-suite reuses one browser and is faster.' }
        ]
    },
    {
        id: 'api',
        title: 'API testing',
        description: 'Defaults for the built-in REST client.',
        fields: [
            { path: ['api', 'baseUrl'], label: 'API base URL', type: 'text', example: 'https://api.example.com', description: 'Relative request paths are resolved against this.' },
            { path: ['api', 'timeoutSeconds'], label: 'Request timeout (s)', type: 'number', fallback: 30 },
            { path: ['api', 'logBody'], label: 'Log response bodies', type: 'boolean', fallback: false, description: 'Adds bodies to step logs. Leave off for large or sensitive payloads.' }
        ]
    },
    {
        id: 'reports',
        title: 'Reports',
        description: 'What TestFly produces after a run.',
        fields: [
            { path: ['reporting', 'htmlReport'], label: 'HTML report', type: 'boolean', fallback: true, description: 'Writes target/testfly-report.html.' },
            { path: ['reporting', 'screenshotOnFailure'], label: 'Screenshot on failure', type: 'boolean', fallback: true },
            { path: ['reporting', 'allure', 'enabled'], label: 'Allure results', type: 'boolean', fallback: false, description: 'Writes target/allure-results for Allure.' },
            { path: ['reporting', 'reportPortal', 'enabled'], label: 'ReportPortal', type: 'boolean', fallback: false },
            { path: ['reporting', 'reportPortal', 'endpoint'], label: 'ReportPortal URL', type: 'text', example: 'https://reportportal.example.com', when: { key: 'reporting.reportPortal.enabled', equals: [true] } },
            { path: ['reporting', 'reportPortal', 'project'], label: 'ReportPortal project', type: 'text', example: 'my_project', when: { key: 'reporting.reportPortal.enabled', equals: [true] } },
            { path: ['reporting', 'reportPortal', 'apiKey'], label: 'ReportPortal API key', type: 'text', example: '${RP_API_KEY}', secret: true, when: { key: 'reporting.reportPortal.enabled', equals: [true] } }
        ]
    },
    {
        id: 'ai',
        title: 'AI & self-healing',
        description: 'Optional AI features. They need a provider and an API key.',
        fields: [
            { path: ['ai', 'enabled'], label: 'AI features', type: 'boolean', fallback: true, description: 'Master switch for everything in this section.' },
            { path: ['ai', 'provider'], label: 'Provider', type: 'select', options: ['claude', 'gemini', 'openai', 'openai-compatible'], fallback: 'claude' },
            { path: ['ai', 'apiKey'], label: 'API key', type: 'text', example: '${ANTHROPIC_API_KEY}', secret: true, description: 'Reference an environment variable or .env entry so the key never lands in Git.' },
            { path: ['ai', 'model'], label: 'Model', type: 'text', description: 'Leave empty for the provider default.' },
            { path: ['ai', 'baseUrl'], label: 'Provider URL', type: 'text', example: 'http://localhost:11434', description: 'Endpoint of an OpenAI-compatible server.', when: { key: 'ai.provider', equals: ['openai-compatible'] } },
            { path: ['ai', 'failureAnalysis'], label: 'Explain failures', type: 'boolean', fallback: false, description: 'The AI explains why a test failed; shown in reports and the patch reviewer.' },
            { path: ['ai', 'generatePatch'], label: 'Suggest fixes (patches)', type: 'boolean', fallback: false, description: 'Writes target/remediations/<test>.patch for review in TestFly Studio.' },
            { path: ['locators', 'selfHealing'], label: 'Self-healing locators', type: 'boolean', fallback: false, description: 'Tries alternative locators when one stops matching. Works without AI.' },
            { path: ['locators', 'aiHealing'], label: 'AI locator healing', type: 'boolean', fallback: false, description: 'Asks the AI for a new locator when self-healing finds none.' }
        ]
    }
];

export const FIELDS: Field[] = SECTIONS.flatMap(s => s.fields);

export const fieldKey = (field: Field): string => field.path.join('.');

const isEnvReference = (value: unknown): boolean => typeof value === 'string' && /^\$\{[^}]+\}$/.test(value.trim());

/** Rules TestFly enforces at startup (errors) plus settings that would silently do nothing (warnings). */
export function validate(values: Record<string, Scalar | undefined>): Problem[] {
    const problems: Problem[] = [];
    const error = (key: string | undefined, message: string) => problems.push({ key, level: 'error', message });
    const warn = (key: string | undefined, message: string) => problems.push({ key, level: 'warning', message });
    const effective = (key: string): Scalar | undefined => values[key] ?? FIELDS.find(f => fieldKey(f) === key)?.fallback;

    const mode = values['execution.mode'];
    if (!mode) error('execution.mode', 'Choose where tests run. TestFly will not start without it.');
    else if (!['local', 'remote', 'browserstack', 'saucelabs'].includes(String(mode))) error('execution.mode', `"${mode}" is not a run mode TestFly knows.`);
    if (mode === 'remote' && !values['execution.gridUrl']) error('execution.gridUrl', 'Remote mode needs the Selenium Grid address.');
    for (const cloud of ['browserstack', 'saucelabs']) {
        if (mode !== cloud) continue;
        for (const part of ['username', 'accessKey']) {
            const key = `execution.${cloud}.${part}`;
            if (!values[key]) error(key, 'Required for this run mode.');
        }
    }

    if (!values['browser.name']) error('browser.name', 'Choose a browser (or define browser.matrix in the YAML).');

    for (const key of ['timeouts.explicit', 'timeouts.pageLoad']) {
        const v = values[key];
        if (typeof v !== 'number' || v <= 0) error(key, 'Required. Enter a number of seconds greater than 0.');
    }

    const baseUrl = values['execution.baseUrl'];
    if (typeof baseUrl === 'string' && !/^(https?:\/\/|\$\{)/i.test(baseUrl)) warn('execution.baseUrl', 'Start with http:// or https:// so relative paths resolve.');

    const threads = values['execution.threadCount'];
    if (threads !== undefined && (typeof threads !== 'number' || !Number.isInteger(threads) || threads < 1)) error('execution.threadCount', 'Use a whole number of at least 1.');
    else if (typeof threads === 'number' && threads > 1 && effective('execution.parallel') === 'none') warn('execution.threadCount', 'Has no effect while Parallel is "none".');

    const attempts = values['retry.maxAttempts'];
    if (attempts !== undefined && (typeof attempts !== 'number' || attempts < 0)) error('retry.maxAttempts', 'Use 0 or a positive number.');

    const sessions = values['execution.maxActiveSessions'];
    if (sessions !== undefined && (typeof sessions !== 'number' || sessions < 1)) error('execution.maxActiveSessions', 'Use a whole number of at least 1.');

    if (effective('reporting.reportPortal.enabled') === true && !values['reporting.reportPortal.endpoint']) {
        error('reporting.reportPortal.endpoint', 'ReportPortal is on but has no URL.');
    }

    const aiFeatures = ['ai.failureAnalysis', 'ai.generatePatch', 'locators.aiHealing'].filter(k => values[k] === true);
    if (aiFeatures.length) {
        if (effective('ai.enabled') === false) {
            warn('ai.enabled', 'AI features are switched off, so failure analysis, patches and AI healing will not run.');
        } else if (!values['ai.apiKey']) {
            warn('ai.apiKey', 'AI features are on but no API key is set, so they are skipped silently.');
        }
    }
    if (effective('ai.provider') === 'openai-compatible' && !values['ai.baseUrl']) error('ai.baseUrl', 'An OpenAI-compatible provider needs its URL.');

    for (const field of FIELDS.filter(f => f.secret)) {
        const value = values[fieldKey(field)];
        if (value && !isEnvReference(value)) {
            warn(fieldKey(field), `This looks like a literal secret. Use ${field.example ?? '${ENV_VAR}'} and keep the value in your environment or .env.`);
        }
    }
    return problems;
}

/** Starter snippets for the editor's usage guide. */
export const EXAMPLES: Array<{ title: string; description: string; yaml: string }> = [
    {
        title: 'Local Chrome',
        description: 'Write and debug tests on your machine.',
        yaml: `execution:
  mode: local
  baseUrl: https://staging.example.com
browser:
  name: chrome
  headless: false
timeouts:
  explicit: 10
  pageLoad: 30`
    },
    {
        title: 'Selenium Grid in CI',
        description: 'Headless, four threads, one retry.',
        yaml: `execution:
  mode: remote
  gridUrl: \${GRID_URL}
  baseUrl: \${BASE_URL}
  parallel: methods
  threadCount: 4
browser:
  name: chrome
  headless: true
retry:
  enabled: true
  maxAttempts: 1`
    },
    {
        title: 'AI self-healing',
        description: 'Explain failures and suggest patches for review.',
        yaml: `ai:
  enabled: true
  provider: claude
  apiKey: \${ANTHROPIC_API_KEY}
  failureAnalysis: true
  generatePatch: true
locators:
  selfHealing: true
  aiHealing: true`
    }
];
