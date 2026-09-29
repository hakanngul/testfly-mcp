import { TESTFLY_BRIDGE_TOOLS, McpToolDefinition } from './mcpBridgeServer';

export interface ToolMetadata {
    name: string;
    category: string;
    description: string;
    paramsCount: number;
}

export const TOOLS_DATA: ToolMetadata[] = TESTFLY_BRIDGE_TOOLS.map(t => ({
    name: t.name,
    category: 'TestFly Bridge',
    description: t.description,
    paramsCount: Object.keys(t.inputSchema.properties || {}).length
}));
