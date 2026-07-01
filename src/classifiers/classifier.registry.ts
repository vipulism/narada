import { SmsClassifier } from "./classifier";
import { FinancialClassifier } from "./financial/financial.classifier";

export const CLASSIFIERS: SmsClassifier[] = [
    new FinancialClassifier(),
];