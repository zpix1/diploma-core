import { TokenId } from '../config';

export interface DEX {
  readonly address?: string;

  readonly X: TokenId;
  readonly Y: TokenId;

  getSwapValue(amount: bigint, direction: 'XY' | 'YX'): Promise<bigint>;
}

export abstract class BaseDEX implements DEX {
  abstract getSwapValue(
    amount: bigint,
    direction: 'XY' | 'YX'
  ): Promise<bigint>;
  abstract readonly address?: string;
  abstract readonly X: TokenId;
  abstract readonly Y: TokenId;

  toString() {
    return `[DEX address=${this.address} X=${this.X} Y=${this.Y}]`;
  }
}
