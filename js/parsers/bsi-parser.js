/**
 * BSI (Bank Syariah Indonesia) Statement Parser
 * Format: Mutasi Rekening
 * Clean tabular format with separate Debet and Kredit columns
 * Columns: No | Waktu Transaksi | No.Referensi | Nama Pengirim | Bank Pengirim | 
 *          Nama Penerima | Bank Penerima | Deskripsi | Debet | Kredit | Saldo Riil | Kode
 */
class BSIParser extends BaseParser {
    constructor() {
        super('BSI');
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

        // REKENING : IDR 7159595913 - BSI GIRO WADIAH INSTITUSI
        const accMatch = allText.match(/REKENING\s*:\s*\w+\s+(\d+)\s*-\s*(.+)/i);
        if (accMatch) {
            accountNo = accMatch[1];
            accountName = accMatch[2].trim();
        }

        // Cabang
        const branchMatch = allText.match(/Cabang\s*\n?\s*([\w\d]+)/i);
        if (branchMatch) branch = branchMatch[1].trim();

        // Periode : 01/01/2024 s/d 31/01/2024
        const periodMatch = allText.match(/Periode\s*:\s*(.+)/i);
        if (periodMatch) {
            period = periodMatch[1].trim();
            year = this.extractYear(period);
            month = this.extractMonth(period);
        }

        if (!year && metadata.filename) year = this.extractYear(metadata.filename);
        if (!month && metadata.filename) month = this.extractMonth(metadata.filename);

        // Total Debet & Kredit
        const totalDebitMatch = allText.match(/Total\s+Debet\s*\(Dalam\s+Periode\)\s*:\s*([\d,]+\.\d{2})/i);
        if (totalDebitMatch) totalDebit = this.parseAmount(totalDebitMatch[1]);

        const totalCreditMatch = allText.match(/Total\s+Kredit\s*\(Dalam\s+Periode\)\s*:\s*([\d,]+\.\d{2})/i);
        if (totalCreditMatch) totalCredit = this.parseAmount(totalCreditMatch[1]);

        // Saldo awal
        const openBalMatch = allText.match(/Saldo\s+riil\s+awal\s+per\s+\d{2}\/\d{2}\/\d{4}\s*:\s*([\d,]+\.\d{2})/i);
        if (openBalMatch) openingBalance = this.parseAmount(openBalMatch[1]);

        // Saldo akhir
        const closeBalMatch = allText.match(/Saldo\s+riil\s+awal\s+per\s+\d{2}\/\d{2}\/\d{4}\s*:\s*([\d,]+\.\d{2})/ig);
        if (closeBalMatch && closeBalMatch.length > 1) {
            const m = closeBalMatch[1].match(/([\d,]+\.\d{2})/);
            if (m) closingBalance = this.parseAmount(m[1]);
        }

        // Extract transactions
        const transactions = [];

        // Try table data first
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

        if (!closingBalance && transactions.length > 0) { closingBalance = transactions[transactions.length - 1].balance; }
        if (totalDebit === 0) {
            totalDebit = transactions.reduce((sum, t) => sum + t.debit, 0);
        }
        if (totalCredit === 0) {
            totalCredit = transactions.reduce((sum, t) => sum + t.credit, 0);
        }

        return this.formatResult({
            accountNo, accountName, branch, period, year, month,
            openingBalance, closingBalance, totalDebit, totalCredit,
            transactions
        });
    }

    _parseTable(table, transactions, year) {
        for (let i = 0; i < table.length; i++) {
            const row = table[i];
            if (!row || row.length < 8) continue;

            // Skip header row
            if (row[0] === 'No' || (row[1] && row[1].includes('Waktu'))) continue;

            const no = row[0];
            if (!no || isNaN(parseInt(no))) continue;

            const dateStr = (row[1] || '').replace(/\n/g, ' ').split(' ')[0]; // "31-01-2024 20.31" -> "31-01-2024"
            const description = (row[7] || '').replace(/\n/g, ' ').trim();
            const debitStr = (row[8] || '').replace(/-$/, '');
            const creditStr = row[9] || '';
            const balanceStr = row[10] || '';

            const date = this.parseDate(dateStr, year);
            const debit = this.parseAmount(debitStr);
            const credit = this.parseAmount(creditStr);
            const balance = this.parseAmount(balanceStr);

            transactions.push({
                date,
                dateStr,
                description,
                debit,
                credit,
                balance
            });
        }
    }

    _parseFromText(pages, transactions, year) {
        let lastDateStr = '';
        
        for (const page of pages) {
            const text = page.text || '';
            const lines = text.split('\n');
            
            for (const line of lines) {
                // Track dates appearing on lines
                const dateMatch = line.match(/(\d{2}-\d{2}-\d{4})/);
                if (dateMatch) {
                    lastDateStr = dateMatch[1];
                }
                
                // Transactions end with 2 amounts and optional code
                const amountsMatch = line.match(/([\d,]+\.\d{2}-?)\s+([\d,]+\.\d{2}-?)(?:\s+\d{3})?$/);
                if (amountsMatch && !line.includes('Total') && !line.includes('Saldo riil')) {
                    let amt1 = amountsMatch[1];
                    let amt2 = amountsMatch[2];
                    
                    let debit = 0;
                    let credit = 0;
                    
                    // BSI puts minus sign at the end for debits
                    if (amt1.endsWith('-')) {
                        debit = this.parseAmount(amt1.replace('-', ''));
                    } else {
                        credit = this.parseAmount(amt1);
                    }
                    const balance = this.parseAmount(amt2.replace('-', ''));
                    
                    // Try to get some description from the line
                    const descMatch = line.replace(/^\s*\d+\s+\S+\s+(.+?)\s+[\d,]+\.\d{2}-?\s+[\d,]+\.\d{2}-?/, '$1').trim();
                    
                    transactions.push({
                        date: this.parseDate(lastDateStr, year),
                        dateStr: lastDateStr,
                        description: descMatch || 'Mutasi',
                        debit,
                        credit,
                        balance
                    });
                }
            }
        }
    }
}
