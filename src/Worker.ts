import Web3 from 'web3';

import {
  DEFAULT_WEB3_PROVIDER_URL,
  TOKENS,
  TOKENS_MAP,
  TokenId
} from './config';
import { CurveV1Factory } from './contracts/CurveV1';
import { DEX } from './contracts/DEX';
import { DEXFactory } from './contracts/DEXFactory';
import { UniswapV1Factory } from './contracts/UniswapV1';
import { UniswapV2Factory } from './contracts/UniswapV2';
import {
  QUOTER_CONTRACT_ADDRESS,
  UniswapV3Factory
} from './contracts/UniswapV3';
import {
  Config,
  ExchangeGraphEdge,
  SearchResult,
  StrategyEntry
} from './types';
import {
  DEFAULT_DECIMALS,
  TokenDecimal,
  normalizeValue
} from './utils/decimals';
import { objMap } from './utils/format';
import { DMGraph, GraphVertex, bellmanFord } from './utils/graph';

const DEFAULT_CAPS_SET = [
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
] as const;

export class Worker {
  readonly web3: Web3;
  readonly factories: DEXFactory[];
  private contracts?: DEX[];

  public constructor() {
    this.web3 = new Web3(Web3.givenProvider || DEFAULT_WEB3_PROVIDER_URL);
    this.factories = [
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
      new UniswapV3Factory(this.web3, 'Uniswap V3', QUOTER_CONTRACT_ADDRESS),
      new CurveV1Factory(
        this.web3,
        'Curve V1',
        '0xD1602F68CC7C4c7B59D686243EA35a9C73B0c6a2',
        '0x90E00ACe148ca3b23Ac1bC8C240C2a7Dd9c2d7f5'
      )
    ];
  }

  private async getAllContracts(): Promise<DEX[]> {
    const contracts: DEX[] = [];

    for (const factory of this.factories) {
      const setupContracts = (
        await Promise.all(
          (
            await factory.getSomeDEXes(TOKENS)
          ).map(async contract => {
            try {
              await contract.setup();
              return contract;
            } catch (e) {
              // console.error(`got error while setup of contract ${contract}`, e);
              return undefined;
            }
          })
        )
      ).filter(Boolean) as DEX[];

      console.log(
        `Got ${setupContracts.length} contracts from ${factory.name} factory`
      );

      contracts.push(...setupContracts);
    }

    return contracts;
  }

  private normalizeValue(value: bigint, token: TokenId): bigint {
    return normalizeValue(value, TOKENS_MAP.get(token)?.inDollars ?? 1);
  }

  private async getAllRatios(
    contracts: DEX[],
    testValue: bigint
  ): Promise<ExchangeGraphEdge[]> {
    const edges: ExchangeGraphEdge[] = [];

    await Promise.all(
      contracts.map(async contract => {
        try {
          const fromValueOrigin = this.normalizeValue(testValue, contract.X);
          const toValueOrigin = this.normalizeValue(testValue, contract.Y);

          const { absoluteValue: toValue } =
            await contract.estimateValueAfterSwap(fromValueOrigin, 'XY');
          const { absoluteValue: fromValue } =
            await contract.estimateValueAfterSwap(toValueOrigin, 'YX');

          const xyRatio = Number(toValue) / Number(fromValueOrigin);
          const yxRatio = Number(fromValue) / Number(toValueOrigin);

          // console.log(
          //   `Can swap ${contract.X}->${contract.Y} with ratio ${xyRatio} on ${contract} (${fromValue} -> ${toValue})`
          // );
          // console.log(
          //   `Can swap ${contract.Y}->${contract.X} with ratio ${yxRatio} on ${contract} (${toValue} -> ${backValue})`
          // );

          // if (
          //   bigIntMinAndMax(fromValue, toValue, backValue)[0] < VALUE_THRESHOLD
          // ) {
          //   // console.log('skipping as some of values are too small');
          //   return;
          // }

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
              toValue: fromValue,
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

  private createGraph(edges: ExchangeGraphEdge[]): DMGraph<ExchangeGraphEdge> {
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

  private async checkCycle(
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
    totalGas: bigint;
  }> {
    let curResult: TokenDecimal = TokenDecimal.fromAbsoluteValue(
      testValue,
      DEFAULT_DECIMALS
    );
    let cur = cycle[0];
    cycle.push(cur);

    const strategy: StrategyEntry[] = [];

    let rate = 1;
    let totalGas = 0n;
    for (let i = 1; i < cycle.length; i++) {
      const newCur = cycle[i];
      const edge = graph
        .getEdges(cur, newCur)
        ?.reduce((a, b) => (a.distance < b.distance ? a : b));
      if (!edge) {
        throw new Error('Failed to find edge');
      }

      const newCurResult = await edge.contract.estimateValueAfterSwap(
        curResult.absoluteValue,
        edge.direction
      );

      const gas = 0n;
      // try {
      //   gas = await edge.contract.estimateGasForSwap(
      //     curResult.absoluteValue,
      //     newCurResult.absoluteValue,
      //     edge.direction
      //   );
      // } catch (e) {
      //   console.log(e);
      // }

      rate *= edge.ratio;
      totalGas += gas;

      // console.log(
      //   `${prev}->${cur} (${curValue} -> ${newCurValue} / ${realCurRate}) ${edge.contract}`
      // );

      strategy.push({
        from: cur,
        fromValue: curResult,
        to: newCur,
        toValue: newCurResult,
        exchange: edge.contract,
        usedEdge: edge,
        gas
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
      totalGas,
      strategy
    };
  }

  public async doSearch(props: {
    reloadContracts?: boolean;
    blockNumber?: number | 'latest';
    capsSet?: bigint[];
    usedTokens?: TokenId[];
    usedFactories?: string[];
  }): Promise<SearchResult[]> {
    const startBlock = await (await this.web3.eth.getBlock('latest')).number;
    const capsSet = props.capsSet ?? DEFAULT_CAPS_SET;

    this.web3.eth.defaultBlock = props.blockNumber ?? startBlock;
    const results: SearchResult[] = [];
    if (props?.reloadContracts || this.contracts === undefined) {
      this.contracts = await this.getAllContracts();
      console.log(`Got ${this.contracts.length} contracts`);
    }
    const contracts = this.contracts;
    if (!contracts) {
      throw new Error('contracts are undefined');
    }
    const config = {
      usedTokens: TOKENS.map(({ id }) => id),
      usedFactories: this.factories.map(({ name }) => name),
      contractsCount: contracts.length
    } satisfies Config;
    await Promise.all(
      capsSet.map(async testAmount => {
        const edges = await this.getAllRatios(contracts, testAmount);
        console.log(`Got ${edges.length} edges`);
        const graph = this.createGraph(edges);
        console.log('got graph', graph);
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
              profitPercent,
              totalGas
            } = await this.checkCycle(
              graph,
              distances.negativeCycle,
              this.normalizeValue(
                testAmount,
                distances.negativeCycle[0] as TokenId
              )
            );

            const endBlock = await (
              await this.web3.eth.getBlock('latest')
            ).number;
            results.push({
              capital: `${strategy[0].fromValue}`,
              startBlock,
              endBlock,
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
              strategy,
              config,
              totalGas
            });

            return;
          }
        }
        const endBlock = await (await this.web3.eth.getBlock('latest')).number;
        results.push({
          startBlock,
          endBlock,
          capital: `${TokenDecimal.fromAbsoluteValue(
            testAmount,
            DEFAULT_DECIMALS
          )}`,
          status: 'NOT FOUND',
          config
        });
      })
    );

    results.sort((a, b) => {
      const _a = (a.status === 'FOUND' && a._profitInUSD) || 0;
      const _b = (b.status === 'FOUND' && b._profitInUSD) || 0;
      const t = _b - _a;
      return t;
    });
    for (const entry of results) {
      if (entry.status === 'NOT FOUND') {
        continue;
      }
      const { capital, strategy } = entry;
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
    return results;
  }
}
