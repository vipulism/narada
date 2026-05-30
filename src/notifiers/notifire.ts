import { NaradaEvent } from "../events/naradaEvent";

export interface Notifier {
    name: string;
    send(event: NaradaEvent): Promise<void>;
  }