// Studio diagram (rule 17): the diagram is diagram-studio/1 data, looked up BY NAME (its id), never hand-built in a component.
// The data lives in studio-data/pf-array-claims-flow.json with a sha256 pin; re-vendor, never edit.
import pfArrayClaimsFlow from "./studio-data/pf-array-claims-flow.json";

const DIAGRAMS = { [pfArrayClaimsFlow.id]: pfArrayClaimsFlow };

export function getDiagram(id) {
  if (!Object.hasOwn(DIAGRAMS, id)) throw new Error(`unknown diagram "${id}"; known: ${Object.keys(DIAGRAMS).join(", ")}`);
  return DIAGRAMS[id];
}

// The edge between two nodes, by their ids, so reordering the data's edges never colours the wrong arrow.
export function edgeIndex(diagram, source, target) {
  const i = diagram.edges.findIndex((e) => e.source === source && e.target === target);
  if (i < 0) throw new Error(`no edge from ${source} to ${target} in diagram "${diagram.id}"`);
  return i;
}
