export interface Connector {
  start(): Promise<void>;
  stop(): Promise<void>;
}
