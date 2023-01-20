import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';

import { DEXFactory } from './DEXFactory';
import { BaseDEX, DEX } from './DEX';
import { Token, TokenId } from '../config';

import uniswapV1FactoryABI from '../abi/uniswap_v1_factory.json';
import uniswapV1ExchangeABI from '../abi/uniswap_v1.json';
import { ERC20 } from './ERC20';
import { DEFAULT_DECIMALS, TokenDecimal } from '../utils/decimals';

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
  private yDecimals!: bigint;

  constructor(
    private readonly web3: Web3,
    readonly Y: TokenId,
    readonly address: string
  ) {
    super('Uniswap V1');
    this.contract = new web3.eth.Contract(
      uniswapV1ExchangeABI as never,
      address
    );
  }

  async getSwapValue(
    amount: bigint,
    direction: 'XY' | 'YX'
  ): Promise<TokenDecimal> {
    if (direction === 'XY') {
      const value = BigInt(
        await this.contract.methods
          .getEthToTokenInputPrice(this.web3.utils.toBN(amount.toString()))
          .call()
      );
      return TokenDecimal.fromValueInDecimals(value, this.yDecimals);
    } else {
      const inputValue = TokenDecimal.fromAbsoluteValue(
        amount,
        this.yDecimals
      ).valueInDecimals;
      console.log(amount, this.yDecimals, inputValue);
      const value = BigInt(
        await this.contract.methods
          .getTokenToEthInputPrice(this.web3.utils.toBN(inputValue.toString()))
          .call()
      );
      return TokenDecimal.fromAbsoluteValue(value, DEFAULT_DECIMALS);
    }
  }

  async setup(): Promise<void> {
    const tokenAddress = await this.contract.methods.tokenAddress().call();
    this.yDecimals = await ERC20.getInstanceOf(
      this.web3,
      tokenAddress
    ).getDecimals();
  }
}
