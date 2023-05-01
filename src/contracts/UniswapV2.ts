import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';

import { Token, TokenId } from '../config';
import { BaseXYDEX, DEX } from './DEX';
import { DEXFactory } from './DEXFactory';

import uniswapV2ExchangeABI from '../abi/uniswap_v2.json';
import uniswapV2FactoryABI from '../abi/uniswap_v2_factory.json';
import uniswapV2RouterABI from '../abi/uniswap_v2_router02.json';
import { combinations } from '../utils/arrays';
import { TokenDecimal } from '../utils/decimals';
import { ERC20, getERC20 } from './ERC20';
import { Web3Balancer } from '../utils/web3Balancer';

export class UniswapV2Factory implements DEXFactory {
  constructor(
    private readonly web3: Web3,
    private readonly balancer: Web3Balancer,
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
            this.balancer,
            x.id,
            y.id,
            await this.balancer.scheduleCall<string>(
              contract.methods.getPair(x.address, y.address)
            ),
            new this.web3.eth.Contract(
              uniswapV2RouterABI as never,
              this.routerAddress
            )
          );
        })
      )
    ).filter(({ address }) => !this.web3.utils.toBN(address).isZero());
  }
}

export class UniswapV2Exchange extends BaseXYDEX implements DEX {
  protected t0!: ERC20;
  protected t1!: ERC20;
  private readonly contract: Contract;

  private reserveX!: TokenDecimal;
  private reserveY!: TokenDecimal;

  constructor(
    private readonly web3: Web3,
    private readonly balancer: Web3Balancer,
    readonly X: TokenId,
    readonly Y: TokenId,
    readonly address: string,
    readonly router: Contract
  ) {
    super('Uniswap V2');
    this.contract = new web3.eth.Contract(
      uniswapV2ExchangeABI as never,
      address
    );
  }

  protected async _estimateValueAfterSwap(
    amountInDecimals: bigint,
    _from: ERC20,
    _to: ERC20,
    direction: 'XY' | 'YX'
  ): Promise<bigint> {
    if (direction === 'XY') {
      return BigInt(
        await this.balancer.scheduleCall<string>(
          this.router.methods.getAmountOut(
            amountInDecimals,
            this.reserveX.valueInDecimals,
            this.reserveY.valueInDecimals
          )
        )
      );
    } else {
      return BigInt(
        await this.balancer.scheduleCall<string>(
          this.router.methods.getAmountOut(
            amountInDecimals,
            this.reserveY.valueInDecimals,
            this.reserveX.valueInDecimals
          )
        )
      );
    }
  }
  protected async _estimateGasForSwap(
    fromAmountInDecimals: bigint,
    toAmountInDecimals: bigint,
    from: ERC20,
    to: ERC20
  ): Promise<bigint> {
    const deadline = Math.floor(Date.now() / 1000) + 3600 * 20;

    return BigInt(
      await this.router.methods
        .swapExactTokensForTokens(
          fromAmountInDecimals,
          toAmountInDecimals,
          [from.address, to.address],
          this.address,
          deadline
        )
        .estimateGas()
    );
  }

  async setup(): Promise<void> {
    const result = await this.balancer.scheduleCall<{
      reserve0: string;
      reserve1: string;
    }>(this.contract.methods.getReserves());
    const [reserve0, reserve1] = [result.reserve0, result.reserve1].map(x =>
      BigInt(x)
    );

    this.t0 = getERC20(
      this.web3,
      await this.balancer.scheduleCall<string>(this.contract.methods.token0())
    );

    this.t1 = getERC20(
      this.web3,
      await this.balancer.scheduleCall<string>(this.contract.methods.token1())
    );

    this.reserveX = TokenDecimal.fromValueInDecimals(
      reserve0,
      await this.t0.getDecimals()
    );

    this.reserveY = TokenDecimal.fromValueInDecimals(
      reserve1,
      await this.t1.getDecimals()
    );
  }
}
