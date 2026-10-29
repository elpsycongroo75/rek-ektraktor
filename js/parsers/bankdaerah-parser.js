/**
 * Bank Daerah Statement Parser
 * Format: Laporan Rekening Koran (Account Statement Report)
 * Clean text-based format with well-structured tables
 * Columns: Posting Date | Remark | Reference No | Debit | Credit | Balance
 */
class BankDaerahParser extends BaseParser {
    constructor() {
        super('BANK DAERAH');
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

        // Account No 20008061745 IDR PT FAZZA MAHAKARYA PRADANA
        const accMatch = allText.match(/Account\s*No\s+(\d+)\s+\w+\s+(.+)/i);
        if (accMatch) {
            accountNo = accMatch[1];
            accountName = accMatch[2].trim();
        }

        // Branch Bank Daerah / BPD-CAB TANJUNG PRIOK
        const branchMatch = allText.match(/Branch\s+(.+)/i);
        if (branchMatch) branch = branchMatch[1].trim();

        // Period 01 Jan 2025 - 31 Jan 2025
        const periodMatch = allText.match(/Period\s+(.+)/i);
        if (periodMatch) {
            period = periodMatch[1].trim();
            year = this.extractYear(period);
            month = this.extractMonth(period);
        }

        if (!year && metadata.filename) year = this.extractYear(metadata.filename);
        if (!month && metadata.filename) month = this.extractMonth(metadata.filename);

        // Summary data
        const totalDebitMatch = allText.match(/Total\s+Amount\s+Debited\s+([\d,]+\.\d{2})/i);
        if (totalDebitMatch) totalDebit = this.parseAmount(totalDebitMatch[1]);

        const totalCreditMatch = allText.match(/Total\s+Amount\s+Credited\s+([\d,]+\.\d{2})/i);
        if (totalCreditMatch) totalCredit = this.parseAmount(totalCreditMatch[1]);

        const openMatch = allText.match(/Opening\s+Balance\s*\n?\s*([\d,]+\.\d{2})/i);
        if (openMatch) openingBalance = this.parseAmount(openMatch[1]);

        const closeMatch = allText.match(/Closing\s+Balance\s+([\d,]+\.\d{2})/i);
        if (closeMatch) closingBalance = this.parseAmount(closeMatch[1]);

        // Extract transactions
        const transactions = [];

        // Try table data first (most reliable for Bank Daerah / BPD)
        for (const page of pages) {
            if (page.tables) {
                for (const table of page.tables) {
                    this._parseTable(table, transactions, year);
                }
            }
        }

        // Fallback to text parsing
        if (transactions.length === 0) {
            this._parseFromText(pages, transactions, year);
        }

        totalDebit = transactions.reduce((sum, t) => sum + t.debit, 0);
        totalCredit = transactions.reduce((sum, t) => sum + t.credit, 0);

        return this.formatResult({
            accountNo, accountName, branch, period, year, month,
            openingBalance, closingBalance, totalDebit, totalCredit,
            transactions
        });
    }

    _parseTable(table, transactions, year) {
        for (let i = 0; i < table.length; i++) {
            const row = table[i];
            if (!row || row.length < 4) continue;

            // Skip header
            if (row[0] && row[0].includes('Posting Date')) continue;

            const dateStr = (row[0] || '').replace(/\n/g, ' ').trim();
            const remark = (row[1] || '').replace(/\n/g, ' ').trim();
            const refNo = (row[2] || '').trim();
            const debitStr = row[3] || '0';
            const creditStr = row[4] || '0';
            const balanceStr = row[5] || '0';

            // Parse date: "Jan 06, 2025 10:00:54 WIB" or "Jan 06, 2025 10:\n00:54 WIB"
            if (!dateStr.match(/\w{3}\s+\d{1,2}/)) continue;

            const date = this.parseDate(dateStr, year);
            const debit = this.parseAmount(debitStr);
            const credit = this.parseAmount(creditStr);
            const balance = this.parseAmount(balanceStr);

            transactions.push({
                date,
                dateStr: dateStr.split(/\s+\d{2}:/)[0], // Remove time part
                description: remark + (refNo ? ` [${refNo}]` : ''),
                debit,
                credit,
                balance
            });
        }
    }

    _parseFromText(pages, transactions, year) {
        for (const page of pages) {
            const text = page.text || '';
            const lines = text.split('\n');
            
            let currentDate = null;
            let currentDesc = [];
            let currentDebit = 0;
            let currentCredit = 0;
            let currentBalance = 0;
            let pendingTxn = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Skip headers and footers
                if (line.includes('Laporan Rekening Koran')) continue;
                if (line.includes('Account Statement')) continue;
                if (line.includes('Posting Date') && line.includes('Remark')) continue;
                if (line.includes('No of Debit')) continue;
                if (line.includes('No of Credit')) continue;
                if (line.includes('Total Amount')) continue;
                if (line.includes('Opening Balance')) continue;
                if (line.includes('Closing Balance')) continue;
                if (line.includes('Printed by')) continue;

                // Transaction: "Jan 06, 2025 10:" or "Jan 30, 2025 14:"
                const dateMatch = line.match(/^(\w{3}\s+\d{1,2},\s+\d{4})\s+\d{2}:/);
                if (dateMatch) {
                    if (pendingTxn && currentDate) {
                        transactions.push({
                            date: this.parseDate(currentDate, year),
                            dateStr: currentDate,
                            description: currentDesc.join(' ').trim(),
                            debit: currentDebit,
                            credit: currentCredit,
                            balance: currentBalance
                        });
                    }

                    currentDate = dateMatch[1];
                    currentDesc = [];
                    currentDebit = 0;
                    currentCredit = 0;
                    currentBalance = 0;
                    pendingTxn = true;

                    // Extract remark and amounts from this line
                    const rest = line.replace(/^\w{3}\s+\d{1,2},\s+\d{4}\s+\d{2}:\s*/, '');
                    const amounts = [];
                    const amountRegex = /([\d,]+\.\d{2})/g;
                    let m;
                    while ((m = amountRegex.exec(rest)) !== null) {
                        amounts.push({ value: this.parseAmount(m[1]), index: m.index });
                    }

                    if (amounts.length >= 3) {
                        currentDebit = amounts[amounts.length - 3].value;
                        currentCredit = amounts[amounts.length - 2].value;
                        currentBalance = amounts[amounts.length - 1].value;
                        currentDesc = [rest.substring(0, amounts[amounts.length - 3].index).trim()];
                    } else if (amounts.length >= 1) {
                        currentBalance = amounts[amounts.length - 1].value;
                        currentDesc = [rest.substring(0, amounts[0].index).trim()];
                    }
                } else if (pendingTxn) {
                    // Time continuation line like "00:54 WIB"
                    if (line.match(/^\d{2}:\d{2}\s+WIB/)) continue;
                    
                    // Extract any amounts on continuation lines
                    const amounts = [];
                    const amountRegex = /([\d,]+\.\d{2})/g;
                    let m;
                    while ((m = amountRegex.exec(line)) !== null) {
                        amounts.push({ value: this.parseAmount(m[1]), index: m.index });
                    }

                    if (amounts.length >= 3 && currentDebit === 0 && currentCredit === 0) {
                        currentDebit = amounts[amounts.length - 3].value;
                        currentCredit = amounts[amounts.length - 2].value;
                        currentBalance = amounts[amounts.length - 1].value;
                        const descPart = line.substring(0, amounts[amounts.length - 3].index).trim();
                        if (descPart) currentDesc.push(descPart);
                    } else {
                        // Description continuation
                        currentDesc.push(line);
                    }
                }
            }

            // Save last pending
            if (pendingTxn && currentDate) {
                transactions.push({
                    date: this.parseDate(currentDate, year),
                    dateStr: currentDate,
                    description: currentDesc.join(' ').trim(),
                    debit: currentDebit,
                    credit: currentCredit,
                    balance: currentBalance
                });
            }
        }
    }
}
