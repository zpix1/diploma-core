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

export class UniswapV3Factory implements DEXFactory {
  constructor(
    private readonly web3: Web3,
    public readonly name: string,
    private readonly factoryAddress: string,
    private readonly quoterAddress: string
  ) {}

  async getSomeDEXes(tokens: Token[]): Promise<DEX[]> {
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

        const quoter = new this.web3.eth.Contract(
          Quoter.abi as never,
          this.quoterAddress
        );

        return new UniswapV3Exchange(this.web3, x.id, y.id, quoter);
      })
    );
  }
}

export const POOL_FACTORY_CONTRACT_ADDRESS =
  '0x1F98431c8aD98523631AE4a59f267346ea31F984';
export const QUOTER_CONTRACT_ADDRESS =
  '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6';

export class UniswapV3Exchange extends BaseDEX implements DEX {
  readonly address = 'Uniswap v3';

  private token0Adr!: string;
  private token1Adr!: string;
  private fee!: number;
  private token0Decimals: bigint!;
  private token1Decimals: bigint!;

  constructor(
    private readonly web3: Web3,
    readonly X: TokenId,
    readonly Y: TokenId,
    private readonly XAdr: string,
    private readonly YAdr: string,
    private readonly quoter: Contract
  ) {
    super();
  }

  private async swap(
    absoluteAmount: bigint,
    token0Adr: string,
    token1Adr: string
  ): Promise<TokenDecimal> {
    const amountInDecimals = TokenDecimal.fromAbsoluteValue(
      absoluteAmount,
      r1.decimals
    ).valueInDecimals;

    const value = BigInt(
      await this.quoter.methods
        .quoteExactInputSingle(
          poolConstants.token0,
          poolConstants.token1,
          poolConstants.fee,
          fromReadableAmount(
            CurrentConfig.tokens.amountIn,
            CurrentConfig.tokens.in.decimals
          ),
          0
        )
        .call()
    );

    const resultTokenDecimal = TokenDecimal.fromValueInDecimals(
      value,
      r2.decimals
    );

    return resultTokenDecimal;
  }

  async getSwapValue(
    absoluteAmount: bigint,
    direction: 'XY' | 'YX'
  ): Promise<TokenDecimal> {
    if (direction === 'XY') {
      return await this.swap(absoluteAmount, this.token0Adr, this.token1Adr);
    } else {
      return await this.swap(absoluteAmount, this.token1Adr, this.token0Adr);
    }
  }

  async setup(): Promise<void> {
    const currentPoolAddress = computePoolAddress({
      factoryAddress: POOL_FACTORY_CONTRACT_ADDRESS,
      tokenA: {
        address: this.XAdr
      },
      tokenB: {
        address: this.YAdr
      },
      fee: FeeAmount.MEDIUM
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

    const token0 = new ERC20(this.web3, token0Adr);
    const token1 = new ERC20(this.web3, token1Adr);

    this.token0Decimals = await token0.getDecimals();
    this.token1Decimals = await token0.getDecimals();

    (this.token0Adr = token0Adr), (this.token1Adr = token1Adr);
    this.fee = fee;
  }
}
