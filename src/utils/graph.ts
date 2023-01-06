import { assert } from 'console';

/* eslint-disable @typescript-eslint/no-non-null-assertion */
export type GraphVertex = string;

export interface GraphEdge {
  from: GraphVertex;
  to: GraphVertex;
  distance: number;
}

export class DMGraph<Edge extends GraphEdge> {
  private connections: Map<GraphVertex, Edge[]> = new Map();
  private edgeCount = 0;

  getEdgeCount(): number {
    return this.edgeCount;
  }

  addEdge(edge: Edge): void {
    this.edgeCount++;

    const fromConnections = this.connections.get(edge.from);
    if (fromConnections === undefined) {
      this.connections.set(edge.from, [edge]);
    } else {
      fromConnections.push(edge);
    }

    const toConnections = this.connections.get(edge.to);
    if (toConnections === undefined) {
      this.connections.set(edge.to, []);
    }
  }

  getEdge(from: GraphVertex, to: GraphVertex): Edge | undefined {
    return this.connections.get(from)?.find(x => x.to === to);
  }

  getAllVertices(): GraphVertex[] {
    return Array.from(this.connections.keys());
  }

  getVertexEdges(v: GraphVertex): Edge[] {
    const vConnections = this.connections.get(v);
    if (vConnections === undefined) {
      throw new Error('Requested vertex does not exist');
    }
    return vConnections;
  }
}

export const bellmanFord = <Edge extends GraphEdge>(
  graph: DMGraph<Edge>,
  startVertex: GraphVertex
):
  | {
      hasNegativeCycle: false;
      distances: Map<GraphVertex, number>;
    }
  | {
      hasNegativeCycle: true;
      negativeCycle: GraphVertex[];
    } => {
  const distances = new Map<GraphVertex, number>();
  const parents = new Map<GraphVertex, GraphVertex>();

  // set initial distances
  const allVertices = graph.getAllVertices();
  allVertices.forEach(v => {
    distances.set(v, Infinity);
  });
  distances.set(startVertex, 0);

  for (let i = 0; i < allVertices.length - 1; i++) {
    for (const u of allVertices) {
      for (const vEdge of graph.getVertexEdges(u)) {
        const v = vEdge.to;
        const weight = vEdge.distance;
        assert(u === vEdge.from, 'bad');
        if (distances.get(u)! + weight < distances.get(v)!) {
          distances.set(v, distances.get(u)! + weight);
          parents.set(v, u);
        }
      }
    }
  }

  console.log('distances', distances);

  for (let index = 0; index < allVertices.length; index++) {
    const v = allVertices[index];
    const vEdges = graph.getVertexEdges(v);
    for (let uIndex = 0; uIndex < vEdges.length; uIndex++) {
      const u = vEdges[uIndex].to;
      const w = vEdges[uIndex].distance;
      if (distances.get(v)! > distances.get(u)! + w) {
        let cycleStart = v;
        for (let i = 0; i < graph.getEdgeCount(); i++) {
          cycleStart = parents.get(cycleStart)!;
        }

        if (cycleStart === undefined) {
          break;
        }

        const negativeCycle: GraphVertex[] = [];
        let t: GraphVertex | undefined = cycleStart;
        while (t && (t !== cycleStart || negativeCycle.length === 0)) {
          negativeCycle.push(t);
          t = parents.get(t);
        }

        negativeCycle.reverse();

        return {
          hasNegativeCycle: true,
          negativeCycle
        };
      }
    }
  }

  return {
    hasNegativeCycle: false,
    distances
  };
};
