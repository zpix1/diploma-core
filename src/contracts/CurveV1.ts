import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';

import { DEXFactory } from './DEXFactory';
import { BaseDEX, DEX } from './DEX';
import { Token, TokenId } from '../config';

import { combinations } from '../utils/arrays';
import { ERC20 } from './ERC20';
import { TokenDecimal } from '../utils/decimals';

import curveV1ExchangeRegistryABI from '../abi/curve_v1_registry.json';
import curveV1AddressRegistryABI from '../abi/curve_v1_address_registry.json';

export class CurveV1Factory implements DEXFactory {
  constructor(
    private readonly web3: Web3,
    public readonly name: string,
    private readonly exchangeRegistryAddress: string,
    private readonly poolRegistryAddress: string
  ) {}

  async getSomeDEXes(tokens: Token[]): Promise<DEX[]> {
    const exchangeRegistry = new this.web3.eth.Contract(
      curveV1ExchangeRegistryABI as never,
      this.exchangeRegistryAddress
    );
    const poolRegistry = new this.web3.eth.Contract(
      curveV1AddressRegistryABI as never,
      this.poolRegistryAddress
    );

    return await Promise.all(
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
        const poolAddress = await poolRegistry.methods
          .find_pool_for_coins(x.address, y.address)
          .call();
        return new CurveV1Exchange(
          this.web3,
          x.id,
          y.id,
          x,
          y,
          exchangeRegistry,
          poolAddress
        );
      })
    );
  }
}

export class CurveV1Exchange extends BaseDEX implements DEX {
  private token0!: ERC20;
  private token1!: ERC20;

  constructor(
    private readonly web3: Web3,
    readonly X: TokenId,
    readonly Y: TokenId,
    readonly XTokenData: Token,
    readonly YTokenData: Token,
    private readonly registry: Contract,
    readonly address: string
  ) {
    super('Curve V1');
  }

  private async estimateSwap(
    absoluteAmount: bigint,
    t1: ERC20,
    t2: ERC20
  ): Promise<TokenDecimal> {
    const amountInDecimals = TokenDecimal.fromAbsoluteValue(
      absoluteAmount,
      await t1.getDecimals()
    ).valueInDecimals;

    const amount = await this.registry.methods
      .get_exchange_amount(
        this.address,
        t1.address,
        t2.address,
        amountInDecimals
      )
      .call();

    const value = BigInt(amount);

    const resultTokenDecimal = TokenDecimal.fromValueInDecimals(
      value,
      await t2.getDecimals()
    );

    return resultTokenDecimal;
  }

  private async estimateGas(
    fromValueAbsolute: bigint,
    expectedToValueAbsolute: bigint,
    t1: ERC20,
    t2: ERC20
  ): Promise<bigint> {
    const fromValue = TokenDecimal.fromAbsoluteValue(
      fromValueAbsolute,
      await t1.getDecimals()
    ).valueInDecimals;

    const expectedToValue = TokenDecimal.fromAbsoluteValue(
      expectedToValueAbsolute,
      await t2.getDecimals()
    ).valueInDecimals;

    return BigInt(
      (await this.registry.methods
        .exchange(
          this.address,
          t1.address,
          t2.address,
          fromValue,
          expectedToValue
        )
        .estimateGas()) as number
    );
  }

  async getSwapValue(
    absoluteAmount: bigint,
    direction: 'XY' | 'YX'
  ): Promise<TokenDecimal> {
    if (direction === 'XY') {
      return await this.estimateSwap(absoluteAmount, this.token0, this.token1);
    } else {
      return await this.estimateSwap(absoluteAmount, this.token1, this.token0);
    }
  }

  async estimateGasForSwap(
    fromValueAbsolute: bigint,
    expectedToValueAbsolute: bigint,
    direction: 'XY' | 'YX'
  ): Promise<bigint> {
    if (direction === 'XY') {
      return await this.estimateGas(
        fromValueAbsolute,
        expectedToValueAbsolute,
        this.token0,
        this.token1
      );
    } else {
      return await this.estimateGas(
        expectedToValueAbsolute,
        fromValueAbsolute,
        this.token1,
        this.token0
      );
    }
  }

  async setup(): Promise<void> {
    this.token0 = ERC20.getInstanceOf(this.web3, this.XTokenData.address);
    this.token1 = ERC20.getInstanceOf(this.web3, this.YTokenData.address);
  }
}
