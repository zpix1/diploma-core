export type GraphVertex = string;

export interface GraphEdge {
  from: GraphVertex;
  to: GraphVertex;
  distance: number;
}

export class DMGraph<Edge extends GraphEdge> {
  private connections: Map<GraphVertex, Edge[]> = new Map();

  addEdge(edge: Edge) {
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
) => {
  const distances = new Map<GraphVertex, number>();
  const parents = new Map<GraphVertex, GraphVertex>();

  // set initial distances
  const allVertices = graph.getAllVertices();
  allVertices.forEach(v => {
    distances.set(v, Infinity);
  });
  distances.set(startVertex, 0);

  for (let i = 0; i < allVertices.length - 1; i++) {
    allVertices.forEach(v => {
      graph.getVertexEdges(v).forEach(({ to: u, distance: w }) => {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        distances.set(v, Math.min(distances.get(v)!, distances.get(u)! + w));
        parents.set(v, u);
      });
    });
  }

  allVertices.forEach(v => {
    graph.getVertexEdges(v).forEach(({ to: u, distance: w }) => {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      if (distances.get(v)! > distances.get(u)! + w) {
        return 'Negative cycle!';
      }
    });
  });

  return distances;
};