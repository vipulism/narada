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
        senderCodes: ["ICICIT", "ICICIB"],
        aliases: ["ICICI", "ICICI BANK"],
    },
    {
        name: "YES Bank",
        senderCodes: ["YESBNK"],
        aliases: ["YES", "YES BANK"],
    },
    {
        name: "RBL Bank",
        senderCodes: ["RBLBNK", "RBLCRD"],
        aliases: ["RBL", "RBL BANK"],
    },
    {
        name: "Axis Bank",
        senderCodes: ["AXISBK"],
        aliases: ["AXIS BANK"],
    },
    {
        name: "State Bank of India",
        senderCodes: ["SBIINB", "SBIBNK", "SBICRD", "CBSSBI"],
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
    },
    {
        name: "HSBC",
        senderCodes: ["HSBCBK", "HSBC"],
        aliases: ["HSBC"],
    },
    {
        name: "Tata Neu",
        senderCodes: ["TATANE", "TATANEU"],
        aliases: ["TATA NEU", "TATANEU", "TATA NEU INFINITY"],
    },
    {
        name: "Scapia",
        senderCodes: ["SCAPIA"],
        aliases: ["SCAPIA"],
    },
    {
        name: "IndusInd Bank",
        senderCodes: ["INDUSB", "INDUSIND"],
        aliases: ["INDUSIND", "INDUSIND BANK"],
    },
    {
        name: "IDFC First Bank",
        senderCodes: ["IDFCFB", "IDFCFR"],
        aliases: ["IDFC", "IDFC FIRST", "IDFC FIRST BANK"],
    },
    {
        name: "FASTag",
        senderCodes: ["PARKPL"],
        aliases: ["FASTAG", "PARKPLUS"],
    },
];