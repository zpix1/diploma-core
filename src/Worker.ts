import Web3 from 'web3';

import {
  DEFAULT_CAPS_SET,
  TOKENS_MAP,
  TOKEN_ID_LIST,
  Token,
  TokenId
} from './config';
import { BancorV3Factory } from './contracts/BancorV3';
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
import { Web3Balancer } from './utils/web3Balancer';

export class Worker {
  readonly web3: Web3;
  readonly factories: DEXFactory[];
  private contracts?: DEX[];
  private readonly balancer: Web3Balancer;

  public constructor(props: { web3ProviderUrl: string; maxTPS: number }) {
    this.web3 = new Web3(props.web3ProviderUrl || Web3.givenProvider);
    this.balancer = new Web3Balancer({
      maxTPS: props.maxTPS
    });
    this.factories = [
      new BancorV3Factory(
        this.web3,
        this.balancer,
        'Bancor V3',
        '0x8E303D296851B320e6a697bAcB979d13c9D6E760'
      ),
      new UniswapV1Factory(
        this.web3,
        this.balancer,
        'Uniswap V1',
        '0xc0a47dFe034B400B47bDaD5FecDa2621de6c4d95'
      ),
      new UniswapV2Factory(
        this.web3,
        this.balancer,
        'Uniswap V2',
        '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
        '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'
      ),
      new UniswapV3Factory(
        this.web3,
        this.balancer,
        'Uniswap V3',
        QUOTER_CONTRACT_ADDRESS
      ),
      new CurveV1Factory(
        this.web3,
        this.balancer,
        'Curve V1',
        '0x99a58482BD75cbab83b27EC03CA68fF489b5788f',
        '0x90E00ACe148ca3b23Ac1bC8C240C2a7Dd9c2d7f5'
      )
    ];
  }

  private async getAllContracts({
    usedTokens,
    usedFactories
  }: {
    usedTokens: Token[];
    usedFactories: string[];
  }): Promise<DEX[]> {
    const contracts: DEX[] = [];

    const usedFactoriesSet = new Set(usedFactories);
    const factories = this.factories.filter(f => usedFactoriesSet.has(f.name));
    console.log(usedFactories, factories);

    for (const factory of factories) {
      const setupContracts = (
        await Promise.all(
          (
            await factory.getSomeDEXes(usedTokens)
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

          edges.push(
            {
              direction: 'XY',
              from: contract.X,
              to: contract.Y,
              ratio: xyRatio,
              distance: -Math.log(xyRatio),
              fromValue,
              toValue,
              contract,
              toString: () => contract.toString()
            } as ExchangeGraphEdge,
            {
              direction: 'YX',
              from: contract.Y,
              to: contract.X,
              ratio: yxRatio,
              distance: -Math.log(yxRatio),
              fromValue: toValue,
              toValue: fromValue,
              contract,
              toString: () => contract.toString()
            } as ExchangeGraphEdge
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
      const toEdges = graph.getEdges(cur, newCur);
      if (toEdges?.length === 0) {
        throw new Error('Invalid cycle');
      }
      const edge = toEdges?.reduce((a, b) => (a.distance < b.distance ? a : b));
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
      //   console.error('error while loading gas', e);
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

  public getAllFactoryNames(): string[] {
    return this.factories.map(f => f.name);
  }

  public async doSearch(props: {
    reloadContracts?: boolean;
    blockNumber?: number | 'latest';
    capsSet?: bigint[];
    usedTokens?: TokenId[];
    usedFactories?: string[];
  }): Promise<SearchResult[]> {
    const startBlock = await (async (): Promise<number> => {
      if (props.blockNumber === undefined || props.blockNumber === 'latest') {
        return (await this.web3.eth.getBlock('latest')).number;
      }
      return props.blockNumber;
    })();
    const capsSet = props.capsSet ?? DEFAULT_CAPS_SET;
    const usedTokens = props.usedTokens ?? TOKEN_ID_LIST;
    const usedTokenInfos = usedTokens.map(t => TOKENS_MAP.get(t)) as Token[];
    const usedFactoryNames = props.usedFactories ?? this.getAllFactoryNames();

    this.web3.eth.defaultBlock = startBlock;

    if (props?.reloadContracts || this.contracts === undefined) {
      this.contracts = await this.getAllContracts({
        usedTokens: usedTokenInfos,
        usedFactories: usedFactoryNames
      });
      console.log(`Got ${this.contracts.length} contracts`);
    }

    const contracts = this.contracts;
    if (!contracts) {
      throw new Error('contracts are undefined');
    }

    const config = {
      usedTokens,
      usedFactories: usedFactoryNames,
      contractsCount: contracts.length
    } satisfies Config;

    const results: SearchResult[] = [];
    await Promise.all(
      capsSet.map(async testAmount => {
        const edges = await this.getAllRatios(contracts, testAmount);
        console.log(`Got ${edges.length} edges`);
        const graph = this.createGraph(edges);
        console.log('got graph', graph.toString());
        const usedCycles: Set<string> = new Set();
        for (const start of graph.getAllVertices()) {
          const distances = bellmanFord(graph, start);

          if (distances.hasNegativeCycle) {
            const cycleDesc = distances.negativeCycle.slice().sort().join(',');

            if (usedCycles.has(cycleDesc)) {
              continue;
            }

            usedCycles.add(cycleDesc);

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
          } else {
            const endBlock = await (
              await this.web3.eth.getBlock('latest')
            ).number;

            results.push({
              startBlock,
              endBlock,
              capital: `${TokenDecimal.fromAbsoluteValue(
                testAmount,
                DEFAULT_DECIMALS
              )}`,
              startToken: start,
              status: 'NOT FOUND',
              capitalInUSD: new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
              }).format(testAmount / 10n ** DEFAULT_DECIMALS),
              config
            });
          }
        }
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
