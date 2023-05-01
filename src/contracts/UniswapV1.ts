import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';

import { ETH, Token, TokenId } from '../config';
import { BaseXYDEX, DEX } from './DEX';
import { DEXFactory } from './DEXFactory';

import uniswapV1ExchangeABI from '../abi/uniswap_v1.json';
import uniswapV1FactoryABI from '../abi/uniswap_v1_factory.json';
import { ERC20, EthERC20, getERC20 } from './ERC20';
import { Web3Balancer } from '../utils/web3Balancer';

export class UniswapV1Factory implements DEXFactory {
  constructor(
    private readonly web3: Web3,
    private readonly balancer: Web3Balancer,
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
                this.balancer,
                id,
                await this.balancer.scheduleCall<string>(
                  contract.methods.getExchange(address)
                )
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
    private readonly balancer: Web3Balancer,
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
        await this.balancer.scheduleCall<string>(
          await this.contract.methods.getEthToTokenInputPrice(amountInDecimals)
        )
      );
    } else {
      return BigInt(
        await await this.balancer.scheduleCall<string>(
          this.contract.methods.getTokenToEthInputPrice(amountInDecimals)
        )
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
    this.t0 = getERC20(this.web3, ETH.address);
    const tokenAddress = await this.balancer.scheduleCall<string>(
      this.contract.methods.tokenAddress()
    );
    this.t1 = getERC20(this.web3, tokenAddress);
    await this.checkBalance(this.t1, this.address);
  }
}
