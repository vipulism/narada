export interface Connector {
    start(): Promise<void>;
    stop(): Promise<void>;
  }


export class Connector implements Connector {
    start(){

    }

    stop(){
        
    }
}