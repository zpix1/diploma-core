import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';

import { DEXFactory } from './DEXFactory';
import { BaseDEX, BaseXYDEX, DEX } from './DEX';
import { Token, TokenId } from '../config';

import uniswapV2FactoryABI from '../abi/uniswap_v2_factory.json';
import uniswapV2ExchangeABI from '../abi/uniswap_v2.json';
import uniswapV2RouterABI from '../abi/uniswap_v2_router02.json';
import { combinations } from '../utils/arrays';
import { ERC20, RealERC20 } from './ERC20';
import { TokenDecimal } from '../utils/decimals';

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
            await contract.methods.getPair(x.address, y.address).call(),
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
        await this.router.methods
          .getAmountOut(
            amountInDecimals,
            this.reserveX.valueInDecimals,
            this.reserveY.valueInDecimals
          )
          .call()
      );
    } else {
      return BigInt(
        await this.router.methods
          .getAmountOut(
            amountInDecimals,
            this.reserveY.valueInDecimals,
            this.reserveX.valueInDecimals
          )
          .call()
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
    const result = await this.contract.methods.getReserves().call();
    const [reserve0, reserve1] = [result.reserve0, result.reserve1].map(x =>
      BigInt(x)
    );

    this.t0 = RealERC20.getInstanceOf(
      this.web3,
      await this.contract.methods.token0().call()
    );

    this.t1 = RealERC20.getInstanceOf(
      this.web3,
      await this.contract.methods.token1().call()
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
