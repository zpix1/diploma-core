import Web3 from 'web3';

import { DEFAULT_WEB3_PROVIDER_URL, TOKENS } from './config';
import { DEXFactory } from './contracts/DEXFactory';
import { UniswapV1Factory } from './contracts/UniswapV1';
import { DEX } from './contracts/DEX';
import { UniswapV2Factory } from './contracts/UniswapV2';
import { DMGraph, GraphEdge, GraphVertex, bellmanFord } from './utils/graph';
import { bigIntMinAndMax } from './utils/bigint';
import { DEFAULT_DECIMALS, TokenDecimal } from './utils/decimals';
import { toStringify } from './utils/format';

const VALUE_THRESHOLD = 10n ** 16n;

interface ExchangeGraphEdge extends GraphEdge {
  contract: DEX;
  fromValue: bigint;
  toValue: bigint;
  ratio: number;
  direction: 'XY' | 'YX';
}

interface StrategyEntry {
  from: string;
  to: string;
  fromValue: TokenDecimal;
  toValue: TokenDecimal;
  exchange: DEX;
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
          const { absoluteValue: toValue } = await contract.getSwapValue(
            fromValue,
            'XY'
          );
          const { absoluteValue: backValue } = await contract.getSwapValue(
            toValue,
            'YX'
          );

          const xyRatio = Number(toValue) / Number(fromValue);
          const yxRatio = Number(backValue) / Number(toValue);

          console.log(
            `Can swap ${contract.X}->${contract.Y} with ratio ${xyRatio} on ${contract} (${fromValue} -> ${toValue})`
          );
          console.log(
            `Can swap ${contract.Y}->${contract.X} with ratio ${yxRatio} on ${contract} (${toValue} -> ${backValue})`
          );

          if (
            bigIntMinAndMax(fromValue, toValue, backValue)[0] < VALUE_THRESHOLD
          ) {
            console.log('skipping as some of values are too small');
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
  ): Promise<{
    startToken: string;
    rate: number;
    realRate: number;
    startValue: string;
    endValue: string;
    profitPercent: number;
    strategy: StrategyEntry[];
  }> {
    let curResult: TokenDecimal = TokenDecimal.fromAbsoluteValue(
      testValue,
      DEFAULT_DECIMALS
    );
    let cur = cycle[0];
    cycle.push(cur);

    const strategy: StrategyEntry[] = [];

    let rate = 1;
    for (let i = 1; i < cycle.length; i++) {
      const newCur = cycle[i];
      const edge = graph.getEdge(cur, newCur);
      if (!edge) {
        throw new Error('Failed to find edge');
      }

      const newCurResult = await edge.contract.getSwapValue(
        curResult.absoluteValue,
        edge.direction
      );

      rate *= edge.ratio;

      // console.log(
      //   `${prev}->${cur} (${curValue} -> ${newCurValue} / ${realCurRate}) ${edge.contract}`
      // );

      strategy.push({
        from: cur,
        fromValue: curResult,
        to: newCur,
        toValue: newCurResult,
        exchange: edge.contract
      });

      cur = newCur;
      curResult = newCurResult;
    }

    // hacky fix of problem that we dont know decimals for test value at start;
    strategy[0] = {
      ...strategy[0],
      fromValue: TokenDecimal.fromAbsoluteValue(
        testValue,
        strategy[strategy.length - 1].toValue.decimals
      )
    };

    const realRate = Number(curResult.absoluteValue) / Number(testValue);
    const profitPercent =
      (Number(curResult.absoluteValue) / Number(testValue) - 1) * 100;

    return {
      startToken: strategy[0].to,
      rate,
      realRate,
      startValue: `${strategy[0].fromValue}`,
      endValue: `${strategy[strategy.length - 1].toValue}`,
      profitPercent,
      strategy
    };
  }

  public async doAll(): Promise<void> {
    const results: any[] = [];
    const contracts = await this.loadAllContracts();
    console.log(`Got ${contracts.length} contracts`);
    await Promise.all(
      [
        5n * 10n ** 16n,
        10n ** 17n,
        5n * 10n ** 17n,
        10n ** 18n,
        5n * 10n ** 18n,
        10n ** 19n
      ].map(async testAmount => {
        const edges = await this.getAllRatios(contracts, testAmount);
        console.log(`Got ${edges.length} edges`);
        const graph = this.createGraph(edges);
        console.log('Got graph', graph);
        for (const start of graph.getAllVertices()) {
          const distances = bellmanFord(graph, start);
          if (distances.hasNegativeCycle) {
            const {
              startToken,
              startValue,
              endValue,
              rate,
              realRate,
              strategy,
              profitPercent
            } = await this.checkCycle(
              graph,
              distances.negativeCycle,
              testAmount
            );
            results.push({
              capital: `${strategy[0].fromValue}`,
              status: 'FOUND',
              startToken,
              startValue,
              endValue,
              rate,
              profitPercent,
              realRate,
              strategy
            });
            strategy.forEach(e =>
              toStringify(e, 'fromValue', 'toValue', 'exchange')
            );
            console.log('strategy');
            console.table(strategy);
            return;
          }
        }
        results.push({
          capital: `${TokenDecimal.fromAbsoluteValue(
            testAmount,
            DEFAULT_DECIMALS
          )}`,
          status: 'NOT FOUND'
        });
      })
    );
    results.sort((a, b) => Number(a.capital) - Number(b.capital));
    console.log('Found strategies:');
    console.table(results);
  }
}
