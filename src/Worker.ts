import Web3 from 'web3';
import { DEFAULT_WEB3_PROVIDER_URL, TOKENS } from './config';
import { DEXFactory } from './contracts/DEXFactory';
import { UniswapV1Factory } from './contracts/UniswapV1';
import { DEX } from './contracts/DEX';
import { UniswapV2Factory } from './contracts/UniswapV2';

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
      const factoryContracts = await factory.getSomeDEXes(TOKENS);
      console.log(
        `Got ${factoryContracts.length} contracts from ${factory.name} factory`
      );
      contracts.push(...factoryContracts);
    }

    return contracts;
  }

  public async test() {
    const contracts = await this.loadAllContracts();
    const result = (
      await Promise.all(
        contracts.map(async contract => {
          const inValue = 10n ** 5n;
          try {
            return {
              contract,
              inValue,
              outValue: await contract.getSwapValue(inValue, 'XY')
            };
          } catch (e) {
            console.error(`error while loading ${contract}`, e);
            return undefined;
          }
        })
      )
    ).filter(x => Boolean(x));
    return result;
  }
}
