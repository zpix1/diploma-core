import Web3 from 'web3';

import {
  DEFAULT_WEB3_PROVIDER_URL,
  TOKENS,
  TOKENS_MAP,
  TokenId
} from './config';
import { DEXFactory } from './contracts/DEXFactory';
import { UniswapV1Factory } from './contracts/UniswapV1';
import { DEX } from './contracts/DEX';
import { UniswapV2Factory } from './contracts/UniswapV2';
import { DMGraph, GraphEdge, GraphVertex, bellmanFord } from './utils/graph';
import { bigIntMinAndMax } from './utils/bigint';
import { DEFAULT_DECIMALS, TokenDecimal } from './utils/decimals';
import { objMap } from './utils/format';
import {
  QUOTER_CONTRACT_ADDRESS,
  UniswapV3Factory
} from './contracts/UniswapV3';

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
      ),
      new UniswapV3Factory(this.web3, 'Uniswap V3', QUOTER_CONTRACT_ADDRESS)
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
    profit: number;
    profitPercent: string;
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
      const edge = graph
        .getEdges(cur, newCur)
        ?.reduce((a, b) => (a.distance < b.distance ? a : b));
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

    // hacky fix of problem that we dont know decimals for test value at start
    strategy[0] = {
      ...strategy[0],
      fromValue: TokenDecimal.fromAbsoluteValue(
        testValue,
        strategy[strategy.length - 1].toValue.decimals
      )
    };

    const realRate = Number(curResult.absoluteValue) / Number(testValue);
    const profitPercentNumber =
      Number(curResult.absoluteValue) / Number(testValue) - 1;

    const startDecimal = strategy[0].fromValue;
    const endDecimal = strategy[strategy.length - 1].toValue;
    return {
      startToken: strategy[0].from,
      rate,
      realRate,
      startValue: `${startDecimal}`,
      endValue: `${endDecimal}`,
      profit: TokenDecimal.fromAbsoluteValue(
        endDecimal.absoluteValue - startDecimal.absoluteValue,
        startDecimal.decimals
      ).toValue(),
      profitPercent: new Intl.NumberFormat('en-US', {
        style: 'percent',
        minimumFractionDigits: 2
      }).format(profitPercentNumber),
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
        10n ** 19n,
        5n * 10n ** 19n,
        10n ** 20n,
        10n ** 21n,
        10n ** 22n
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
              profit,
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
              profit,
              _profitInUSD:
                profit *
                (TOKENS_MAP.get(startToken as TokenId)?.inDollars ?? NaN),
              profitInUSD: new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
              }).format(
                profit *
                  (TOKENS_MAP.get(startToken as TokenId)?.inDollars ?? NaN)
              ),
              capitalInUSD: new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
              }).format(
                strategy[0].fromValue.toValue() *
                  (TOKENS_MAP.get(startToken as TokenId)?.inDollars ?? NaN)
              ),
              profitPercent,
              realRate,
              strategy
            });

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
    results.sort((a, b) => {
      const _a = a._profitInUSD || 0;
      const _b = b._profitInUSD || 0;
      const t = _b - _a;
      return t;
    });
    for (const { strategy, capital } of results) {
      if (!strategy) {
        continue;
      }
      console.log('strategy for', capital);
      const formattedStrategy = strategy.map((e: StrategyEntry) => ({
        fromValueAbsolute: e.fromValue.absoluteValue.toString(),
        toValueAbsolute: e.toValue.absoluteValue.toString(),
        ...objMap(e, {
          fromValue: v => v.toString(),
          toValue: v => v.toString(),
          exchange: v => v.toString()
        })
      }));
      console.table(formattedStrategy);
    }
    console.log(`Total results (${new Date().toLocaleString()}): `);
    console.table(results);
  }
}
