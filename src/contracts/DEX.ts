import { TokenId } from '../config';
import { TokenDecimal } from '../utils/decimals';

export interface DEX {
  readonly address?: string;

  readonly X: TokenId;
  readonly Y: TokenId;

  getSwapValue(
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

  abstract getSwapValue(
    absoluteAmount: bigint,
    direction: 'XY' | 'YX'
  ): Promise<TokenDecimal>;

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

  toString(): string {
    return `[${this.name} address=${this.address} X=${this.X} Y=${this.Y}]`;
  }
}
