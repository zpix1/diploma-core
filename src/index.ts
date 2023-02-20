import { Worker } from './Worker';
import { closeConnection } from './utils/dbClient';

const main = async (): Promise<void> => {
  const worker = new Worker();
  await worker.doAll();
  await closeConnection();
};

main();
