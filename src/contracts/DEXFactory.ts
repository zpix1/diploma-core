import { Token } from '../config';
import { DEX } from './DEX';

export interface DEXFactory {
  readonly name: string;
  getSomeDEXes(tokens: readonly Token[]): Promise<DEX[]>;
}
