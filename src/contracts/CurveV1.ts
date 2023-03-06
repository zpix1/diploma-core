import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';

import { Token, TokenId } from '../config';
import { BaseXYDEX, DEX } from './DEX';
import { DEXFactory } from './DEXFactory';

import { combinations } from '../utils/arrays';
import { ERC20, RealERC20, getERC20 } from './ERC20';

import curveV1AddressRegistryABI from '../abi/curve_v1_address_registry.json';
import curveV1ExchangeRegistryABI from '../abi/curve_v1_registry.json';

interface PrecreatedPool {
  tokens: TokenId[];
  address: string;
}

const precreatedPools: PrecreatedPool[] = [
  {
    tokens: ['WBTC', 'USDT', 'ETH'],
    address: '0xd51a44d3fae010294c616388b506acda1bfaae46'
  }
];

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

    const result: DEX[] = [];

    await Promise.all(
      Array.from(combinations(tokens, 2)).map(async pair => {
        const [x, y] = pair.sort((p1, p2) => {
          const a = BigInt(p1.address);
          const b = BigInt(p2.address);
          return a < b ? -1 : a > b ? 1 : 0;
        });

        for (const precreatedPool of precreatedPools) {
          if (
            precreatedPool.tokens.includes(x.id) &&
            precreatedPool.tokens.includes(y.id)
          ) {
            result.push(
              new CurveV1Exchange(
                this.web3,
                x.id,
                y.id,
                x,
                y,
                exchangeRegistry,
                precreatedPool.address
              )
            );
          }
        }

        for (let i = 0; i < 2; i++) {
          const poolAddress = await poolRegistry.methods
            .find_pool_for_coins(x.address, y.address, i)
            .call();
          result.push(
            new CurveV1Exchange(
              this.web3,
              x.id,
              y.id,
              x,
              y,
              exchangeRegistry,
              poolAddress
            )
          );
        }
      })
    );

    return result.filter(
      ({ address }) => address && !this.web3.utils.toBN(address).isZero()
    );
  }
}

export class CurveV1Exchange extends BaseXYDEX implements DEX {
  protected t0!: ERC20;
  protected t1!: ERC20;

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

  protected async _estimateValueAfterSwap(
    amountInDecimals: bigint,
    from: ERC20,
    to: ERC20
  ): Promise<bigint> {
    console.log(
      'curve',
      this.address,
      from.address,
      to.address,
      await from.symbol(),
      await to.symbol(),
      amountInDecimals
    );
    return BigInt(
      await this.registry.methods
        .get_exchange_amount(
          this.address,
          from.address,
          to.address,
          amountInDecimals
        )
        .call()
    );
  }

  protected async _estimateGasForSwap(
    fromAmountInDecimals: bigint,
    toAmountInDecimals: bigint,
    from: ERC20,
    to: ERC20
  ): Promise<bigint> {
    return BigInt(
      (await this.registry.methods
        .exchange(
          this.address,
          from.address,
          to.address,
          fromAmountInDecimals,
          toAmountInDecimals
        )
        .estimateGas()) as number
    );
  }

  async setup(): Promise<void> {
    this.t0 = getERC20(this.web3, this.XTokenData.address);
    this.t1 = getERC20(this.web3, this.YTokenData.address);
  }
}
