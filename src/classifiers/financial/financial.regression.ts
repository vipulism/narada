import { FinancialClassifier } from "./financial.classifier";
import { SmsCategory, SmsMessage } from "../../importers/sms/sms.model";
import { isPersistableTransfer, filterPostedEvents } from "./financial.eventFilter";
import { FinancialEvent } from "./financial.model";
import { extractFireflyAccountLast4, FireflyLast4Index } from "../../connectors/firefly/firefly.accountMap";
import { planFireflyTransaction } from "../../connectors/firefly/firefly.dryRun";
import { FireflyOpenings } from "../../connectors/firefly/firefly.openings";
import { KnownAccountIndex } from "./knownAccounts";
import { KnownAccount } from "./knownAccount.model";
import { resolveDhanAccount, stampDhanAccount } from "./financial.dhanMap";
import { isDueKnowledgeRow, parseDueAmounts } from "./financial.due";

interface ExpectedFacts {
    category: SmsCategory;
    subcategory: string;
    cashFlow?: string;
    merchant?: string;
    accountLast4?: string;
    amount?: number;
    transactionType?: string;
}

interface RegressionCase {
    id: string;
    address: string;
    body: string;
    expect: ExpectedFacts;
}

/**
 * Locked classify cases. Run after adding a pattern so existing flow does not regress.
 */
const CASES: RegressionCase[] = [
    {
        id: "181-bses-paid",
        address: "51466",
        body: "Bill Payment Successful for BSES CA Number 100345526. Amount - Rs.700.00. BBPS reference number:  BD01A5180815.  . If eligible, cashback will be credited within 72 hours. https://amzn.in/d/f3OLoI7",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 700,
            merchant: "BSES",
            transactionType: "BBPS",
        },
    },
    {
        id: "bses-due-stays-bill",
        address: "VM-PAYTMB",
        body: "New Electricity Bill for BSES Yamuna Consumer No 100345526 is ready. Amount Rs 530. Due on 26th May 2021.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "NEUTRAL",
            merchant: "BSES",
        },
    },
    {
        id: "icici-last3-outflow",
        address: "JK-ICICIB",
        body: "ICICI Bank Acc XX412 debited with INR 10,000.00 on 26-JAN-23. NFS*P3ECND77*.Avb Bal: INR5,10,378.87.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            accountLast4: "1412",
        },
    },
    {
        id: "savings-credit-income",
        address: "JK-ICICIB",
        body: "ICICI Bank Acc XX1412 has been credited with INR 5000.00 on 26-JAN-23",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "income",
            cashFlow: "INFLOW",
            accountLast4: "1412",
        },
    },
    {
        id: "cc-credit-not-income",
        address: "CP-HDFCBK-S",
        body: "HDFC Bank Cardmember, Online Payment of Rs.2252 vide Ref# 177010939lwmAXc was credited to your card ending 1687 On 26/JUN/2026",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "NEUTRAL",
            amount: 2252,
            accountLast4: "1687",
        },
    },
    {
        id: "17765-hdfc-1687-bill",
        address: "AD-HDFCBK-S",
        body: "DEAR HDFCBANK CARDMEMBER, PAYMENT OF Rs. 430.00 RECEIVED TOWARDS YOUR CREDIT CARD ENDING WITH 1687 ON 26-4-2026.YOUR AVAILABLE LIMIT IS RS. 796252.09",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "NEUTRAL",
            amount: 430,
            accountLast4: "1687",
        },
    },
    {
        id: "yes-0336-payment-skip",
        address: "AX-YESBNK-S",
        body: "Dear Cardmember, payment of Rs.398.46 is received towards your YES BANK Credit Card ending 0336. It will reflect in your Credit Card within 1-2 working days",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "sbi-ending-85-not-8561",
        address: "JM-SBICRD-S",
        body: "We have received payment of Rs.45,889.00 via Visa Credit Card Pay and the same has been credited to your SBI CARD ending 85. Your available limit is Rs.200,000.04.",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "sbi-xx61-unique-cc",
        address: "JM-SBICRD-S",
        body: "E-statement of SBI Credit Card ending XX61 dated 07/12/2025 has been mailed. Total Amt Due Rs 3131; Min Amt Due Rs 200; Payable by 27/12/2025.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "NEUTRAL",
            accountLast4: "8561",
        },
    },
    {
        id: "fastag-not-idfc-wealth",
        address: "VD-IDFCFB",
        body: "Dear Customer, txn. of INR 50 using IDFC FIRST Bank FASTag 5940 done at Shipra Mall on 12/08/2023 12:46. Avbl. Bal.: INR 640 #FirsTAGyourseatbelt",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            accountLast4: "5940",
            merchant: "Shipra Mall",
        },
    },
    {
        id: "max-life-premium",
        address: "AX-MAXLIT",
        body: "Dear MR. VIPUL SHARMA, Congratulations on securing the future of your loved ones. We have received a payment of Rs. 10225.51 on 01-02-2022 17:31:50 for your Max Life policy 884998147 with transaction no. TCY10416222200. Register your Bank Account to enable auto-debit.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            merchant: "Max Life",
            amount: 10225.51,
        },
    },
    {
        id: "dominos-order",
        address: "VM-DOMINO-S",
        body: "Thanks for choosing Domino's.We will deliver your order hot & fresh at the earliest|Order no. 95 |Amount:Rs. 187.00 |Track order@ https://m.dominos.co.in/track",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 187,
            merchant: "Domino's",
        },
    },
    {
        id: "rbl-charge-expense",
        address: "VKRBLBNK",
        body: "A charge of INR 800.00 has been initiated on your RBL Credit card ending with 7111 at Netflix (pgsi) on 11-12-2018 without using OTP validation.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 800,
            merchant: "Netflix",
        },
    },
    {
        id: "1244-paytm-metro",
        address: "VK-IPAYTM",
        body: "Paid Rs.73  to Paytm Metro Card Recharge at Aug 17, 2019 14:22:28 . Order ID: 9013756692 . Updated Balance: Paytm Wallet- Rs 0",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 73,
            merchant: "Paytm Metro Card Recharge",
        },
    },
    {
        id: "1107-phonepe-collect-skip",
        address: "TMPHONPE",
        body: "UBER INDIA SYSTEMS PVT LTD has requested money from you on PhonePe. Rs.73.19 will be debited from your account on approving the request - http://phon.pe/akj8cfi6",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "8843-yes-due-is-bill",
        address: "JX-YESBNK",
        body: "Dear Cardmember, Payment of YES BANK Credit Card ending 0336 is due on 05/06/23. Min due is Rs.467.96 & Total Due Rs.9359.17. Please pay before the last date to avoid charges. Kindly ignore if already paid.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "NEUTRAL",
            amount: 467.96,
        },
    },
    {
        id: "13097-icici-min-due-bill",
        address: "JD-ICICIT",
        body: "Total Due INR 6447 & Min Due INR 330 to be paid by 30-Nov-24 on ICICI Bank Credit Card XX0004. Non-payment of Min Due will be reported to credit bureaus",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "NEUTRAL",
            accountLast4: "0004",
            amount: 6447,
        },
    },
    {
        id: "14471-yes-payment-is-due-bill",
        address: "JX-YESBNK",
        body: "Payment of Credit Card X0336 is due on 06/05/25. Min due Rs.175.10. Total Due Rs.175.10. Pay before last date to avoid charges. Ignore if paid-YES BANK",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "NEUTRAL",
        },
    },
    {
        id: "13598-rbl-spent",
        address: "JD-RBLCRD",
        body: "INR954.67 spent at RAZ*COMMODUM GROCERIES on RBL Bank credit card (7111) on 13-01-2025.AVL limit- INR40,045.33. Not you? Call 022-62327777",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 954.67,
            merchant: "RAZ*COMMODUM GROCERIES",
        },
    },
    {
        id: "10159-axis-spent-dominos",
        address: "VK-AxisBk",
        body: "Spent\nCard no. XX6147\nINR 845.09\n26-11-23 16:15:43\nDOMINOS PIZ\nAvl Lmt INR 169581.71\nSMS BLOCK 6147 to 919951860002, if not you - Axis Bank",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 845.09,
            merchant: "Domino's",
        },
    },
    {
        id: "7936-icici-xx0004-ack-bill",
        address: "TM-ICICIB",
        body: "Dear Customer, Payment of INR 506.99 has been received towards your ICICI Bank Credit Card XX0004 on 26-JAN-23 through UPI. Thank you.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "NEUTRAL",
            amount: 506.99,
            accountLast4: "0004",
        },
    },
    {
        id: "18220-axis-max-life",
        address: "VM-AXMAXT-S",
        body: "Dear Customer, we have received an amount of Rs. 119013 towards payment of your Axis Max Life policy 643208192, subject to realization. T&C apply.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            merchant: "Max Life",
            amount: 119013,
        },
    },
    {
        id: "3308-paid-rs-paytm-metro",
        address: "BPiPaytm",
        body: "Paid Rs.335 to Paytm Metro Payment from Paytm Balance. Updated Balance: Paytm Wallet- Rs 0. More Details: https://paytm.me/30pA-Dr",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 335,
            merchant: "Paytm Metro Payment",
        },
    },
    {
        id: "12336-fastag-toll-paid",
        address: "JK-IDFCFB",
        body: "INR 40 toll paid from IDFC FIRST Bank Tag 3XXX5940 for vehicle no. DL12CW0380 at Panipat Toll Plaza on 01/09/24 15:50. Avbl. Bal.: INR815.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 40,
            accountLast4: "5940",
            merchant: "Panipat Toll Plaza",
        },
    },
    {
        id: "15733-idfc-bill-due",
        address: "JD-IDFCFB-S",
        body: "Your FIRST Wealth Credit Card XX4346 bill due by 07 October, 2025\nTotal Due: INR 926.84\nMin Due: INR 100.00\nPay: https://idfcfr.in/i20etK\nIDFC FIRST Bank",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "NEUTRAL",
            amount: 926.84,
        },
    },
    {
        id: "10790-axis-e-statement-bill",
        address: "CP-AxisBk",
        body: "E-statement of your Axis Bank Credit Card no. XX6147 has been generated. Total Amount Due INR  Dr. 1554.6, Minimum Amount Due INR Dr. 100, Due date 01-MAR-24. Click https://cc.axisbank.co.in/pUO7H-uFX to view/download.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "NEUTRAL",
        },
    },
    {
        id: "13385-sbi-bbps-unique-cc-bill",
        address: "VM-SBICRD",
        body: "We have received payment of Rs.2,735.00 via BBPS & the same has been credited to your SBI Credit Card. Your available limit is Rs.104,000.44.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "NEUTRAL",
            amount: 2735,
            accountLast4: "8561",
            transactionType: "BBPS",
        },
    },
    {
        id: "4423-olamoney-expense",
        address: "TMOLAMNY",
        body: "Payment of Rs. 140.0 using OlaMoney Postpaid for your transaction fztn-925x-txpk on OlaCabs is successful. Not you? Write to us at support@olamoney.com",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 140,
            merchant: "Ola",
        },
    },
    {
        id: "2213-self-transfer-not-expense",
        address: "VKYESBNK",
        body: "Your a/c no. XXXXXXXXXXX3330 is debited for Rs.50000.00 on 19-03-2020 and a/c XXXXXXXXXXX1260 credited (IMPS Ref no 007902449179).",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "transfer",
            cashFlow: "NEUTRAL",
            amount: 50000,
            accountLast4: "1260",
            transactionType: "IMPS",
        },
    },
    {
        id: "self-transfer-both-owned",
        address: "JK-ICICIB",
        body: "Your a/c no. XXXXXXXXXXX1412 is debited for Rs.2000.00 on 19-03-2020 and a/c XXXXXXXXXXX1260 credited (IMPS Ref no 007902449179).",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "transfer",
            cashFlow: "NEUTRAL",
            amount: 2000,
            accountLast4: "1412",
            transactionType: "IMPS",
        },
    },
    {
        id: "imps-out-unowned-credit-is-expense",
        address: "JK-ICICIB",
        body: "Your a/c no. XXXXXXXXXXX1412 is debited for Rs.500.00 on 19-03-2020 and a/c XXXXXXXXXXX9999 credited (IMPS Ref no 007902449179).",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 500,
            accountLast4: "1412",
            transactionType: "IMPS",
        },
    },
    {
        id: "3430-income-not-clearing-merchant",
        address: "VKHDFCBK",
        body: "UPDATE: INR 1,13,319.00 deposited in A/c XX1260 on 07-JAN-21 for NEFT Cr-KKBK0000958-ARCHER TECHNOLOGIES PRIVATE LIMITED-Vipul Sharma-KKBK210073463539.Avl bal:INR 11,71,465.82 subject to clearing",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "income",
            cashFlow: "INFLOW",
            amount: 113319,
            accountLast4: "1260",
            transactionType: "NEFT",
        },
    },
    {
        id: "16513-igl-paid-expense",
        address: "JM-IGLMKT-S",
        body: "Online Payment Confirmation \nDear Customer, Payment of Rs. 1116.99 received against BP No. 7000368084 On 19.12.2025. Posting of payment is subject to realization. IGL \n",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 1116.99,
        },
    },
    {
        id: "11832-icici-xx412-xx424-transfer",
        address: "JD-ICICIT",
        body: "ICICI Bank Acct XX412 debited with Rs 17,000.00 on 01-Jul-24 & Acct XX424 credited.IMPS:418313105770. Call 18002662 for dispute or SMS BLOCK 412 to 9215676766",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "transfer",
            cashFlow: "NEUTRAL",
            amount: 17000,
            accountLast4: "1412",
            transactionType: "IMPS",
        },
    },
    {
        id: "2227-same-vpa-self-transfer",
        address: "VKYESBNK",
        body: "Rs 50,000.00 Debited to Ac XX0592 on 19-MAR 18:17-UPI/007972996523/From:vipulism@ybl/To:vipulism@ybl/Payment from PhonePe Tot Avbl Bal-Rs 811,870.45 on 19-Mar 18:17. In case you have not done this transaction, SMS BLKMB <Space><Cust ID> to 9840909000 from your registered mobile number to block Mobile Banking.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "transfer",
            cashFlow: "NEUTRAL",
            amount: 50000,
            accountLast4: "0592",
            transactionType: "UPI",
        },
    },
    {
        id: "3667-box8-credits-skip",
        address: "AD-BOXEHT",
        body: "Acct credited with INR75 credits (valid for 7days) by BOX8- India's Largest Desi Meals Brand 1Credit=Re.1 Redeem credits for meals on BOX8 app urlzs.com/DaHym",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "6060-autopay-active-skip",
        address: "VM-HDFCBK",
        body: "AutoPay (E-mandate) Active! Merchant: MAX LIFE Desc: Maxlife Policy Number 884998147 Current Txn Amt(Rs): 10225.51 Max Txn Amt(Rs): 11248.06 Freq: As Presented Start Dt: 01/02/2022 End Dt: 01/02/2033 SI Hub ID : VpTxLAZZyR On HDFC Bank Credit Card xx7577 Manage: https://www.sihub.in/managesi/hdfcbank TnC",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "15996-neucoin-skip",
        address: "AX-MYTNEU-S",
        body: "Hi, your account has been debited with 62.43 NeuCoin(s) towards your return request for order 139987082 at Tata CLiQ - Team TataNeu",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "4887-hdfc-debited-from-bank-xx",
        address: "VKHDFCBK",
        body: "UPDATE: INR 26,018.00 debited from HDFC Bank XX1260 on 27-JUL-21. Info: UPI-CRED-cred@axisb-UTIB0000114-120819533475-payment on CRED. Avl bal:INR 14,47,780.51",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "OUTFLOW",
            amount: 26018,
            accountLast4: "1260",
            transactionType: "UPI",
        },
    },
    {
        id: "7627-thanks-for-paying-maxlife",
        address: "TM-HDFCBK",
        body: "Thanks for paying Rs.2.00 from A/c XXXX1260 to MAXLIFEINSURANCECOLT via HDFC Bank NetBanking. Call 18002586161 if txn not done by you.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 2,
            accountLast4: "1260",
            merchant: "Max Life",
        },
    },
    {
        id: "1182-hsbc-used-at-swiggy",
        address: "VKHSBCIN",
        body: "HSBC: Your credit card xxxxx4433 has been used at swiggy for INR 41.00 on 08/08/19. Available limit - INR 149959.00; current outstanding - INR 41.00. If you want to report this as a fraud transaction and block your card, please call +914067173402 Or SMS 'BLOCK<space>CC<space>last 4 digits of your card number to '57575",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 41,
            accountLast4: "4433",
            merchant: "swiggy",
        },
    },
    {
        id: "15354-juspay-apay-skip",
        address: "CP-JUSPAY-S",
        body: "Payment of Rs 1301.00 using Apay Balance successful at merchant. Updated Balance is Rs 0.00 - SMS by Juspay",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "5891-yes-new-fd-investment",
        address: "VM-YESBNK",
        body: "Rs 15,000.00 Debited to Ac XX0592 on 01-JAN 09:44-NET-New FD-VIPUL SHARMA-016648000000121 -1-CHANDNICHOWK Tot Avbl Bal-Rs 455,991.91 on 01-Jan 09:44. Warm Regards, YES Bank.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "investment",
            cashFlow: "OUTFLOW",
            amount: 15000,
            accountLast4: "0592",
        },
    },
    {
        id: "14447-axis-mf-sip-investment",
        address: "CP-AXISMF",
        body: "Dear Investor, Payment of Rs. 2999.85 towards your SIP in Axis Small Cap Fund Direct Growth has been received and 26.505 units at NAV 113.18 are allotted in Folio XXXXXXXXX5143. Axis MF",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "investment",
            amount: 2999.85,
        },
    },
    {
        id: "14236-sbi-home-loan-emi-due-skip",
        address: "VA-CBSSBI",
        body: "Dear customer, EMI due on 05042025 in A/c XXXXX489751. Please pay in time. Please ignore, if already paid.-SBI",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "12063-yes-upi-merchant-not-phone",
        address: "VA-YESBNK",
        body: "INR 24.00 spent on YES BANK Card X4472 @UPI_CNL ENTERPRISES 27-07-2024 09:34:48 am. Avl Lmt INR 799,102.66. SMS BLKCC 4472 to 9840909000 if not you",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 24,
            merchant: "CNL ENTERPRISES",
        },
    },
    {
        id: "7837-hdfc-to-icici-self-transfer",
        address: "JX-HDFCBK",
        body: "HDFC Bank: Rs. 25000.00 debited from a/c **1260 on 09-01-23 to a/c **1412 (UPI Ref No. 300919229325). Not you? Call on 18002586161 to report",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "transfer",
            cashFlow: "NEUTRAL",
            amount: 25000,
            accountLast4: "1260",
            transactionType: "UPI",
        },
    },
    {
        id: "13060-used-rs-hdfc-1687",
        address: "VM-HDFCBK",
        body: "Used Rs30.00 On HDFCBank Card 1687 At paytmqr5wpzku@ptys by UPI 432100677468 On 16-11 Not You? Call 18002586161/SMS BLOCK CC 1687 to 7308080808",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 30,
            accountLast4: "1687",
            transactionType: "UPI",
        },
    },
    {
        id: "8210-money-transferred-outflow",
        address: "VM-HDFCBK",
        body: "Money Transferred - INR 75,000.00 from HDFC Bank A/c XX1260 on 06-03-23 to A/c xxxxxxxxxx0191. (IMPS Ref No. 306516345845) Avl bal:INR 52,227.95 Not you? Call 18002586161",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 75000,
            accountLast4: "1260",
            transactionType: "IMPS",
        },
    },
    {
        id: "10944-money-received-income",
        address: "VD-HDFCBK",
        body: "Money Received - INR 22,000.00 in your HDFC Bank A/c XX1260 on 29-02-24 by A/c linked to mobile no XX6599 (IMPS Ref No. 406019081798) Avl bal: INR 67,537.69",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "income",
            cashFlow: "INFLOW",
            amount: 22000,
            accountLast4: "1260",
            transactionType: "IMPS",
        },
    },
    {
        id: "17645-hdfc-1687-amount-due-bill",
        address: "VD-HDFCBK-S",
        body: "Amount Due Rs.430 on HDFC Bank Credit Card 1687. Pay instantly by 29/APR/2026 via PayZapp > Bill Pay > Credit Card: https://hdfcbk.io/HDFCBK/s/vbkvX6JM",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "NEUTRAL",
            amount: 430,
            accountLast4: "1687",
        },
    },
    {
        id: "14833-icici-0004-kindly-pay-due-bill",
        address: "JX-ICICIT-S",
        body: "Kindly pay total due of Rs 2,296.92 or Min Due Rs 120.00 by 30-Jun-25 on ICICI Bank Credit Card XX0004 to avoid reporting to credit bureaus",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "NEUTRAL",
            amount: 2296.92,
            accountLast4: "0004",
        },
    },
    {
        id: "8978-fastag-refund-will-be-skip",
        address: "AX-PARKPL",
        body: "Your FASTag recharge order 37664892 could not be processed. Refund of Rs. 10 will be credited to your account in 5-7 working days. -Park+",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "2331-epfo-covid-skip",
        address: "VKEPFOHO",
        body: "In view of our Hon'ble Prime Minister's appeal EPFO urges all its establishments not to cut salaries or resort to layoffs of their employees,unable to work due to Covid19 or lockdown. Let's all stay united to continue our fight against the Covid19 pandemic.",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "832-paytm-transferred-to-expense",
        address: "VKiPaytm",
        body: "Rs. 50 transferred to 7533006583 at 2:18 PM. Transaction ID 24768595563 , Updated Balance Paytm Wallet- Rs 1490.69",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 50,
        },
    },
    {
        id: "3175-paytm-wallet-transfer-expense",
        address: "BP-iPaytm",
        body: "Rs. 370 transferred to Paytm wallet linked with 9958790032. Updated Balance: Rs. 135. More Details: https://paytm.me/4a3-wOJ",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 370,
        },
    },
    {
        id: "3140-vi-prepaid-due-skip",
        address: "VDViCARE",
        body: "Hi! Please make immediate payment to stay connected this festive season. An amount of Rs.175.86 is due on your alternate Vi number 9711196599. Please use Account ID-168830301 while making the payment. To pay click https://www.billdesk.com/pgidsk/pgmerc/vil/VIL_details.jsp Incase of any assistance please call at 9811814230/ 9891000215 between 9.00 am to 6.00 pm. Please ignore if already paid.",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "1506-paytm-postpaid-due-skip",
        address: "BPVpaytm",
        body: "Your Paytm Postpaid bill for Oct, 2019. Due Amount = Rs. 378 Due Date = 07-Nov-19 Kindly pay in time to continue using your Postpaid account and avoid a late fee penalty. Please ignore if already paid.",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "17255-zero-penal-credit-skip",
        address: "AD-SBMIND-S",
        body: "Your account XX5316 is credited with INR 0.00 on 01-03-2026. Info:20052210565316:PenalChargeColl.The Curr bal is 2.00. SBM BANK (INDIA).",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "4817-payzapp-wallet-income",
        address: "VMPayZap",
        body: "ALERT: Rs. 27.75 has been credited to your PayZapp wallet 3982. Avl Bal: Rs. 27.93",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "income",
            cashFlow: "INFLOW",
            amount: 27.75,
        },
    },
    {
        id: "14661-milkbasket-topup-expense",
        address: "VM-MLBASK",
        body: "Dear Customer, your Milkbasket top-up was successful! Your account has been credited with Rs. 150.0 on 2025-05-31 01:29:34. New Balance: Rs 220.76. Thank you!",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 150,
            merchant: "Milkbasket",
        },
    },
    {
        id: "6917-yes-imps-owned-payee-transfer",
        address: "VK-YESBNK",
        body: "Rs 200,000.00 Debited to Ac XX0592 on 05-AUG 18:48-IMPS/NA/XXXX1260/RRN:221718648405/6588085827940851331/HDFC Bank/VIPUL SHARMA/Ghar3 Tot Avbl Bal-Rs 304,019.69 on 05-Aug 18:48. In case you have not done this transaction, SMS BLKMB <Space><Cust ID> to 9840909000 from your registered mobile number to block Mobile Banking. Warm Regards, YES Bank.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "transfer",
            cashFlow: "NEUTRAL",
            amount: 200000,
            accountLast4: "0592",
            transactionType: "IMPS",
        },
    },
    {
        id: "7448-e-insurance-skip",
        address: "CP-ICICIP",
        body: "Dear customer, your ICICI Pru iProtect Smart       policy no. D8390498 is credited to your e-Insurance account no. 1000077045016 and free look period of this policy has started on 05/11/2022. For further details refer your policy terms & conditions.",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "13419-e-insurance-nsdl-skip",
        address: "VK-NIRSMS",
        body: "Insurance Policy 2302206026365800001 is credited to your e Insurance Account 1000077045016 with NSDL NIR. Login at https://nir.ndml.in to check the policy.",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "2682-hsbc-received-a-payment-bill",
        address: "BPHSBCIN",
        body: "Dear Customer, we have received a payment of Rs.4327.9 for credit card ending 4433 on 14-JUL-20. Thank you for using HSBC credit card.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "NEUTRAL",
            amount: 4327.9,
            accountLast4: "4433",
        },
    },
    {
        id: "7725-icici-cardless-cash-expense",
        address: "AX-ICICIB",
        body: "Dear Customer, INR 10,000.00 has been withdrawn on 15-Dec-22, through a Cardless Cash withdrawal, at ICICI Bank ATM. Info:CCW*S1CPN289*5362674*Cardles. Call on 18002662 for any dispute or SMS BLOCK 412 to 9215676766 . Visit bit.ly/Cardlesstrnx . T&C apply.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 10000,
        },
    },
    {
        id: "430-phonepe-requested-rs-skip",
        address: "ADPHONPE",
        body: "UBER INDIA SYSTEMS PVT LTD has requested Rs.97.03 on your PhonePe app. To pay instantly click here http://phon.pe/r5x0r4j3",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "8573-payzapp-wallet-debit-expense",
        address: "VD-PayZap",
        body: "ALERT: Rs. 127.93 has been debited from your PayZapp wallet 3982. Avl Bal: Rs. 0.00",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 127.93,
        },
    },
    {
        id: "99-phonepe-bses-paid-expense",
        address: "TMPHONPE",
        body: "Payment of Rs.850 for BSES Yamuna Delhi Electricity bill (100345526) via PhonePe (Transaction Id: N1811252224553015453731) has been successful.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 850,
            merchant: "BSES",
        },
    },
    {
        id: "15426-cdsl-bonus-shares-skip",
        address: "VM-CDSLTX-S",
        body: "CDSL:CREDITED IN A/C *10044358 SHARES OF HDFC BANK LIMITED TOWARDS BONUS ALLOTMENT ON 29/08/2025.CONTACT YOUR DP FOR MORE INFORMATION.",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "15279-bk-crowns-skip",
        address: "CP-BURKIN-S",
        body: "Hi vipul, 338 Crowns credited to your BK account. Redeem them on the BK app now! Valid for 180 days only. -Burger King",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "7905-cams-e-insurance-skip",
        address: "VM-CAMSRP",
        body: "Dear VIPUL SHARMA , Your e Insurance account is already created with CTTPS1305Q number by other repositories. Hence unable to process your request - PolicyGenie by CAMS Insurance Repository Services",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "846-rbl-old-card-confirm-receipt-skip",
        address: "VMRBLBNK",
        body: "We confirm receipt of Rs. 9,773.00 for your RBL card ending XXXX-7111. Pls use NEFT to pay RBL card bill and get early credit of funds, IFSC code RATN0CRCARD",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "3069-yes-funds-trf-own-account-transfer",
        address: "VMYESBNK",
        body: "Rs 12,000.00 Debited to Ac XX3330 on 30-OCT 12:15-Funds Trf to XX0592/own account/5 and 12 Tot Avbl Bal-Rs 29,110.87 on 30-Oct 12:15. In case you have not done this transaction, SMS BLKMB <Space><Cust ID> to 9840909000 from your registered mobile number to block Mobile Banking.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "transfer",
            cashFlow: "NEUTRAL",
            amount: 12000,
            accountLast4: "0592",
        },
    },
    {
        id: "6286-icici-cred-club-bill",
        address: "JM-ICICIB",
        body: "ICICI Bank Acct XX412 debited for Rs 5717.00 on 26-Mar-22; CRED credited. UPI:208518313479. Call 18002662 for dispute. SMS BLOCK 412 to 9215676766.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "OUTFLOW",
            amount: 5717,
            accountLast4: "1412",
            transactionType: "UPI",
        },
    },
    {
        id: "14629-icici-cred-club-bill",
        address: "AD-ICICIT-S",
        body: "ICICI Bank Acct XX412 debited for Rs 13205.00 on 26-May-25; CRED Club credited. UPI:551226531337. Call 18002662 for dispute. SMS BLOCK 412 to 9215676766.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "OUTFLOW",
            amount: 13205,
            accountLast4: "1412",
            transactionType: "UPI",
        },
    },
    {
        id: "6536-sbi-debit-by-transfer-expense",
        address: "BZ-CBSSBI",
        body: "Dear Customer, Your A/C XXXXX366424 has a debit by transfer of Rs 118.00 on 19/05/22. Avl Bal Rs 58,397.80.-SBI",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 118,
            accountLast4: "6424",
        },
    },
    {
        id: "5827-yes-autopay-processed-expense",
        address: "JD-YESBNK",
        body: "Dear Customer, Auto-Pay of Rs. 189.00 for YouTube has been processed on your YES Bank Card XXXXXXXXXXXX0336. Manage your Auto-Pay with ID VfLaJn4Xpd via https://www.sihub.in/managesi/yesbank .T&C apply",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 189,
        },
    },
    {
        id: "3091-rbl-supercard-credit-skip",
        address: "ADSPRCRD",
        body: "Your RBL Bank SuperCard(XX7111) has been credited with Rs3.83 towards One-time Govt ex gratia Interest on 04-11-20. Click t.gi9.in/HKUxK to know more",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "15345-icici-cc-refund-not-bill",
        address: "JD-ICICIT-S",
        body: "AMAZON PAY IN GROCERY refund of Rs 623.00 credited to ICICI Bank Credit Card XX0004 on 15-AUG-25. Revised total due Rs 0, minimum due Rs .00",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "UNKNOWN",
            cashFlow: "NEUTRAL",
            amount: 623,
            accountLast4: "0004",
        },
    },
    {
        id: "9487-samsung-amount-paid-expense",
        address: "VK-SAMCCC",
        body: "Dear Customer, amount paid for your Samsung Service Request No. 4377345960 was INR 9576.90. Thank you",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 9576.9,
        },
    },
    {
        id: "12662-sip-cancellation-skip",
        address: "VK-AXISMF",
        body: "Dear Investor, Acknowledge receipt of your SIP Cancellation request of Axis Small Cap Fund Direct Growth in folio XXXXXXXXX5143. Axis MF",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "13442-ter-revision-skip",
        address: "VM-IPRUMF",
        body: "Dear Investor, Greetings from ICICI Prudential Mutual Fund! Please note that the base Total Expense Ratio (TER) of ICICI Prudential Nifty 50 Index Fund - Direct Plan Growth will be revised from 0.16 % to 0.17 % with effect from January 06, 2025.Please refer the website of ICICI Prudential Mutual Fund (www.icicipruamc.com) for TER details.IPRUMF",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "730-paytm-vipin-not-ipin-skip",
        address: "ADiPaytm",
        body: "Paid Rs.24  to Vipin kashyap at May 8, 2019 14:27:49 . Order ID: 201905081427480024 . Updated Balance: Paytm Wallet- Rs 279.84",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 24,
        },
    },
    {
        id: "13617-sent-to-vipin-expense",
        address: "VM-HDFCBN",
        body: "Sent Rs.130.00 From HDFC Bank A/C x1260 To VIPIN GUPTA On 16/01/25 Ref 501619019680 Not You? Call 18002586161/SMS BLOCK UPI to 7308080808",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 130,
            accountLast4: "1260",
        },
    },
    {
        id: "16317-netbanking-ipin-reset-skip",
        address: "AD-HDFCBK-S",
        body: "Alert! Your HDFC Bank NetBanking IPIN (Password) reset is complete. You're all set to login. Not you? Call 18002586161",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "7456-sbi-received-and-credited-ending-85-skip",
        address: "VM-SBICRD",
        body: "We have received and credited payment of Rs.12,570.00 against your SBI Credit Card ending 85 done via UPI. Your current available limit is Rs.200,000.35.",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "6537-sbi-loan-debited-expense",
        address: "BZ-CBSSBI",
        body: "Your Loan XXXXX489751 debited by Rs 118.00 on 19/05/22. Current o/s Rs 35,44,771.00. For any query, pl contact branch:SBI",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 118,
            accountLast4: "9751",
        },
    },
    {
        id: "31-phonepe-owned-to-owned-transfer",
        address: "TMPHONPE",
        body: "You've transferred Rs.100000 from HDFC Bank a/c ******1260 to YES Bank a/c XXXXX0592.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "transfer",
            cashFlow: "NEUTRAL",
            amount: 100000,
            accountLast4: "1260",
        },
    },
    {
        id: "7876-cred-hsbc-payment-received-bill",
        address: "JM-CREDIN",
        body: "Payment of INR 1,353.82 was received for your HSBC Bank credit card XXXX-4433 on 17-Jan-2023 and you have earned 1,354 CRED coins. Your order id is YE1PR463D1L9. Payment will be credited to credit card account within the next 14 minutes. View transaction details here: https://app.cred.club/k63y/txn - CRED",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "NEUTRAL",
            amount: 1353.82,
            accountLast4: "4433",
        },
    },
    {
        id: "6191-cred-old-hdfc-7577-payment-skip",
        address: "JD-CREDIN",
        body: "Payment of INR 50,502 was received for your HDFC Bank credit card XXXX-7577 on 26-Feb-2022 and you have earned 50,502 CRED coins. Your order id is J9DRZ3LEWGZ. Payment will be credited to credit card account within the next 1 hour. View transaction details here: https://app.cred.club/k63y/txn - CRED",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "18207-airtel-due-today-bill",
        address: "AD-AIRBIL-S",
        body: "REMINDER: Bill of Rs. 351 for Airtel Fixedline/Wi-Fi account no. 01142311413 dated 06-JUN-26 is due today. To pay via Airtel Thanks App, click i.airtel.in/BBpayBills. Please ignore if paid.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "NEUTRAL",
            amount: 351,
        },
    },
    {
        id: "5878-jiomart-eligible-cashback-skip",
        address: "JK-RELONE",
        body: "Dear Customer, You are now eligible for 20% cashback in JioMart Maha Cashback Program. The cashback will be credited to your Reliance One account linked with mobile no. within next 3 days. Redeem cashback on your next purchase. T&C apply. Team JioMart",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "14741-gokwik-failed-payment-skip",
        address: "AX-GKKWIK-S",
        body: "Dear Vipul, your payment for Deodap  order KWIK00R8O4DK5209738 could not be completed. Any amount if debited will get refunded within 4-7 days.",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "5980-olamoney-postpaid-bill",
        address: "AX-OLACAB",
        body: "Your OlaMoney Postpaid bill of Rs.411.00 is generated today. Please clear your dues by 24-January-2022 to avoid paying any late fee https://tinyurl.com/sxcas6a",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "bill",
            cashFlow: "NEUTRAL",
            amount: 411,
        },
    },
    {
        id: "14797-salary-not-credited-skip",
        address: "AD-HDFCBK-S",
        body: "Attention! We've observed your salary is not credited to HDFC Bank A/c 1260 for May 2025. In case of no salary credit, you'll lose the benefits of a Salary A/c",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "18294-max-life-will-be-credited-skip",
        address: "VA-AXMAXT-S",
        body: "Dear Customer, a NEFT payment of Rs. 112189.34 has been processed towards the pay-out for your Axis Max Life policy 884998147. The amount will be credited to your registered bank account, ending with ****1412, within 3-4 business days, subject to transaction approval by your bank. T&C apply.",
        expect: {
            category: SmsCategory.UNKNOWN,
            subcategory: "UNKNOWN",
        },
    },
    {
        id: "18295-icici-neft-income-stays",
        address: "VK-ICICIT-S",
        body: "ICICI Bank Account XX412 credited:Rs. 1,12,189.34 on 23-Jun-26. Info NEFT-HSBCN17458733606-AXIS M. Available Balance is Rs. 4,96,181.83.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "income",
            cashFlow: "INFLOW",
            amount: 112189.34,
            accountLast4: "1412",
        },
    },
    {
        id: "18352-tata-play-fiber-paid-expense",
        address: "TX-TPFIBR-S",
        body: "Dear Customer, Your payment of Rs.10266.00 for your Tata Play Fiber account has been received on 06-28-2026 09:10. For more details, visit: tpfiber-mapp.app.link/download-invoice or call 18001207777.",
        expect: {
            category: SmsCategory.FINANCIAL,
            subcategory: "expense",
            cashFlow: "OUTFLOW",
            amount: 10266,
            merchant: "Tata Play Fiber",
        },
    },
];

function stubMessage(address: string, body: string): SmsMessage {
    return {
        address,
        body,
        smsType: 1,
        receivedAt: new Date(),
        sourceFile: "regression",
        rawAttributes: {},
        hash: "regression",
    };
}

function stubEvent(
    smsId: number,
    kind: string,
    amount: number,
    accountLast4: string,
    occurredAt: Date
): FinancialEvent {
    return {
        smsId,
        kind,
        cashFlow: kind === "transfer" ? "NEUTRAL" : kind === "income" ? "INFLOW" : "OUTFLOW",
        amount,
        currency: "INR",
        accountLast4,
        occurredAt,
        classifier: "regex-financial",
        classifierVersion: "1.3.25",
    };
}

/**
 * Locked persist-filter cases. Classify stays transfer; events skip same-VPA,
 * closed legs, and paired duplicate SMS.
 */
function runEventFilterRegression(): void {
    const failures: string[] = [];
    const persistCases: Array<{ id: string; body: string; persist: boolean }> = [
        {
            id: "phonepe-owned-to-owned-keep",
            body: "You've transferred Rs.100000 from HDFC Bank a/c ******1260 to YES Bank a/c XXXXX0592.",
            persist: true,
        },
        {
            id: "same-vpa-vipulism-skip",
            body: "Rs 50,000.00 Debited to Ac XX0592 on 19-MAR 18:17-UPI/007972996523/From:vipulism@ybl/To:vipulism@ybl/Payment from PhonePe Tot Avbl Bal-Rs 811,870.45 on 19-Mar 18:17.",
            persist: false,
        },
        {
            id: "closed-3330-to-1260-skip",
            body: "Your a/c no. XXXXXXXXXXX3330 is debited for Rs.50000.00 on 19-03-2020 and a/c XXXXXXXXXXX1260 credited (IMPS Ref no 007902449179).",
            persist: false,
        },
        {
            id: "closed-3330-funds-trf-skip",
            body: "Rs 12,000.00 Debited to Ac XX3330 on 30-OCT 12:15-Funds Trf to XX0592/own account/5 and 12 Tot Avbl Bal-Rs 29,110.87 on 30-Oct 12:15.",
            persist: false,
        },
        {
            id: "both-owned-keep",
            body: "Your a/c no. XXXXXXXXXXX1412 is debited for Rs.2000.00 on 19-03-2020 and a/c XXXXXXXXXXX1260 credited (IMPS Ref no 007902449179).",
            persist: true,
        },
        {
            id: "hdfc-to-home-loan-keep",
            body: "UPDATE: A/c XX1260 debited for INR 10,896.00 on 09-11-20 & A/c xxxxxxx9751 credited (IMPS Ref No.031321326782).Avl bal:INR 10,32,682.11.Not you?Call 18002586161",
            persist: true,
        },
    ];

    for (const testCase of persistCases) {
        const persist = isPersistableTransfer(testCase.body);

        if (persist !== testCase.persist) {
            failures.push(
                `${testCase.id}: persist ${persist} != ${testCase.persist}`
            );
        }
    }

    const day = new Date("2020-03-19T12:00:00+05:30");
    const phonepeBody =
        "You've transferred Rs.100000 from HDFC Bank a/c ******1260 to YES Bank a/c XXXXX0592.";
    const sameVpaBody =
        "Rs 100000.00 Credited to Ac XX0592 on 19-MAR 18:17-UPI/007972996523/From:vipulism@ybl/To:vipulism@ybl/Payment from PhonePe.";
    const yesImpsBody =
        "Rs 200,000.00 Debited to Ac XX0592 on 05-AUG 18:48-IMPS/NA/XXXX1260/RRN:221718648405/6588085827940851331/HDFC Bank/VIPUL SHARMA/Ghar3 Tot Avbl Bal-Rs 304,019.69 on 05-Aug 18:48.";
    const yesImpsDupBody =
        "Your a/c no. XXXXXXXXXXX0592 is debited for Rs.200000.00 on 05-08-2022 and a/c XXXXXXXXXXX1260 credited (IMPS Ref no 221718648405).";

    const deduped = filterPostedEvents([
        {
            event: stubEvent(31, "transfer", 100000, "1260", day),
            body: phonepeBody,
        },
        {
            event: stubEvent(33, "transfer", 100000, "0592", day),
            body: sameVpaBody,
        },
        {
            event: stubEvent(32, "income", 100000, "0592", day),
            body: "Rs 100000.00 Credited to Ac XX0592. Avl Bal Rs 200000.",
        },
        {
            event: stubEvent(6916, "transfer", 200000, "0592", new Date("2022-08-05T18:48:00+05:30")),
            body: yesImpsDupBody,
        },
        {
            event: stubEvent(6917, "transfer", 200000, "0592", new Date("2022-08-05T18:48:00+05:30")),
            body: yesImpsBody,
        },
        {
            event: stubEvent(3111, "transfer", 10896, "1260", new Date("2020-11-09T12:00:00+05:30")),
            body: "UPDATE: A/c XX1260 debited for INR 10,896.00 on 09-11-20 & A/c xxxxxxx9751 credited (IMPS Ref No.031321326782).Avl bal:INR 10,32,682.11.Not you?Call 18002586161",
        },
    ]);
    const ids = deduped.map((event) => event.smsId).sort((left, right) => left - right);

    if (ids.includes(33)) {
        failures.push("paired same-VPA credit was persisted");
    }

    if (ids.includes(32)) {
        failures.push("paired income credit was persisted");
    }

    if (!ids.includes(31)) {
        failures.push("PhonePe owned-to-owned transfer was dropped");
    }

    const phonepe = deduped.find((event) => event.smsId === 31);

    if (phonepe?.accountLast4 !== "1260" || phonepe?.counterpartyLast4 !== "0592") {
        failures.push(
            `PhonePe legs ${phonepe?.accountLast4}→${phonepe?.counterpartyLast4} != 1260→0592`
        );
    }

    const homeLoan = deduped.find((event) => event.smsId === 3111);

    if (homeLoan?.accountLast4 !== "1260" || homeLoan?.counterpartyLast4 !== "9751") {
        failures.push(
            `home-loan legs ${homeLoan?.accountLast4}→${homeLoan?.counterpartyLast4} != 1260→9751`
        );
    }

    const twoLakh = ids.filter((id) => id === 6916 || id === 6917);

    if (twoLakh.length !== 1) {
        failures.push(`IMPS pair kept ${twoLakh.length} events, expected 1`);
    }

    if (failures.length > 0) {
        throw new Error(`event filter regression failed:\n${failures.join("\n")}`);
    }
}

function ownedFixture(): KnownAccountIndex {
    const accounts: KnownAccount[] = [
        { name: "ICICI savings", bank: "ICICI Bank", last4: "1412", type: "savings" },
        { name: "ICICI Amazon Pay", bank: "ICICI Bank", last4: "0004", type: "credit_card" },
        { name: "ICICI Sapphiro Visa", bank: "ICICI Bank", last4: "1003", type: "credit_card" },
        { name: "ICICI Sapphiro Rupee", bank: "ICICI Bank", last4: "7000", type: "credit_card" },
        { name: "HDFC savings", bank: "HDFC Bank", last4: "1260", type: "savings" },
        { name: "HDFC Rupee", bank: "HDFC Bank", last4: "1687", type: "credit_card" },
        { name: "HDFC Regalia", bank: "HDFC Bank", last4: "0170", type: "credit_card" },
        { name: "SBI savings", bank: "State Bank of India", last4: "6424", type: "savings" },
        { name: "SBI BP", bank: "State Bank of India", last4: "8561", type: "credit_card" },
        { name: "SBI Home Loan", bank: "State Bank of India", last4: "9751", type: "loan" },
        { name: "HSBC Credit Card", bank: "HSBC", last4: "4433", type: "credit_card" },
        { name: "Yes Bank savings", bank: "YES Bank", last4: "0592", type: "savings" },
        { name: "FD – YES Bank", bank: "YES Bank", last4: "6636", type: "investment" },
        { name: "FD – ICICI Bank", bank: "ICICI Bank", last4: "2222", type: "investment" },
        { name: "FD – HDFC Bank", bank: "HDFC Bank", last4: "6666", type: "investment" },
        { name: "Mutual funds", bank: "Mutual Fund", last4: "3333", type: "investment" },
        { name: "Equity / Demat", bank: "Demat", last4: "4444", type: "investment" },
        { name: "SGB", bank: "SGB", last4: "5555", type: "investment" },
        { name: "EPF", bank: "EPFO", last4: "7777", type: "epf" },
    ];

    return new KnownAccountIndex(accounts);
}

/**
 * Unique (bank + type) when last4 is missing; multi-card banks stay unmapped.
 */
function runDhanResolveRegression(): void {
    const failures: string[] = [];
    const accounts = ownedFixture();

    const iciciSavings = resolveDhanAccount(
        { bank: "ICICI Bank", transactionType: "UPI" },
        accounts,
        "Dear Customer, Acct is credited with Rs 3188.00 from ABHISHEK SHARMA. UPI:312548874973-ICICI Bank."
    );

    if (iciciSavings.account?.last4 !== "1412" || iciciSavings.bucket !== "unique-bank") {
        failures.push(
            `ICICI acct credit → ${iciciSavings.bucket}:${iciciSavings.account?.last4} != unique-bank:1412`
        );
    }

    const iciciCard = resolveDhanAccount(
        { bank: "ICICI Bank" },
        accounts,
        "Spent Rs 500 on your ICICI Bank Credit Card. Available limit Rs 10000."
    );

    if (iciciCard.bucket !== "unmapped") {
        failures.push(
            `ICICI credit card without last4 should stay unmapped, got ${iciciCard.account?.last4}`
        );
    }

    const hsbc = resolveDhanAccount(
        { bank: "HSBC" },
        accounts,
        "You have spent INR 41 on HSBC Credit Card at swiggy."
    );

    if (hsbc.account?.last4 !== "4433") {
        failures.push(`HSBC unique card → ${hsbc.account?.last4} != 4433`);
    }

    const sbiCard = resolveDhanAccount(
        { bank: "State Bank of India" },
        accounts,
        "SBI Card ending 61: payment received Rs 500."
    );

    if (sbiCard.account?.last4 !== "8561") {
        failures.push(`SBI unique card → ${sbiCard.account?.last4} != 8561`);
    }

    const homeLoan = resolveDhanAccount(
        { bank: "State Bank of India" },
        accounts,
        "EMI of Rs 10896 paid towards SBI Home Loan."
    );

    if (homeLoan.account?.last4 !== "9751") {
        failures.push(`SBI home loan → ${homeLoan.account?.last4} != 9751`);
    }

    const hdfcSavings = resolveDhanAccount(
        { bank: "HDFC Bank", transactionType: "IMPS" },
        accounts,
        "HDFC Bank A/c credited with INR 2000.00."
    );

    if (hdfcSavings.account?.last4 !== "1260") {
        failures.push(`HDFC A/c → ${hdfcSavings.account?.last4} != 1260`);
    }

    const restamped = stampDhanAccount(
        {
            ...stubEvent(18849, "income", 3188, "1412", new Date("2026-08-15T12:00:00+05:30")),
            accountLast4: undefined,
            bank: "ICICI Bank",
            transactionType: "UPI",
        },
        accounts,
        "Dear Customer, Acct is credited with Rs 3188.00 from ABHISHEK. UPI:1-ICICI Bank."
    );

    if (restamped.event.accountLast4 !== "1412") {
        failures.push(`stamp last4 ${restamped.event.accountLast4} != 1412`);
    }

    const yesSavings = resolveDhanAccount(
        { bank: "YES Bank" },
        accounts,
        "YES Bank Acct credited with INR 5000.00 on 26-JAN-23"
    );

    if (yesSavings.account?.last4 !== "0592") {
        failures.push(`YES unique savings with FD present → ${yesSavings.account?.last4} != 0592`);
    }

    const yesFdBody =
        "Rs 15,000.00 Debited to Ac XX0592 on 01-JAN 09:44-NET-New FD-VIPUL SHARMA-016648000000121 -1-CHANDNICHOWK Tot Avbl Bal-Rs 455,991.91 on 01-Jan 09:44. Warm Regards, YES Bank.";
    const yesFd = stampDhanAccount(
        {
            ...stubEvent(5891, "investment", 15000, "0592", new Date("2021-01-01T04:14:00+05:30")),
            bank: "YES Bank",
        },
        accounts,
        yesFdBody
    );

    if (yesFd.event.accountLast4 !== "0592" || yesFd.event.counterpartyLast4 !== "6636") {
        failures.push(
            `YES New FD legs ${yesFd.event.accountLast4}→${yesFd.event.counterpartyLast4} != 0592→6636`
        );
    }

    const sipBody =
        "Dear Investor, Payment of Rs. 2999.85 towards your SIP in Axis Small Cap Fund Direct Growth has been received and 26.505 units at NAV 113.18 are allotted in Folio XXXXXXXXX5143. Axis MF";
    const sip = stampDhanAccount(
        {
            ...stubEvent(14447, "investment", 2999.85, "1412", new Date("2026-08-16T12:00:00+05:30")),
            bank: "ICICI Bank",
        },
        accounts,
        sipBody
    );

    if (sip.event.counterpartyLast4 !== "3333") {
        failures.push(`Axis SIP dest ${sip.event.counterpartyLast4} != 3333`);
    }

    if (failures.length > 0) {
        throw new Error(`dhan resolve regression failed:\n${failures.join("\n")}`);
    }
}

function runFireflyMapRegression(): void {
    const failures: string[] = [];

    if (extractFireflyAccountLast4("1412") !== "1412") {
        failures.push("exact last4");
    }

    if (extractFireflyAccountLast4("50100744801768") !== "1768") {
        failures.push("long account_number last4");
    }

    if (extractFireflyAccountLast4("12") !== undefined) {
        failures.push("short number should not map");
    }

    const firefly = new FireflyLast4Index([
        {
            id: "11",
            name: "HDFC",
            type: "asset",
            accountNumber: "1260",
        },
        {
            id: "22",
            name: "SBI Home Loan",
            type: "liability",
            accountNumber: "9751",
        },
    ]);
    const owned = new KnownAccountIndex([]);
    const loanEvent = stubEvent(3111, "transfer", 10896, "1260", new Date("2020-11-09T12:00:00+05:30"));
    loanEvent.counterpartyLast4 = "9751";
    const loanPay = planFireflyTransaction(loanEvent, firefly, owned);

    if (!loanPay.ok || loanPay.plan.type !== "transfer") {
        failures.push("loan payment should dry-run as transfer");
    } else if (loanPay.plan.sourceId !== "11" || loanPay.plan.destinationId !== "22") {
        failures.push(
            `loan transfer ids ${loanPay.plan.sourceId}→${loanPay.plan.destinationId} != 11→22`
        );
    }

    const missing = planFireflyTransaction(
        stubEvent(1, "expense", 100, "1412", new Date("2020-11-09T12:00:00+05:30")),
        firefly,
        owned
    );

    if (missing.ok) {
        failures.push("missing Firefly last4 should block");
    }

    const openings = new FireflyOpenings(new Map([["5940", "2026-08-16"]]));
    const fastag = new FireflyLast4Index([
        { id: "49", name: "FASTag", type: "asset", accountNumber: "5940" },
    ]);
    const oldToll = planFireflyTransaction(
        stubEvent(17531, "expense", 50, "5940", new Date("2026-03-30T12:00:00+05:30")),
        fastag,
        owned,
        openings
    );

    if (oldToll.ok || !oldToll.skip) {
        failures.push("FASTag before opening should skip");
    }

    const openingDay = planFireflyTransaction(
        stubEvent(99999, "expense", 40, "5940", new Date("2026-08-16T12:00:00+05:30")),
        fastag,
        owned,
        openings
    );

    if (!openingDay.ok) {
        failures.push("FASTag on opening day should be ready");
    }

    const iciciLedger = new FireflyLast4Index([
        { id: "1412id", name: "ICICI savings", type: "asset", accountNumber: "1412" },
        { id: "0004id", name: "ICICI Amazon Pay", type: "asset", accountNumber: "0004" },
    ]);
    const noLast4 = stubEvent(18849, "income", 3188, "1412", new Date("2026-08-16T12:00:00+05:30"));
    noLast4.accountLast4 = undefined;
    noLast4.bank = "ICICI Bank";
    noLast4.transactionType = "UPI";
    const uniquePush = planFireflyTransaction(noLast4, iciciLedger, ownedFixture());

    if (!uniquePush.ok || uniquePush.plan.destinationId !== "1412id") {
        failures.push("ICICI UPI without last4 should unique-savings to 1412");
    }

    const fdLedger = new FireflyLast4Index([
        { id: "yesSav", name: "Yes Bank savings", type: "asset", accountNumber: "0592" },
        { id: "yesFd", name: "FD – YES Bank", type: "asset", accountNumber: "6636" },
        { id: "mf", name: "Mutual funds", type: "asset", accountNumber: "3333" },
    ]);
    const oldFd = stubEvent(5891, "investment", 15000, "0592", new Date("2021-01-01T04:14:00+05:30"));
    oldFd.counterpartyLast4 = "6636";
    oldFd.bank = "YES Bank";
    const oldFdPlan = planFireflyTransaction(
        oldFd,
        fdLedger,
        ownedFixture(),
        new FireflyOpenings(new Map([
            ["0592", "2026-08-16"],
            ["6636", "2026-08-16"],
        ]))
    );

    if (oldFdPlan.ok || !oldFdPlan.skip) {
        failures.push("historical YES FD should skip before opening");
    }

    const newFd = stubEvent(20000, "investment", 15000, "0592", new Date("2026-08-16T12:00:00+05:30"));
    newFd.counterpartyLast4 = "6636";
    newFd.bank = "YES Bank";
    const newFdPlan = planFireflyTransaction(newFd, fdLedger, ownedFixture());

    if (!newFdPlan.ok || newFdPlan.plan.type !== "transfer") {
        failures.push("YES New FD should dry-run as transfer");
    } else if (newFdPlan.plan.sourceId !== "yesSav" || newFdPlan.plan.destinationId !== "yesFd") {
        failures.push(
            `YES FD transfer ids ${newFdPlan.plan.sourceId}→${newFdPlan.plan.destinationId} != yesSav→yesFd`
        );
    }

    const noDest = stubEvent(20001, "investment", 2999.85, "1412", new Date("2026-08-16T12:00:00+05:30"));
    const blockedInvest = planFireflyTransaction(noDest, fdLedger, ownedFixture());

    if (blockedInvest.ok) {
        failures.push("investment without dest last4 must not post as withdrawal");
    }

    if (failures.length > 0) {
        throw new Error(`firefly map regression failed:\n${failures.join("\n")}`);
    }
}

/**
 * Runs locked classify cases and throws on the first mismatch.
 */
export function runFinancialRegression(): void {
    const classifier = new FinancialClassifier();
    const failures: string[] = [];

    for (const testCase of CASES) {
        const analysis = classifier.classify(stubMessage(testCase.address, testCase.body));
        const data = analysis.extractedData ?? {};
        const expected = testCase.expect;

        if (analysis.category !== expected.category) {
            failures.push(`${testCase.id}: category ${analysis.category} != ${expected.category}`);
        }

        if ((analysis.subcategory ?? "UNKNOWN") !== expected.subcategory) {
            failures.push(
                `${testCase.id}: subcategory ${analysis.subcategory} != ${expected.subcategory}`
            );
        }

        if (expected.cashFlow !== undefined && data.cashFlow !== expected.cashFlow) {
            failures.push(`${testCase.id}: cashFlow ${data.cashFlow} != ${expected.cashFlow}`);
        }

        if (expected.merchant !== undefined && data.merchant !== expected.merchant) {
            failures.push(`${testCase.id}: merchant ${data.merchant} != ${expected.merchant}`);
        }

        if (expected.accountLast4 !== undefined && data.accountLast4 !== expected.accountLast4) {
            failures.push(
                `${testCase.id}: accountLast4 ${data.accountLast4} != ${expected.accountLast4}`
            );
        }

        if (expected.amount !== undefined && data.amount !== expected.amount) {
            failures.push(`${testCase.id}: amount ${data.amount} != ${expected.amount}`);
        }

        if (
            expected.transactionType !== undefined &&
            data.transactionType !== expected.transactionType
        ) {
            failures.push(
                `${testCase.id}: transactionType ${data.transactionType} != ${expected.transactionType}`
            );
        }
    }

    if (failures.length > 0) {
        throw new Error(`classify regression failed:\n${failures.join("\n")}`);
    }
}

/**
 * Locked min/total due parse and due-vs-payment-ack split.
 */
function runDueFeedRegression(): void {
    const failures: string[] = [];
    const yesDue =
        "Dear Cardmember, Payment of YES BANK Credit Card ending 0336 is due on 05/06/23. Min due is Rs.467.96 & Total Due Rs.9359.17. Please pay before the last date to avoid charges. Kindly ignore if already paid.";
    const yesAmounts = parseDueAmounts(yesDue);

    if (yesAmounts.minDue !== 467.96 || yesAmounts.totalDue !== 9359.17) {
        failures.push(`YES due amounts ${yesAmounts.minDue}/${yesAmounts.totalDue} != 467.96/9359.17`);
    }

    if (!isDueKnowledgeRow("bill", "NEUTRAL", yesDue)) {
        failures.push("YES due should be due knowledge");
    }

    const iciciDue =
        "Total Due INR 6447 & Min Due INR 330 to be paid by 30-Nov-24 on ICICI Bank Credit Card XX0004.";
    const iciciAmounts = parseDueAmounts(iciciDue);

    if (iciciAmounts.minDue !== 330 || iciciAmounts.totalDue !== 6447) {
        failures.push(`ICICI due amounts ${iciciAmounts.minDue}/${iciciAmounts.totalDue} != 330/6447`);
    }

    const paymentAck =
        "DEAR HDFCBANK CARDMEMBER, PAYMENT OF Rs. 430.00 RECEIVED TOWARDS YOUR CREDIT CARD ENDING WITH 1687 ON 26-4-2026.YOUR AVAILABLE LIMIT IS RS. 796252.09";

    if (isDueKnowledgeRow("bill", "NEUTRAL", paymentAck)) {
        failures.push("CC payment ack must not be due knowledge");
    }

    if (failures.length > 0) {
        throw new Error(`due feed regression failed:\n${failures.join("\n")}`);
    }
}

runFinancialRegression();
console.log(`classify regression ok: ${CASES.length} cases`);

runEventFilterRegression();
console.log("event filter regression ok");

runDhanResolveRegression();
console.log("dhan resolve regression ok");

runFireflyMapRegression();
console.log("firefly map regression ok");

runDueFeedRegression();
console.log("due feed regression ok");
