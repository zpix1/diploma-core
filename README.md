# DeFi Arbitrageur: core

Core lib of NSU diploma project, toolkit to search for arbitrage possibilities using Ethereum DEXes.

## Repos

1. diploma-core (this lib)
2. [diploma-app](https://github.com/zpix1/diploma-app) (server/gui/db)

## Installation

```bash
npm ci
npm run build
npm link
```

## Usage
```
npm link diploma-core
```

Code example: 

```typescript
import { Worker } from "diploma-core";

const web3Uri = '<YOUR_WEB3_PROVIDER_URI>';

const main = async () => {
  const worker = new Worker({
    web3ProviderUrl: web3Uri,
    maxTPS: 20,
  });

  const results = await worker.doSearch({
    blockNumber: 16916195,
    capsSet: [370n * 10n ** 18n],
    reloadContracts: true,
    usedFactories: ["Uniswap V2", "Uniswap V3"],
    usedTokens: ["WETH", "USDT", "DYP"],
  });

  console.table(results);

  for (const result of results) {
    if (result.status === "FOUND") {
      console.table(result.strategy);
    }
  }

  console.log("done");
  process.exit(0);
};

main();
```