export interface TestDurationItem {
    className: string;
    durationMs: number;
}

export interface ShardResult {
    nodeIndex: number;
    totalNodes: number;
    tests: string[];
    totalDurationMs: number;
    makespanMs: number;
}

export class SharderService {
    /**
     * Longest Processing Time (LPT) Bin-Packing Algorithm
     */
    public static shard(items: TestDurationItem[], totalNodes: number, targetNodeIndex: number): ShardResult {
        if (totalNodes <= 0) totalNodes = 1;
        if (targetNodeIndex < 0 || targetNodeIndex >= totalNodes) targetNodeIndex = 0;

        // Sort descending by duration
        const sorted = [...items].sort((a, b) => b.durationMs - a.durationMs);

        // Nodes buckets
        const nodes: { tests: string[]; totalMs: number }[] = Array.from({ length: totalNodes }, () => ({
            tests: [],
            totalMs: 0
        }));

        for (const item of sorted) {
            // Find bucket with minimal total time
            let minIndex = 0;
            let minVal = nodes[0].totalMs;
            for (let i = 1; i < totalNodes; i++) {
                if (nodes[i].totalMs < minVal) {
                    minVal = nodes[i].totalMs;
                    minIndex = i;
                }
            }
            nodes[minIndex].tests.push(item.className);
            nodes[minIndex].totalMs += item.durationMs;
        }

        const makespanMs = Math.max(...nodes.map(n => n.totalMs));
        const targetNode = nodes[targetNodeIndex];

        return {
            nodeIndex: targetNodeIndex,
            totalNodes,
            tests: targetNode.tests,
            totalDurationMs: targetNode.totalMs,
            makespanMs
        };
    }
}
