import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';

import { DEXFactory } from './DEXFactory';
import { BaseDEX, DEX } from './DEX';
import { Token, TokenId } from '../config';

import uniswapV1FactoryABI from '../abi/uniswap_v1_factory.json';
import uniswapV1ExchangeABI from '../abi/uniswap_v1.json';

export class UniswapV1Factory implements DEXFactory {
  constructor(
    private readonly web3: Web3,
    public readonly name: string,
    private readonly address: string
  ) {}

  async getSomeDEXes(tokens: Token[]): Promise<DEX[]> {
    const contract = new this.web3.eth.Contract(
      uniswapV1FactoryABI as never,
      this.address
    );

    return (
      await Promise.all(
        tokens
          .filter(({ isVirtual }) => !isVirtual)
          .map(
            async ({ id, address }) =>
              new UniswapV1Exchange(
                this.web3,
                id,
                await contract.methods.getExchange(address).call()
              )
          )
      )
    ).filter(({ address }) => !this.web3.utils.toBN(address).isZero());
  }
}

export class UniswapV1Exchange extends BaseDEX implements DEX {
  readonly X = 'ETH';
  private readonly contract: Contract;

  constructor(
    private readonly web3: Web3,
    readonly Y: TokenId,
    readonly address: string
  ) {
    super();
    this.contract = new web3.eth.Contract(
      uniswapV1ExchangeABI as never,
      address
    );
  }

  async getSwapValue(amount: bigint, direction: 'XY' | 'YX'): Promise<bigint> {
    const f =
      direction === 'XY'
        ? this.contract.methods.getEthToTokenInputPrice
        : this.contract.methods.getTokenToEthInputPrice;
    return BigInt(await f(this.web3.utils.toBN(amount.toString())).call());
  }
}
