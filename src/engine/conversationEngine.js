export function getNode(scenario, nodeId) {
  return scenario.nodes[nodeId];
}

export function isEndNode(scenario, nodeId) {
  if (scenario.endNodes && scenario.endNodes.includes(nodeId)) return true;
  const node = getNode(scenario, nodeId);
  return !node || !node.choices || node.choices.length === 0;
}

// Orders scenarios recency-first (current unit, then older units) so the picker
// surfaces the most relevant roleplay first — same "recent unit primary, older
// mixed in" spirit as spec section 6, applied to which scenario to offer rather
// than random forced selection (a scripted dialogue is something you choose, not draw).
export function orderScenariosByRecency(scenarios, currentUnit) {
  const recent = scenarios.filter((s) => s.unit === currentUnit);
  const older = scenarios.filter((s) => s.unit < currentUnit).sort((a, b) => b.unit - a.unit);
  const newer = scenarios.filter((s) => s.unit > currentUnit).sort((a, b) => a.unit - b.unit);
  return [...recent, ...older, ...newer];
}
