export const DEFAULT_DECIMALS = 18n;

// export interface TokenDecimal {
//   readonly valueInDecimals: bigint;
//   readonly decimals: bigint;
//   readonly absoluteValue: bigint;
// }

export class TokenDecimal {
  readonly valueInDecimals: bigint;

  private constructor(
    readonly absoluteValue: bigint,
    readonly decimals: bigint
  ) {
    const ptr = 10n ** (DEFAULT_DECIMALS - this.decimals);
    const rem = absoluteValue % ptr;
    if (rem !== 0n) {
      throw new Error(
        `Too much precision rem=${rem} (absoluteValue=${this.absoluteValue}, decimals=${this.decimals})`
      );
    }

    this.valueInDecimals = absoluteValue / ptr;
  }

  public humanFormat(hint = ''): string {
    const str = new Intl.NumberFormat('en-US', {
      notation: 'compact',
      minimumFractionDigits: 3
    }).format(Number(this.valueInDecimals) / Number(10n ** this.decimals));
    return str;
  }

  public toString(): string {
    return this.humanFormat();
  }

  public toValue(): number {
    return Number(this.valueInDecimals) / Number(10n ** this.decimals);
  }

  static fromAbsoluteValue(
    absoluteValue: bigint,
    decimals: bigint
  ): TokenDecimal {
    return new TokenDecimal(absoluteValue, decimals);
  }

  static fromValueInDecimals(
    valueInDecimals: bigint,
    decimals: bigint
  ): TokenDecimal {
    return new TokenDecimal(
      valueInDecimals * 10n ** (DEFAULT_DECIMALS - decimals),
      decimals
    );
  }
}
