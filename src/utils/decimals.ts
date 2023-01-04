const DEFAULT_DECIMALS = 18n;

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

  static fromAbsoluteValue(absoluteValue: bigint, decimals: bigint) {
    return new TokenDecimal(absoluteValue, decimals);
  }

  static fromValueInDecimals(valueInDecimals: bigint, decimals: bigint) {
    return new TokenDecimal(
      valueInDecimals * 10n ** (DEFAULT_DECIMALS - decimals),
      decimals
    );
  }
}
