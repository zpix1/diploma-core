import { SupportedChainId, Token as UniswapToken } from '@uniswap/sdk-core';
import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import Quoter from '@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json';
import { FeeAmount, computePoolAddress } from '@uniswap/v3-sdk';
import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';
import { Token, TokenId } from '../config';
import { areAddressesEqual } from '../utils/address';
import { combinations } from '../utils/arrays';
import { BaseXYDEX, DEX } from './DEX';
import { DEXFactory } from './DEXFactory';
import { ERC20, getERC20 } from './ERC20';
import { Web3Balancer } from '../utils/web3Balancer';

export class UniswapV3Factory implements DEXFactory {
  constructor(
    private readonly web3: Web3,
    private readonly balancer: Web3Balancer,
    public readonly name: string,
    private readonly quoterAddress: string
  ) {}

  async getSomeDEXes(tokens: Token[]): Promise<DEX[]> {
    const quoter = new this.web3.eth.Contract(
      Quoter.abi as never,
      this.quoterAddress
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
          const res = [];
          for (const fee of [
            FeeAmount.LOWEST,
            FeeAmount.LOW,
            FeeAmount.MEDIUM,
            FeeAmount.HIGH
          ]) {
            res.push(
              new UniswapV3Exchange(
                this.web3,
                this.balancer,
                x.id,
                y.id,
                x.address,
                y.address,
                quoter,
                fee
              )
            );
          }
          return res;
        })
      )
    ).flat();
  }
}

export const POOL_FACTORY_CONTRACT_ADDRESS =
  '0x1F98431c8aD98523631AE4a59f267346ea31F984';
export const QUOTER_CONTRACT_ADDRESS =
  '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';

export class UniswapV3Exchange extends BaseXYDEX implements DEX {
  address!: string;

  protected t0!: ERC20;
  protected t1!: ERC20;

  constructor(
    private readonly web3: Web3,
    private readonly balancer: Web3Balancer,
    readonly X: TokenId,
    readonly Y: TokenId,
    private readonly XAdr: string,
    private readonly YAdr: string,
    private readonly quoter: Contract,
    private readonly fee: number
  ) {
    super('Uniswap V3');
  }

  protected async _estimateValueAfterSwap(
    amountInDecimals: bigint,
    from: ERC20,
    to: ERC20
  ): Promise<bigint> {
    return BigInt(
      await this.balancer.scheduleCall<string>(
        this.quoter.methods.quoteExactInputSingle(
          from.address,
          to.address,
          this.fee,
          amountInDecimals,
          0
        )
      )
    );
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

    const currentPoolAddress = computePoolAddress({
      factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
      tokenA: new UniswapToken(
        SupportedChainId.MAINNET,
        token0Pre.address,
        Number(await token0Pre.getDecimals())
      ),
      tokenB: new UniswapToken(
        SupportedChainId.MAINNET,
        token1Pre.address,
        Number(await token1Pre.getDecimals())
      ),
      fee: this.fee
    });

    const poolContract = new this.web3.eth.Contract(
      IUniswapV3PoolABI.abi as never,
      currentPoolAddress
    );

    const [token0Adr, token1Adr, fee] = await Promise.all([
      this.balancer.scheduleCall<string>(poolContract.methods.token0()),
      this.balancer.scheduleCall<string>(poolContract.methods.token1()),
      this.balancer.scheduleCall<string>(poolContract.methods.fee())
    ]);

    console.log(token0Adr, token1Adr, fee)

    if (Number(fee) !== this.fee) {
      throw new Error(`invalid token fee: ${fee} != ${this.fee}`);
    }

    if (!areAddressesEqual(token0Adr, token0Pre.address)) {
      throw new Error(`invalid token ${token0Adr} ${token0Pre.address}`);
    }

    if (!areAddressesEqual(token1Adr, token1Pre.address)) {
      throw new Error(`invalid token ${token1Adr} ${token1Pre.address}`);
    }

    this.t0 = token0Pre;
    this.t1 = token1Pre;
    this.address = currentPoolAddress;

    await Promise.all([
      this.checkBalance(this.t0, this.address),
      this.checkBalance(this.t1, this.address)
    ]);
  }
}
