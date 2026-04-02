// Build a dependency map: nodeId -> [dependencies]
export function buildDependencyMap(edges) {
  const map = {};
  edges.forEach(edge => {
    if (!map[edge.target]) map[edge.target] = [];
    map[edge.target].push(edge.source);
    if (!map[edge.source]) map[edge.source] = [];
  });
  return map;
}

// Build a downstream map: nodeId -> [downstream nodes]
export function buildDownstreamMap(edges) {
  const map = {};
  edges.forEach(edge => {
    if (!map[edge.source]) map[edge.source] = [];
    map[edge.source].push(edge.target);
    if (!map[edge.target]) map[edge.target] = [];
  });
  return map;
}

// Recursively run dependencies, then the node itself
export async function runNodeWithDependencies(
  nodeId,
  runNodeFn,
  dependencyMap,
  nodeStatusMap, // e.g. { nodeId: 'completed' }
  alreadyRun = new Set(),
  path = []
) {
  if (alreadyRun.has(nodeId) || nodeStatusMap[nodeId] === 'completed') return;
  if (path.includes(nodeId)) throw new Error(`Cycle detected: ${[...path, nodeId].join(' -> ')}`);
  const deps = dependencyMap[nodeId] || [];
  for (let i = 0; i < deps.length; i++) {
    const dep = deps[i];
    await runNodeWithDependencies(dep, runNodeFn, dependencyMap, nodeStatusMap, alreadyRun, [...path, nodeId]);
    if (i < deps.length - 1) {
      await new Promise(res => setTimeout(res, 5000)); // 5-second gap between dependencies
    }
  }
  if (deps.length > 0) {
    await new Promise(res => setTimeout(res, 5000)); // 5-second gap before running the node itself
  }
  await runNodeFn(nodeId);
  alreadyRun.add(nodeId);
}

// Recursively reset all downstream nodes
export function getAllDownstreamNodes(
  nodeId,
  downstreamMap,
  visited = new Set()
) {
  if (visited.has(nodeId)) return visited;
  visited.add(nodeId);
  const downstream = downstreamMap[nodeId] || [];
  for (const child of downstream) {
    getAllDownstreamNodes(child, downstreamMap, visited);
  }
  return visited;
} 