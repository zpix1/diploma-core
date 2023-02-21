import { TokenId } from '../config';
import { TokenDecimal } from '../utils/decimals';
import { ERC20 } from './ERC20';

export interface DEX {
  readonly address?: string;

  readonly X: TokenId;
  readonly Y: TokenId;

  estimateValueAfterSwap(
    absoluteAmount: bigint,
    direction: 'XY' | 'YX'
  ): Promise<TokenDecimal>;

  estimateGasForSwap(
    fromValueAbsolute: bigint,
    expectedToValueAbsolute: bigint,
    direction: 'XY' | 'YX'
  ): Promise<bigint>;

  setup(): Promise<void>;
}

export abstract class BaseDEX implements DEX {
  constructor(private readonly name: string) {}

  async setup(): Promise<void> {
    return;
  }

  abstract readonly address?: string;
  abstract readonly X: TokenId;
  abstract readonly Y: TokenId;

  abstract estimateGasForSwap(
    fromValueAbsolute: bigint,
    expectedToValueAbsolute: bigint,
    direction: 'XY' | 'YX'
  ): Promise<bigint>;

  abstract estimateValueAfterSwap(
    absoluteAmount: bigint,
    direction: 'XY' | 'YX'
  ): Promise<TokenDecimal>;

  toString(): string {
    return `[${this.name} address=${this.address} X=${this.X} Y=${this.Y}]`;
  }
}

export abstract class BaseXYDEX extends BaseDEX {
  protected abstract t0: ERC20;
  protected abstract t1: ERC20;

  protected abstract _estimateValueAfterSwap(
    amountInDecimals: bigint,
    from: ERC20,
    to: ERC20,
    direction: 'XY' | 'YX'
  ): Promise<bigint>;

  private async estimateSwap(
    absoluteAmount: bigint,
    t1: ERC20,
    t2: ERC20,
    direction: 'XY' | 'YX'
  ): Promise<TokenDecimal> {
    const amountInDecimals = TokenDecimal.fromAbsoluteValue(
      absoluteAmount,
      await t1.getDecimals()
    ).valueInDecimals;

    const amount = await this._estimateValueAfterSwap(
      amountInDecimals,
      t1,
      t2,
      direction
    );

    const value = BigInt(amount);

    const resultTokenDecimal = TokenDecimal.fromValueInDecimals(
      value,
      await t2.getDecimals()
    );

    return resultTokenDecimal;
  }

  async estimateValueAfterSwap(
    absoluteAmount: bigint,
    direction: 'XY' | 'YX'
  ): Promise<TokenDecimal> {
    if (direction === 'XY') {
      return await this.estimateSwap(
        absoluteAmount,
        this.t0,
        this.t1,
        direction
      );
    } else {
      return await this.estimateSwap(
        absoluteAmount,
        this.t1,
        this.t0,
        direction
      );
    }
  }

  protected abstract _estimateGasForSwap(
    fromAmountInDecimals: bigint,
    toAmountInDecimals: bigint,
    from: ERC20,
    to: ERC20,
    direction: 'XY' | 'YX'
  ): Promise<bigint>;

  private async estimateGas(
    fromValueAbsolute: bigint,
    expectedToValueAbsolute: bigint,
    t1: ERC20,
    t2: ERC20,
    direction: 'XY' | 'YX'
  ): Promise<bigint> {
    const fromValue = TokenDecimal.fromAbsoluteValue(
      fromValueAbsolute,
      await t1.getDecimals()
    ).valueInDecimals;

    const expectedToValue = TokenDecimal.fromAbsoluteValue(
      expectedToValueAbsolute,
      await t2.getDecimals()
    ).valueInDecimals;

    return await this._estimateGasForSwap(
      fromValue,
      expectedToValue,
      t1,
      t2,
      direction
    );
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
        this.t0,
        this.t1,
        direction
      );
    } else {
      return await this.estimateGas(
        fromValueAbsolute,
        expectedToValueAbsolute,
        this.t1,
        this.t0,
        direction
      );
    }
  }
}
