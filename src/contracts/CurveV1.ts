import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';

import { DEXFactory } from './DEXFactory';
import { BaseDEX, DEX } from './DEX';
import { Token, TokenId } from '../config';

import { combinations } from '../utils/arrays';
import { ERC20 } from './ERC20';
import { TokenDecimal } from '../utils/decimals';

import curveV1RegistryABI from '../abi/curve_v1_registry.json';

export class CurveV1Factory implements DEXFactory {
  constructor(
    private readonly web3: Web3,
    public readonly name: string,
    private readonly registryAddress: string
  ) {}

  async getSomeDEXes(tokens: Token[]): Promise<DEX[]> {
    const registry = new this.web3.eth.Contract(
      curveV1RegistryABI as never,
      this.registryAddress
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
        return new CurveV1Exchange(this.web3, x.id, y.id, x, y, registry);
      })
    );
  }
}

export class CurveV1Exchange extends BaseDEX implements DEX {
  private token0!: ERC20;
  private token1!: ERC20;
  readonly address?: string;

  constructor(
    private readonly web3: Web3,
    readonly X: TokenId,
    readonly Y: TokenId,
    readonly XTokenData: Token,
    readonly YTokenData: Token,
    readonly registry: Contract
  ) {
    super('Curve V1');
  }

  private async swap(
    absoluteAmount: bigint,
    t1: ERC20,
    t2: ERC20
  ): Promise<TokenDecimal> {
    const amountInDecimals = TokenDecimal.fromAbsoluteValue(
      absoluteAmount,
      await t1.getDecimals()
    ).valueInDecimals;

    const amount = (
      await this.registry.methods
        .get_best_rate(t1.address, t2.address, amountInDecimals)
        .call()
    )[1];

    const value = BigInt(amount);

    const resultTokenDecimal = TokenDecimal.fromValueInDecimals(
      value,
      await t2.getDecimals()
    );

    return resultTokenDecimal;
  }

  async getSwapValue(
    absoluteAmount: bigint,
    direction: 'XY' | 'YX'
  ): Promise<TokenDecimal> {
    if (direction === 'XY') {
      return await this.swap(absoluteAmount, this.token0, this.token1);
    } else {
      return await this.swap(absoluteAmount, this.token1, this.token0);
    }
  }

  async setup(): Promise<void> {
    this.token0 = ERC20.getInstanceOf(this.web3, this.XTokenData.address);
    this.token1 = ERC20.getInstanceOf(this.web3, this.YTokenData.address);
  }
}
