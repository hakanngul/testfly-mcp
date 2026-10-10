import * as fs from 'fs';
import * as path from 'path';

/** Mirrors io.testfly.agent.ActionType. */
export const ACTION_TYPES = ['NAVIGATE', 'CLICK', 'TYPE', 'CLEAR', 'SELECT', 'HOVER', 'WAIT_VISIBLE', 'PRESS_ENTER'] as const;

export interface ActionStepModel {
    action: string;
    locator: string;
    value?: string;
    description?: string;
}

export interface ActionPlanModel {
    /** Cache key as written by TestFly ("/path::goal"); invalidation targets exactly this entry. */
    key: string;
    goal: string;
    urlPattern?: string;
    steps: ActionStepModel[];
    createdAt: number;
}

export interface ActionCacheSnapshot {
    exists: boolean;
    plans: ActionPlanModel[];
    /** Set when the file exists but cannot be read as an action cache. */
    error?: string;
}

/** Same normalization as io.testfly.agent.ActionCache.buildKey. */
export function buildCacheKey(url: string | undefined, goal: string | undefined): string {
    return `${normalizeUrl(url)}::${(goal ?? '').trim().toLowerCase()}`;
}

function normalizeUrl(url: string | undefined): string {
    if (!url || !url.trim()) return '';
    const absolute = /^[a-z][a-z0-9+.-]*:\/\/[^/?#]*([^?#]*)/i.exec(url);
    const pathPart = absolute ? absolute[1] : url.split(/[?#]/)[0];
    return pathPart.trim() ? pathPart : url;
}

/**
 * TestFly stores `Map<String, ActionPlan>`; older bridge versions wrote a plain array.
 * Both are read; writes always use the map format TestFly loads.
 */
function toEntries(data: unknown): Array<[string, any]> {
    if (Array.isArray(data)) {
        return data.filter(isPlan).map(p => [buildCacheKey(p.urlPattern, p.goal), p]);
    }
    if (data && typeof data === 'object') {
        return Object.entries(data as Record<string, unknown>).filter(([, p]) => isPlan(p)) as Array<[string, any]>;
    }
    throw new Error('expected a JSON object of cached plans');
}

function isPlan(value: unknown): value is { goal: string; urlPattern?: string } {
    return !!value && typeof value === 'object' && typeof (value as any).goal === 'string';
}

export class ActionCacheService {
    public static getCachePath(workspaceRoot: string): string {
        return path.join(workspaceRoot, '.testfly', 'action-cache.json');
    }

    public static exists(workspaceRoot: string): boolean {
        return fs.existsSync(this.getCachePath(workspaceRoot));
    }

    public static read(workspaceRoot: string): ActionCacheSnapshot {
        const filePath = this.getCachePath(workspaceRoot);
        if (!fs.existsSync(filePath)) return { exists: false, plans: [] };
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const plans = toEntries(raw.trim() ? JSON.parse(raw) : {}).map(([key, p]) => ({
                key,
                goal: p.goal,
                urlPattern: p.urlPattern || undefined,
                steps: Array.isArray(p.steps) ? p.steps : [],
                createdAt: typeof p.createdAt === 'number' ? p.createdAt : 0
            }));
            return { exists: true, plans };
        } catch (err: any) {
            return { exists: true, plans: [], error: err.message };
        }
    }

    public static readCache(workspaceRoot: string): ActionPlanModel[] {
        return this.read(workspaceRoot).plans;
    }

    /** Remove one entry by its cache key. Returns false when nothing was removed. */
    public static invalidate(workspaceRoot: string, key: string): boolean {
        return this.remove(workspaceRoot, k => k === key) > 0;
    }

    /** Remove every entry whose goal matches (any URL). Kept for the MCP tool, which addresses plans by goal. */
    public static invalidateGoal(workspaceRoot: string, goal: string): boolean {
        const want = goal.trim().toLowerCase();
        return this.remove(workspaceRoot, (_, p) => String(p.goal).trim().toLowerCase() === want) > 0;
    }

    public static clearAll(workspaceRoot: string): boolean {
        const filePath = this.getCachePath(workspaceRoot);
        if (!fs.existsSync(filePath)) return false;
        try {
            fs.writeFileSync(filePath, '{}\n', 'utf8');
            return true;
        } catch {
            return false;
        }
    }

    private static remove(workspaceRoot: string, match: (key: string, plan: any) => boolean): number {
        const filePath = this.getCachePath(workspaceRoot);
        if (!fs.existsSync(filePath)) return 0;
        try {
            const entries = toEntries(JSON.parse(fs.readFileSync(filePath, 'utf8')));
            const kept = entries.filter(([key, plan]) => !match(key, plan));
            if (kept.length === entries.length) return 0;
            fs.writeFileSync(filePath, JSON.stringify(Object.fromEntries(kept), null, 2) + '\n', 'utf8');
            return entries.length - kept.length;
        } catch {
            return 0;
        }
    }
}
