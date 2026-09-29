import * as fs from 'fs';
import * as path from 'path';

export interface ActionStepModel {
    action: string;
    locator: string;
    value?: string;
    description?: string;
}

export interface ActionPlanModel {
    goal: string;
    urlPattern?: string;
    steps: ActionStepModel[];
    createdAt: number;
}

export class ActionCacheService {
    public static getCachePath(workspaceRoot: string): string {
        return path.join(workspaceRoot, '.testfly', 'action-cache.json');
    }

    public static exists(workspaceRoot: string): boolean {
        return fs.existsSync(this.getCachePath(workspaceRoot));
    }

    public static readCache(workspaceRoot: string): ActionPlanModel[] {
        const filePath = this.getCachePath(workspaceRoot);
        if (!fs.existsSync(filePath)) {
            return [];
        }
        try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const data = JSON.parse(raw);
            if (Array.isArray(data)) {
                return data;
            }
            if (data && typeof data === 'object') {
                return Object.values(data);
            }
            return [];
        } catch {
            return [];
        }
    }

    public static invalidateGoal(workspaceRoot: string, goal: string): boolean {
        const filePath = this.getCachePath(workspaceRoot);
        if (!fs.existsSync(filePath)) {
            return false;
        }
        try {
            const plans = this.readCache(workspaceRoot);
            const filtered = plans.filter(p => p.goal.trim().toLowerCase() !== goal.trim().toLowerCase());
            fs.writeFileSync(filePath, JSON.stringify(filtered, null, 2), 'utf8');
            return true;
        } catch {
            return false;
        }
    }

    public static clearAll(workspaceRoot: string): boolean {
        const filePath = this.getCachePath(workspaceRoot);
        if (fs.existsSync(filePath)) {
            try {
                fs.writeFileSync(filePath, '[]', 'utf8');
                return true;
            } catch {
                return false;
            }
        }
        return false;
    }
}
