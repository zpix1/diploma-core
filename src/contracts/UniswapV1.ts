import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';

import { Token, TokenId } from '../config';
import { BaseXYDEX, DEX } from './DEX';
import { DEXFactory } from './DEXFactory';

import uniswapV1ExchangeABI from '../abi/uniswap_v1.json';
import uniswapV1FactoryABI from '../abi/uniswap_v1_factory.json';
import { ERC20, EthERC20, RealERC20 } from './ERC20';

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

export class UniswapV1Exchange extends BaseXYDEX implements DEX {
  protected t0!: ERC20;
  protected t1!: ERC20;
  readonly X = 'ETH';
  private readonly contract: Contract;

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

  protected async _estimateValueAfterSwap(
    amountInDecimals: bigint,
    from: ERC20
  ): Promise<bigint> {
    if ((await from.symbol()) === 'ETH') {
      return BigInt(
        await this.contract.methods
          .getEthToTokenInputPrice(amountInDecimals)
          .call()
      );
    } else {
      return BigInt(
        await this.contract.methods
          .getTokenToEthInputPrice(amountInDecimals)
          .call()
      );
    }
  }
  protected async _estimateGasForSwap(
    fromAmountInDecimals: bigint,
    toAmountInDecimals: bigint,
    from: ERC20
  ): Promise<bigint> {
    const deadline = Math.floor(Date.now() / 1000) + 3600 * 20;

    if ((await from.symbol()) === 'ETH') {
      return BigInt(
        (await this.contract.methods
          .ethToTokenSwapInput(toAmountInDecimals, deadline)
          .estimateGas({
            value: fromAmountInDecimals
          })) as number
      );
    } else {
      return BigInt(
        (await this.contract.methods
          .tokenToEthSwapInput(
            fromAmountInDecimals,
            toAmountInDecimals,
            deadline
          )
          .estimateGas()) as number
      );
    }
  }

  async setup(): Promise<void> {
    this.t0 = EthERC20.getInstanceOf();
    const tokenAddress = await this.contract.methods.tokenAddress().call();
    this.t1 = RealERC20.getInstanceOf(this.web3, tokenAddress);
    await this.checkBalance(this.t1, this.address);
  }
}
