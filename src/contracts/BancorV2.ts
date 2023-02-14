import IUniswapV3PoolABI from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';
import Quoter from '@uniswap/v3-periphery/artifacts/contracts/lens/Quoter.sol/Quoter.json';
import { FeeAmount, computePoolAddress } from '@uniswap/v3-sdk';
import Web3 from 'web3';
import { Contract } from 'web3-eth-contract';
import { Token, TokenId } from '../config';
import { combinations } from '../utils/arrays';
import { TokenDecimal } from '../utils/decimals';
import { BaseDEX, DEX } from './DEX';
import { DEXFactory } from './DEXFactory';
import { ERC20 } from './ERC20';
import { SupportedChainId, Token as UniswapToken } from '@uniswap/sdk-core';

export class BancorV2Factory implements DEXFactory {
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

export class UniswapV3Exchange extends BaseDEX implements DEX {
  address!: string;

  private token0!: ERC20;
  private token1!: ERC20;

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

  private async swap(
    absoluteAmount: bigint,
    token0: ERC20,
    token1: ERC20
  ): Promise<TokenDecimal> {
    const amountInDecimals = TokenDecimal.fromAbsoluteValue(
      absoluteAmount,
      await token0.getDecimals()
    ).valueInDecimals;

    // console.table({
    //   token0: token0.address,
    //   token1: token1.address,
    //   fee: this.fee,
    //   amount: amountInDecimals
    // });

    const value = BigInt(
      await this.quoter.methods
        .quoteExactInputSingle(
          token0.address,
          token1.address,
          this.fee,
          amountInDecimals,
          0
        )
        .call()
    );

    const resultTokenDecimal = TokenDecimal.fromValueInDecimals(
      value,
      await token1.getDecimals()
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
    const token0Pre = ERC20.getInstanceOf(this.web3, this.XAdr);
    const token1Pre = ERC20.getInstanceOf(this.web3, this.YAdr);

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

    if (token0Adr !== token0Pre.address) {
      throw new Error('invalid token');
    }

    if (token1Adr !== token1Pre.address) {
      throw new Error('invalid token');
    }

    this.token0 = token0Pre;
    this.token1 = token1Pre;
    this.address = currentPoolAddress;
  }
}