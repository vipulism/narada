import { Notifier } from "./notifier";

type NotifierConstructor = new () => Notifier;
const registeredNotifiers = new Map<string, Notifier>();

export function getNotifier(notifireName:string){
    return registeredNotifiers.get(notifireName);
}

export function registerNotifier(Notifier:NotifierConstructor){
    
    const instance = new Notifier();
    console.log(`🔔 Notifier registered: ${instance.name}`);
    registeredNotifiers.set(instance.name, instance);
}

export function initNotifiers(notifiers:NotifierConstructor[]){
    notifiers.forEach(notifier => registerNotifier(notifier))
}



