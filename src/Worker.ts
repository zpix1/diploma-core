import Web3 from 'web3';

import { DEFAULT_WEB3_PROVIDER_URL, TOKENS } from './config';
import { DEXFactory } from './contracts/DEXFactory';
import { UniswapV1Factory } from './contracts/UniswapV1';
import { DEX } from './contracts/DEX';
import { UniswapV2Factory } from './contracts/UniswapV2';
import { DMGraph, GraphEdge, GraphVertex, bellmanFord } from './utils/graph';
import { bigIntMinAndMax } from './utils/bigint';

const VALUE_THRESHOLD = 10n ** 16n;

interface ExchangeGraphEdge extends GraphEdge {
  contract: DEX;
  fromValue: bigint;
  toValue: bigint;
  ratio: number;
  direction: 'XY' | 'YX';
}

export class Worker {
  readonly web3: Web3;

  public constructor() {
    this.web3 = new Web3(Web3.givenProvider || DEFAULT_WEB3_PROVIDER_URL);
  }

  public async loadAllContracts(): Promise<DEX[]> {
    const factories: DEXFactory[] = [
      new UniswapV1Factory(
        this.web3,
        'Uniswap V1',
        '0xc0a47dFe034B400B47bDaD5FecDa2621de6c4d95'
      ),
      new UniswapV2Factory(
        this.web3,
        'Uniswap V2',
        '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
        '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
      )
    ];

    const contracts: DEX[] = [];

    for (const factory of factories) {
      const setupContracts = (
        await Promise.all(
          (
            await factory.getSomeDEXes(TOKENS)
          ).map(async contract => {
            try {
              await contract.setup();
              return contract;
            } catch (e) {
              console.error(`got error while setup of contract ${contract}`, e);
              return undefined;
            }
          })
        )
      ).filter(x => Boolean(x)) as DEX[];

      console.log(
        `Got ${setupContracts.length} contracts from ${factory.name} factory`
      );

      contracts.push(...setupContracts);
    }

    return contracts;
  }

  public async getAllRatios(
    contracts: DEX[],
    testValue: bigint
  ): Promise<ExchangeGraphEdge[]> {
    const edges: ExchangeGraphEdge[] = [];

    await Promise.all(
      contracts.map(async contract => {
        try {
          const fromValue = testValue;
          const toValue = await contract.getSwapValue(fromValue, 'XY');
          const backValue = await contract.getSwapValue(toValue, 'YX');

          const xyRatio = Number(toValue) / Number(fromValue);
          const yxRatio = Number(backValue) / Number(toValue);
          // const backRatio = Number(backValue) / Number(fromValue);

          console.log(
            `Can swap ${contract.X}->${contract.Y} with ratio ${xyRatio} on ${contract} (${fromValue} -> ${toValue})`
          );
          console.log(
            `Can swap ${contract.Y}->${contract.X} with ratio ${yxRatio} on ${contract} (${toValue} -> ${backValue})`
          );

          if (
            bigIntMinAndMax(fromValue, toValue, backValue)[0] < VALUE_THRESHOLD
          ) {
            console.log('skipping becouse some of values are too small');
            return;
          }

          edges.push(
            {
              direction: 'XY',
              from: contract.X,
              to: contract.Y,
              ratio: xyRatio,
              distance: -Math.log(xyRatio),
              fromValue,
              toValue,
              contract
            },
            {
              direction: 'YX',
              from: contract.Y,
              to: contract.X,
              ratio: yxRatio,
              distance: -Math.log(yxRatio),
              fromValue: toValue,
              toValue: backValue,
              contract
            }
          );
        } catch (e) {
          console.error(`error while loading ${contract}`, e);
        }
      })
    );

    return edges;
  }

  public createGraph(edges: ExchangeGraphEdge[]): DMGraph<ExchangeGraphEdge> {
    const graph = new DMGraph<ExchangeGraphEdge>();
    edges.forEach(edge => graph.addEdge(edge));
    return graph;
  }

  public test(): void {
    const G = new DMGraph();
    G.addEdge({
      from: 'A',
      to: 'B',
      distance: 1
    });
    G.addEdge({
      from: 'B',
      to: 'C',
      distance: 1
    });
    G.addEdge({
      from: 'A',
      to: 'C',
      distance: 0.1
    });

    console.log(bellmanFord(G, 'A'));
  }

  public async checkCycle(
    graph: DMGraph<ExchangeGraphEdge>,
    cycle: GraphVertex[],
    testValue: bigint
  ): Promise<void> {
    let curValue = testValue;
    let prev = cycle[0];
    cycle.push(prev);
    let coef = 1;
    for (let i = 1; i < cycle.length; i++) {
      const cur = cycle[i];
      const edge = graph.getEdge(prev, cur);
      if (!edge) {
        throw new Error('Failed to find edge');
      }

      const newCurValue = await edge.contract.getSwapValue(
        curValue,
        edge.direction
      );

      coef *= edge.ratio;

      console.log(
        `${prev}->${cur} (${curValue} -> ${newCurValue}) ${edge.contract}`
      );

      prev = cur;
      curValue = newCurValue;
    }

    const realRatio = Number(curValue) / Number(testValue);

    console.log(
      'coef',
      coef,
      'value',
      `${testValue} -> ${curValue}`,
      'realRatio',
      realRatio
    );
  }

  public async doAll(): Promise<void> {
    const contracts = await this.loadAllContracts();
    console.log(`Got ${contracts.length} contracts`);
    const edges = await this.getAllRatios(contracts, 100n * 10n ** 17n);
    console.log(`Got ${edges.length} edges`);
    const graph = this.createGraph(edges);
    console.log('Got graph', graph);
    const start = 'BUSD';
    const distances = bellmanFord(graph, start);
    console.log('distances to', start, distances);
    if (distances.hasNegativeCycle) {
      await this.checkCycle(graph, distances.negativeCycle, 10n ** 19n);
    } else {
      console.log('No negative cycle found');
    }
  }
}
