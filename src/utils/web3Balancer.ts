/* eslint-disable @typescript-eslint/no-explicit-any */
// we have to use any bc web3-eth-contract is not typed enough
import type { ContractSendMethod } from 'web3-eth-contract';
import { DeferredPromise } from './deferredPromise';

type Task = {
  payload: ContractSendMethod;
  resolve: (T: any) => void;
  reject: (T: any) => void;
};

const MAX_TPS = 50;

class Web3Balancer {
  private currentTPS = 0;
  private taskQueue: Task[] = [];
  private intervalId: NodeJS.Timer;

  constructor() {
    this.intervalId = setInterval(() => {
      this.currentTPS = 0;
      this.runTasks();
    }, 1000);
  }

  public dispose(): void {
    clearInterval(this.intervalId);
  }

  public scheduleCall<T>(method: ContractSendMethod): Promise<T> {
    const deferred = new DeferredPromise<T>();
    this.taskQueue.push({
      payload: method,
      resolve: deferred.resolve,
      reject: deferred.reject
    });
    return deferred.promise;
  }

  private executeTask(task: Task): void {
    task.payload
      .call()
      .then(value => task.resolve(value))
      .catch(error => task.reject(error));
  }

  private runTasks(): void {
    while (this.currentTPS <= MAX_TPS) {
      const task = this.taskQueue.pop();
      if (task) {
        this.executeTask(task);
        this.currentTPS++;
      } else {
        break;
      }
    }
  }
}

export const Balancer = new Web3Balancer();
