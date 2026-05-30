import { Notifier } from "./notifire";

type NotifierConstructor = new () => Notifier;
const registeredNotifiers = new Map<string, Notifier>();

export function getNotifier(notifireName:string){
    return registeredNotifiers.get(notifireName);
}

export function registerNotifier(Notifier:NotifierConstructor){
    console.log("I amm called and registered!!!!");
    
    const instance = new Notifier();
    registeredNotifiers.set(instance.name, instance);
}

export function initNotifications(notifiers:NotifierConstructor[]){
    notifiers.forEach(notifier => registerNotifier(notifier))
}



