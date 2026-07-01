export interface BankDefinition {
    name: string;
    senderCodes: string[];
    aliases: string[];
}

export const BANKS: BankDefinition[] = [
    {
        name: "HDFC Bank",
        senderCodes: ["HDFCBK"],
        aliases: ["HDFC", "HDFC BANK"],
    },
    {
        name: "ICICI Bank",
        senderCodes: ["ICICIT"],
        aliases: ["ICICI", "ICICI BANK"],
    },
    {
        name: "YES Bank",
        senderCodes: ["YESBNK"],
        aliases: ["YES", "YES BANK"],
    },
    {
        name: "RBL Bank",
        senderCodes: ["RBLBNK"],
        aliases: ["RBL", "RBL BANK"],
    },
    {
        name: "State Bank of India",
        senderCodes: ["SBIINB", "SBIBNK"],
        aliases: ["SBI", "STATE BANK OF INDIA"],
    },
    {
        name: "Federal Bank",
        senderCodes: ["FEDBNK"],
        aliases: ["FEDERAL", "FEDERAL BANK"],
    },
    {
        name: "Punjab National Bank",
        senderCodes: ["PNBNK", "PNBSMS", "PNBDBD"],
        aliases: ["PNB", "PUNJAB NATIONAL BANK"],
    }
];