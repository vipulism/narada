import { FinancialClassifier } from "../classifiers/financial/financial.classifier";
import { ServicesConfig } from "../config/loadServices.config";
import { SmsMessage } from "../importers/sms/sms.model";
import { notifyEvent } from "../notifiers/notifier.router";
import { updateServiceState } from "../state/service.state";
import { NaradaEvent } from "./naradaEvent";

export async function processEvent(event: NaradaEvent, config: ServicesConfig): Promise<void> {
    // Update service state
    const state = await updateServiceState(event);

    // Build SMS message
    const smsMessage: SmsMessage = {
        address: event.metadata?.endpoint || "",
        body: event.message,
        contactName: event.metadata?.contactName,
        smsType: event.metadata?.smsType || 0,
        receivedAt: event.timestamp,
        sourceFile: event.metadata?.sourceFile || "",
        rawAttributes: {}, // Initialize as an empty object
    };

    // Initialize classifier
    const financialClassifier = new FinancialClassifier();

    // Classify the SMS message
    const classification = await financialClassifier.classify(smsMessage);


    if (!state.trackable) {
        console.log("⚪ Event is not service-trackable", {
          eventId: event.id,
          type: event.type,
        });
        return;
      }
  
      if (!state.changed) {
        console.log("🟢 No state change", {
          service: event.service?.name,
          state: event.type,
        });
        return;
      }
  
      console.log("📣 State changed", {
        service: event.service?.name,
        from: state.previousState,
        to: state.currentState,
      });


    // If classified as financial, process it further
    if (classification && classification.category === "FINANCIAL") {
        // You can add logic here to handle financial messages
        // For example, notify, log, or save to database
        await notifyEvent(event, classification);
    }
}
