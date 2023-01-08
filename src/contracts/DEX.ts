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

  setup(): Promise<void>;
}

export abstract class BaseDEX implements DEX {
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

  toString(): string {
    return `[DEX address=${this.address} X=${this.X} Y=${this.Y}]`;
  }
}
