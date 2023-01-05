import Web3 from 'web3';

import { DEFAULT_WEB3_PROVIDER_URL, TOKENS } from './config';
import { DEXFactory } from './contracts/DEXFactory';
import { UniswapV1Factory } from './contracts/UniswapV1';
import { DEX } from './contracts/DEX';
import { UniswapV2Factory } from './contracts/UniswapV2';
import { DMGraph, GraphEdge, bellmanFord } from './utils/graph';

interface ExchangeGraphEdge extends GraphEdge {
  contract: DEX;
  xValue: bigint;
  yValue: bigint;
  xBackValue: bigint;
  backRatio: number;
  xyRatio: number;
  yxRatio: number;
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
        for (const direction of ['XY', 'YX'] as const) {
          try {
            const xValue = testValue;
            const yValue = await contract.getSwapValue(xValue, direction);
            const xBackValue = await contract.getSwapValue(
              yValue,
              direction === 'XY' ? 'YX' : 'XY'
            );
            const backRatio = Number(yValue) / Number(xValue);
            const xyRatio = Number(yValue) / Number(xValue);
            const yxRatio = Number(xValue) / Number(yValue);
            const distance = -Math.log(xyRatio);
            edges.push({
              direction: direction,
              to: direction === 'XY' ? contract.X : contract.Y,
              from: direction === 'XY' ? contract.Y : contract.X,
              distance,
              xValue,
              yValue,
              xBackValue,
              backRatio,
              xyRatio,
              yxRatio,
              contract
            });
          } catch (e) {
            console.error(`error while loading ${contract}`, e);
          }
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

  public async doAll() {
    const contracts = await this.loadAllContracts();
    console.log(`Got ${contracts.length} contracts`);
    const edges = await this.getAllRatios(contracts, 1n * 10n ** 17n);
    console.log(`Got ${edges.length} edges`);

    const graph = this.createGraph(edges);
    console.log('Got graph', graph);

    const distances = bellmanFord(graph, 'USDT');
    console.log('distances', distances);
  }
}
