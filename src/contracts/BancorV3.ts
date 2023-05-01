import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';
import { Token, TokenId } from '../config';
import { combinations } from '../utils/arrays';
import { BaseXYDEX, DEX } from './DEX';
import { DEXFactory } from './DEXFactory';
import { ERC20, getERC20 } from './ERC20';
import NetworkInfoAbi from '../abi/bancor_v3_network_info.json';
import { Web3Balancer } from '../utils/web3Balancer';

export class BancorV3Factory implements DEXFactory {
  constructor(
    private readonly web3: Web3,
    private readonly balancer: Web3Balancer,
    public readonly name: string,
    private readonly networkInfoAddress: string
  ) {}

  async getSomeDEXes(tokens: Token[]): Promise<DEX[]> {
    const networkInfo = new this.web3.eth.Contract(
      NetworkInfoAbi as never,
      this.networkInfoAddress
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
          return new BancorV3Exchange(
            this.web3,
            this.balancer,
            x.id,
            y.id,
            x.address,
            y.address,
            networkInfo,
            this.networkInfoAddress
          );
        })
      )
    ).flat();
  }
}

export class BancorV3Exchange extends BaseXYDEX implements DEX {
  protected t0!: ERC20;
  protected t1!: ERC20;

  constructor(
    private readonly web3: Web3,
    private readonly balancer: Web3Balancer,
    readonly X: TokenId,
    readonly Y: TokenId,
    private readonly XAdr: string,
    private readonly YAdr: string,
    private readonly networkInfo: Contract,
    readonly address: string
  ) {
    super('Bancor V3');
  }

  protected async _estimateValueAfterSwap(
    amountInDecimals: bigint,
    from: ERC20,
    to: ERC20
  ): Promise<bigint> {
    const res = BigInt(
      await this.balancer.scheduleCall<string>(
        this.networkInfo.methods.tradeOutputBySourceAmount(
          from.address,
          to.address,
          amountInDecimals
        )
      )
    );
    // console.log(await from.symbol(), await to.symbol(), amountInDecimals, res);
    return res;
  }
  protected async _estimateGasForSwap(
    fromAmountInDecimals: bigint,
    toAmountInDecimals: bigint,
    from: ERC20,
    to: ERC20
  ): Promise<bigint> {
    return 0n;
  }

  async setup(): Promise<void> {
    const token0Pre = getERC20(this.web3, this.XAdr);
    const token1Pre = getERC20(this.web3, this.YAdr);

    this.t0 = token0Pre;
    this.t1 = token1Pre;
  }
}
