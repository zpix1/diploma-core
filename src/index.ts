// import { Worker } from './Worker';
// import { closeConnection } from './utils/dbClient';

// const PERIOD = 60 * 60 * 1000;

// const sleep = (ms: number): Promise<void> => {
//   return new Promise(resolve => setTimeout(resolve, ms));
// };

// const main = async (): Promise<void> => {
//   const worker = new Worker();
//   for (let i = 0; ; i++) {
//     await worker.doAll({
//       reloadContracts: i % 10 === 0
//     });
//     const nextTime = new Date(Date.now() + PERIOD);
//     console.log(`Next time at ${nextTime}`);
//     await sleep(PERIOD);
//   }
//   await closeConnection();
// };

// main();

export * from './Worker';
export * from './types';
export * from './config';
