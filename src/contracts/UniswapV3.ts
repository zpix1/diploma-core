import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import Quoter from '@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json';
import { FeeAmount, computePoolAddress } from '@uniswap/v3-sdk';
import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';
import { Token, TokenId } from '../config';
import { combinations } from '../utils/arrays';
import { TokenDecimal } from '../utils/decimals';
import { BaseDEX, BaseXYDEX, DEX } from './DEX';
import { DEXFactory } from './DEXFactory';
import { ERC20, RealERC20 } from './ERC20';
import { SupportedChainId, Token as UniswapToken } from '@uniswap/sdk-core';

export class UniswapV3Factory implements DEXFactory {
  constructor(
    private readonly web3: Web3,
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
      await this.quoter.methods
        .quoteExactInputSingle(
          from.address,
          to.address,
          this.fee,
          amountInDecimals,
          0
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
    return 0n;
  }

  async setup(): Promise<void> {
    const token0Pre = RealERC20.getInstanceOf(this.web3, this.XAdr);
    const token1Pre = RealERC20.getInstanceOf(this.web3, this.YAdr);

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
      poolContract.methods.token0().call(),
      poolContract.methods.token1().call(),
      poolContract.methods.fee().call()
    ]);

    if (Number(fee) !== this.fee) {
      throw new Error(`invalid token fee: ${fee} != ${this.fee}`);
    }

    if (token0Adr !== token0Pre.address) {
      throw new Error('invalid token');
    }

    if (token1Adr !== token1Pre.address) {
      throw new Error('invalid token');
    }

    this.t0 = token0Pre;
    this.t1 = token1Pre;
    this.address = currentPoolAddress;
  }
}
