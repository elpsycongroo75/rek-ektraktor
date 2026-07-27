/**
 * Danamon Bank Statement Parser
 * Format: LAPORAN MUTASI HARIAN - ALL IMAGE-BASED (requires OCR)
 * Columns: TGL TRANS | TSL TRANS VLT | BRANCH | REFF | KETERANGAN | DEBITS | CREDITS | BALANCE
 * OCR text needs careful parsing due to potential recognition errors
 */
class DanamonParser extends BaseParser {
    constructor() {
        super('DANAMON');
    }

    parse(pages, metadata = {}) {
        const allText = pages.map(p => p.text || '').join('\n');
        
        let accountNo = '';
        let accountName = '';
        let branch = '';
        let period = '';
        let year = null;
        let month = null;
        let openingBalance = 0;
        let closingBalance = 0;
        let totalDebit = 0;
        let totalCredit = 0;

        // Account No : 006600998972
        const accMatch = allText.match(/Account\s*No\s*[:\.]?\s*(\d+)/i);
        if (accMatch) accountNo = accMatch[1];

        // Account Title : PT GARDA INTEGRA SOL
        const nameMatch = allText.match(/Account\s*Title\s*[:\.]?\s*(.+)/i);
        if (nameMatch) accountName = nameMatch[1].trim();

        // Branch info
        const branchMatch = allText.match(/^\d+\s+(.+)/m);
        if (branchMatch) branch = branchMatch[1].trim();

        // Period : 01/01/2024 S/D 31/01/2024
        const periodMatch = allText.match(/Period\s*[:\.]?\s*(.+)/i);
        if (periodMatch) {
            period = periodMatch[1].trim();
            year = this.extractYear(period);
            month = this.extractMonth(period);
        }

        if (!year && metadata.filename) year = this.extractYear(metadata.filename);
        if (!month && metadata.filename) month = this.extractMonth(metadata.filename);

        // Opening/Closing Balance
        const openMatch = allText.match(/Opening\s*Balance\s*[:\.]?\s*([\d][\d\.,]*[\.,]\d{2})/i);
        if (openMatch) openingBalance = this.parseAmount(openMatch[1]);

        const closeMatch = allText.match(/Closing\s*Balance\s*[:\.]?\s*([\d][\d\.,]*[\.,]\d{2})/i);
        if (closeMatch) closingBalance = this.parseAmount(closeMatch[1]);

        const totalDebitMatch = allText.match(/Total\s*Debit\s*Amt\s*[:\.]?\s*([\d][\d\.,]*[\.,]\d{2})/i);
        if (totalDebitMatch) totalDebit = this.parseAmount(totalDebitMatch[1]);

        const totalCreditMatch = allText.match(/Total\s*Credit\s*Amt\s*[:\.]?\s*([\d][\d\.,]*[\.,]\d{2})/i);
        if (totalCreditMatch) totalCredit = this.parseAmount(totalCreditMatch[1]);

        // Extract transactions
        const transactions = [];
        this._parseFromText(pages, transactions, year);

        // Recalculate if needed
        totalDebit = transactions.reduce((sum, t) => sum + t.debit, 0);
        totalCredit = transactions.reduce((sum, t) => sum + t.credit, 0);
        if (!closingBalance && transactions.length > 0) { closingBalance = transactions[transactions.length - 1].balance; }

        return this.formatResult({
            accountNo, accountName, branch, period, year, month,
            openingBalance, closingBalance, totalDebit, totalCredit,
            transactions
        });
    }

    _parseFromText(pages, transactions, year) {
        for (const page of pages) {
            const text = page.text || '';
            const lines = text.split('\n');

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Transaction lines start with date: MM/DD MM/DD or DD/MM DD/MM
                // Format: "01/01 01/01 0 B/F ... AMOUNT BALANCE"
                const txnMatch = line.match(/^\s*(\d{2}[/l1I\.\-]\d{2})\s+(\d{2}[/l1I\.\-]\d{2})\s+(\d+)\s+(.+)/i);
                if (txnMatch) {
                    const dateStr = txnMatch[1]; // MM/DD or DD/MM
                    const rest = txnMatch[4];

                    // Extract amounts from the line
                    // Pattern: description ... DEBIT CREDIT BALANCE
                    const amounts = [];
                    const amountRegex = /([\d][\d\.,]*[\.,]\d{2})(?=\s|$|[A-Za-z])/g;
                    let match;
                    while ((match = amountRegex.exec(rest)) !== null) {
                        amounts.push({
                            value: this.parseAmount(match[1]),
                            index: match.index
                        });
                    }

                    if (amounts.length >= 1) {
                        let desc = rest;
                        let debit = 0;
                        let credit = 0;
                        let balance = 0;

                        if (amounts.length >= 3) {
                            debit = amounts[amounts.length - 3].value;
                            credit = amounts[amounts.length - 2].value;
                            balance = amounts[amounts.length - 1].value;
                            desc = rest.substring(0, amounts[amounts.length - 3].index).trim();
                        } else if (amounts.length === 2) {
                            // Could be debit+balance or credit+balance
                            balance = amounts[1].value;
                            const amt = amounts[0].value;
                            desc = rest.substring(0, amounts[0].index).trim();
                            
                            // Determine if debit or credit based on context
                            const beforeAmt = rest.substring(amounts[0].index);
                            if (balance < (transactions.length > 0 ? transactions[transactions.length - 1].balance : openingBalance)) {
                                debit = amt;
                            } else {
                                credit = amt;
                            }
                        } else if (amounts.length === 1) {
                            balance = amounts[0].value;
                            desc = rest.substring(0, amounts[0].index).trim();
                        }

                        // Clean up description - remove branch/reff parts
                        desc = desc.replace(/^[A-Z]\/[A-Z]\s*\.{0,3}/, '').trim();
                        if (!desc) desc = 'N/A';

                        // Parse date - Danamon uses MM/DD format
                        let parsedDate = null;
                        const dm = dateStr.match(/(\d{2})[/l1I\.\-](\d{2})/i);
                        if (dm && year) {
                            const d = parseInt(dm[1]);
                            const m = parseInt(dm[2]);
                            // If day > 12, it's DD/MM format
                            if (d > 12) {
                                parsedDate = new Date(year, m - 1, d);
                            } else if (m > 12) {
                                parsedDate = new Date(year, d - 1, m);
                            } else {
                                // Assume DD/MM
                                parsedDate = new Date(year, m - 1, d);
                            }
                        }

                        transactions.push({
                            date: parsedDate,
                            dateStr,
                            description: desc,
                            debit,
                            credit,
                            balance
                        });
                    }
                }
            }
        }
    }
}
