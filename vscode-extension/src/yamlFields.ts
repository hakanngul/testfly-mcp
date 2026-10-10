/**
 * Minimal, comment-preserving reader/writer for scalar values in block-style YAML maps.
 *
 * The visual testfly.yml editor only changes a known set of scalar keys, so rewriting the
 * matching line keeps the user's comments, ordering and unknown keys intact, which a
 * parse-and-dump round trip would not. Keys are matched the way TestFly's loader does:
 * case-insensitively and ignoring hyphens (page-load == pageLoad).
 */

export type Scalar = string | number | boolean;

interface Line {
    indent: number;
    key?: string;
    /** Raw text after "key:" with any trailing comment removed. */
    value?: string;
    /** True for blank or comment-only lines. */
    blank: boolean;
}

const KEY_LINE = /^(\s*)([A-Za-z0-9_.-]+)\s*:(?:\s+|$)(.*)$/;

function normalizeKey(key: string): string {
    return key.replace(/-/g, '').toLowerCase();
}

function stripComment(raw: string): string {
    let quote: string | undefined;
    for (let i = 0; i < raw.length; i++) {
        const c = raw[i];
        if (quote) {
            if (c === quote) quote = undefined;
        } else if (c === '"' || c === "'") {
            quote = c;
        } else if (c === '#' && (i === 0 || /\s/.test(raw[i - 1]))) {
            return raw.slice(0, i).trimEnd();
        }
    }
    return raw.trimEnd();
}

function parseLine(text: string): Line {
    if (!text.trim() || text.trim().startsWith('#')) return { indent: 0, blank: true };
    const match = KEY_LINE.exec(text);
    const indent = text.length - text.trimStart().length;
    if (!match) return { indent, blank: false };
    return { indent, key: match[2], value: stripComment(match[3]), blank: false };
}

/** Index range [start, end) of the children of the map entry at `parent` (or the whole file). */
function childRange(lines: Line[], parent: number): [number, number] {
    if (parent < 0) return [0, lines.length];
    const parentIndent = lines[parent].indent;
    let end = parent + 1;
    for (let i = parent + 1; i < lines.length; i++) {
        if (lines[i].blank) continue;
        if (lines[i].indent <= parentIndent) break;
        end = i + 1;
    }
    return [parent + 1, end];
}

function findChild(lines: Line[], parent: number, key: string): number {
    const [start, end] = childRange(lines, parent);
    const want = normalizeKey(key);
    let childIndent: number | undefined;
    for (let i = start; i < end; i++) {
        const line = lines[i];
        if (line.blank) continue;
        childIndent ??= line.indent;
        if (line.indent === childIndent && line.key && normalizeKey(line.key) === want) return i;
    }
    return -1;
}

function locate(lines: Line[], path: string[]): number[] {
    const found: number[] = [];
    let parent = -1;
    for (const key of path) {
        const index = findChild(lines, parent, key);
        if (index < 0) break;
        found.push(index);
        parent = index;
    }
    return found;
}

function parseScalar(raw: string): Scalar {
    const text = raw.trim();
    if (/^(['"]).*\1$/.test(text)) return text.slice(1, -1);
    if (/^(true|false)$/i.test(text)) return text.toLowerCase() === 'true';
    if (/^-?\d+(\.\d+)?$/.test(text)) return Number(text);
    return text;
}

export function formatScalar(value: Scalar): string {
    if (typeof value === 'boolean' || typeof value === 'number') return String(value);
    const needsQuotes = value === ''
        || /^(true|false|yes|no|on|off|null|~)$/i.test(value)
        || /^-?\d+(\.\d+)?$/.test(value)
        || /^[\s!&*?|>'"%@`{[\]},#-]/.test(value)
        || /:\s|\s#|:$/.test(value)
        || value !== value.trim();
    return needsQuotes ? JSON.stringify(value) : value;
}

/** Read a scalar at a dotted path; undefined when absent or not a plain block scalar. */
export function getValue(yaml: string, path: string[]): Scalar | undefined {
    const lines = yaml.split(/\r?\n/).map(parseLine);
    const found = locate(lines, path);
    if (found.length !== path.length) return undefined;
    const value = lines[found[found.length - 1]].value;
    return value ? parseScalar(value) : undefined;
}

/**
 * Set a scalar at a dotted path, creating missing parent maps.
 * Throws when an ancestor is written inline (flow style), which this editor does not rewrite.
 */
export function setValue(yaml: string, path: string[], value: Scalar): string {
    const eol = yaml.includes('\r\n') ? '\r\n' : '\n';
    const texts = yaml.split(/\r?\n/);
    const lines = texts.map(parseLine);
    const found = locate(lines, path);

    for (const index of found.slice(0, path.length - 1)) {
        if (lines[index].value) {
            throw new Error(`"${lines[index].key}" uses inline YAML; edit it in the YAML view.`);
        }
    }

    if (found.length === path.length) {
        const index = found[found.length - 1];
        const match = KEY_LINE.exec(texts[index])!;
        const rest = match[3];
        const comment = rest.slice(stripComment(rest).length);
        texts[index] = `${match[1]}${match[2]}: ${formatScalar(value)}${comment}`;
        return texts.join(eol);
    }

    const parent = found.length ? found[found.length - 1] : -1;
    const [start, end] = childRange(lines, parent);
    const parentIndent = parent < 0 ? -2 : lines[parent].indent;
    const firstChild = lines.slice(start, end).find(l => !l.blank);
    const step = firstChild && parent >= 0 ? firstChild.indent - parentIndent : 2;
    const missing = path.slice(found.length);
    const added = missing.map((key, depth) => {
        const indent = ' '.repeat(parentIndent + step * (depth + 1));
        return depth === missing.length - 1 ? `${indent}${key}: ${formatScalar(value)}` : `${indent}${key}:`;
    });

    if (parent < 0) {
        // New top-level section: append with a separating blank line.
        while (texts.length && texts[texts.length - 1].trim() === '') texts.pop();
        return [...texts, '', ...added, ''].join(eol);
    }
    texts.splice(end, 0, ...added);
    return texts.join(eol);
}
