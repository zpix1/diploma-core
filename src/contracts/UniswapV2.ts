import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';

import { DEXFactory } from './DEXFactory';
import { BaseDEX, DEX } from './DEX';
import { Token, TokenId } from '../config';

import uniswapV2FactoryABI from '../abi/uniswap_v2_factory.json';
import uniswapV2ExchangeABI from '../abi/uniswap_v2.json';
import { combinations } from '../utils';

export class UniswapV2Factory implements DEXFactory {
  constructor(
    private readonly web3: Web3,
    public readonly name: string,
    private readonly factoryAddress: string,
    private readonly routerAddress: string
  ) {}

  async getSomeDEXes(tokens: Token[]): Promise<DEX[]> {
    const contract = new this.web3.eth.Contract(
      uniswapV2FactoryABI as never,
      this.factoryAddress
    );

    return (
      await Promise.all(
        Array.from(
          combinations(
            tokens.filter(({ isVirtual }) => !isVirtual),
            2
          )
        ).map(async pair => {
          const [x, y] = pair.sort((p1, p2) => {
            const a = BigInt(p1.address);
            const b = BigInt(p2.address);
            return a < b ? -1 : a > b ? 1 : 0;
          });
          return new UniswapV2Exchange(
            this.web3,
            x.id,
            y.id,
            await contract.methods.getPair(x.address, y.address).call()
          );
        })
      )
    ).filter(({ address }) => !this.web3.utils.toBN(address).isZero());
  }
}

export class UniswapV2Exchange extends BaseDEX implements DEX {
  private readonly contract: Contract;

  constructor(
    private readonly web3: Web3,
    readonly X: TokenId,
    readonly Y: TokenId,
    readonly address: string
  ) {
    super();
    this.contract = new web3.eth.Contract(
      uniswapV2ExchangeABI as never,
      address
    );
  }

  async getSwapValue(amount: bigint, direction: 'XY' | 'YX'): Promise<bigint> {
    return 0n;
  }
}
