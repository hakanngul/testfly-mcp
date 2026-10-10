import * as fs from 'fs';
import * as path from 'path';

export interface DiscoveredReports {
    configPath?: string;
    reportingBlock: string;
    htmlReportPath?: string;
    allureResultsDir?: string;
    allureReportHtml?: string;
    reportPortalUrl?: string;
    allureEnabledInConfig: boolean;
    htmlEnabledInConfig: boolean;
}

export type ReportActionKind = 'portal' | 'allure-serve' | 'allure-html' | 'html' | 'none';

export interface ReportAction {
    kind: ReportActionKind;
    target?: string;
}

/**
 * Extracts only the top-level `reporting:` block from testfly.yml.
 *
 * Why not a global `endpoint` regex? Because a global search hits the first
 * `endpoint`/`url`/`baseUrl` key anywhere in the file (execution.baseUrl,
 * selenium grid, etc.). Scoping to the reporting block keeps ReportPortal
 * detection precise without a yaml dependency.
 */
export function getReportingBlock(yaml: string): string {
    const lines = yaml.split(/\r?\n/);
    const startIdx = lines.findIndex((l) => /^\s*reporting\s*:/.test(l));
    if (startIdx === -1) {
        return '';
    }
    const block: string[] = [lines[startIdx]];
    for (let i = startIdx + 1; i < lines.length; i++) {
        const line = lines[i];
        // Blank lines and comments belong to the block; they never end it.
        if (/^\s*(#.*)?$/.test(line)) {
            block.push(line);
            continue;
        }
        // A non-indented, non-comment line starts the next top-level key.
        if (/^[^\s#]/.test(line)) {
            break;
        }
        block.push(line);
    }
    return block.join('\n');
}

function readConfigYaml(root: string): { configPath?: string; content: string } {
    for (const name of ['testfly.yml', 'testfly.yaml']) {
        const p = path.join(root, name);
        try {
            if (fs.existsSync(p)) {
                return { configPath: p, content: fs.readFileSync(p, 'utf8') };
            }
        } catch {
            // ignore and try next candidate
        }
    }
    return { content: '' };
}

/**
 * ReportPortal URL lookup — scoped to the reporting block only.
 * Matches `endpoint:`, `url:`, `dashboardUrl:` or `launchUrl:` with an http(s) value.
 */
export function extractReportPortalUrl(reportingBlock: string): string | undefined {
    if (!reportingBlock) {
        return undefined;
    }
    const m = reportingBlock.match(
        /(?:endpoint|dashboardUrl|launchUrl|url)\s*:\s*['"]?(https?:\/\/[^'"\s#]+)['"]?/i
    );
    if (!m) {
        return undefined;
    }
    return m[1].replace(/[),;]+$/, '');
}

export function isAllureEnabled(reportingBlock: string): boolean {
    if (!reportingBlock || !/allure/i.test(reportingBlock)) {
        return false;
    }
    if (/allure\s*:\s*false/i.test(reportingBlock)) {
        return false;
    }
    return true;
}

export function isHtmlEnabled(reportingBlock: string): boolean {
    // SDK default produces an HTML report; only explicit `false` disables it.
    if (!reportingBlock) {
        return true;
    }
    if (/html\s*:\s*false/i.test(reportingBlock)) {
        return false;
    }
    if (/htmlReport\s*:\s*false/i.test(reportingBlock)) {
        return false;
    }
    return true;
}

export function findHtmlReport(root: string): string | undefined {
    const candidates = [
        'target/testfly-report.html',
        'build/testfly-report.html'
    ];
    for (const c of candidates) {
        const p = path.join(root, c);
        try {
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                return p;
            }
        } catch {
            // ignore
        }
    }
    return undefined;
}

export function findAllureResults(root: string): string | undefined {
    const candidates = [
        'target/allure-results',
        'build/allure-results',
        'allure-results'
    ];
    for (const c of candidates) {
        const p = path.join(root, c);
        try {
            if (fs.existsSync(p) && fs.statSync(p).isDirectory() && fs.readdirSync(p).length > 0) {
                return p;
            }
        } catch {
            // ignore
        }
    }
    return undefined;
}

export function findAllureReportHtml(root: string): string | undefined {
    const candidates = [
        'target/allure-report/index.html',
        'build/allure-report/index.html',
        'allure-report/index.html'
    ];
    for (const c of candidates) {
        const p = path.join(root, c);
        try {
            if (fs.existsSync(p) && fs.statSync(p).isFile()) {
                return p;
            }
        } catch {
            // ignore
        }
    }
    return undefined;
}

export function discoverReports(root: string): DiscoveredReports {
    const { configPath, content } = readConfigYaml(root);
    const reportingBlock = getReportingBlock(content);
    return {
        configPath,
        reportingBlock,
        htmlReportPath: findHtmlReport(root),
        allureResultsDir: findAllureResults(root),
        allureReportHtml: findAllureReportHtml(root),
        reportPortalUrl: extractReportPortalUrl(reportingBlock),
        allureEnabledInConfig: isAllureEnabled(reportingBlock),
        htmlEnabledInConfig: isHtmlEnabled(reportingBlock)
    };
}

/**
 * Priority: ReportPortal link > Allure (serve or generated html) > HTML report.
 * Returns ordered actions so the caller can auto-open a single hit or
 * show a picker when several report targets exist.
 */
export function decideReportActions(d: DiscoveredReports): ReportAction[] {
    const actions: ReportAction[] = [];
    if (d.reportPortalUrl) {
        actions.push({ kind: 'portal', target: d.reportPortalUrl });
    }
    // Allure only makes sense when the config enables it OR raw results exist.
    if (d.allureReportHtml) {
        actions.push({ kind: 'allure-html', target: d.allureReportHtml });
    } else if (d.allureResultsDir && d.allureEnabledInConfig) {
        actions.push({ kind: 'allure-serve', target: d.allureResultsDir });
    } else if (d.allureResultsDir) {
        // Results on disk but no explicit config — still offer serve, after HTML.
        actions.push({ kind: 'allure-serve', target: d.allureResultsDir });
    }
    if (d.htmlReportPath && d.htmlEnabledInConfig) {
        actions.push({ kind: 'html', target: d.htmlReportPath });
    } else if (d.htmlReportPath) {
        actions.push({ kind: 'html', target: d.htmlReportPath });
    }
    return actions;
}
