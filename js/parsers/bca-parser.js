/**
 * BCA Bank Statement Parser
 * Format: REKENING GIRO / REKENING TAHAPAN
 * Columns: TANGGAL | KETERANGAN | CBG | MUTASI | SALDO
 * Debit marked with "DB" after amount, Credit has no marker
 * Works with both text-based and OCR output
 */
class BCAParser extends BaseParser {
    constructor() {
        super('BCA');
    }

    parse(pages, metadata = {}) {
        const allText = pages.map(p => p.text || '').join('\n');

        
        // Extract account info from header
        let accountNo = '';
        let accountName = '';
        let branch = '';
        let period = '';
        let year = null;
        let month = null;

        // NO. REKENING : 0732033333
        const accMatch = allText.match(/NO\.?\s*REKENING\s*:\s*(\d+)/i);
        if (accMatch) accountNo = accMatch[1];

        // Branch - KCP line
        const branchMatch = allText.match(/^(KCP?\s+.+)$/m);
        if (branchMatch) branch = branchMatch[1].trim();

        // Account name - appears after branch line, before address info
        // Format: "KCP TOMANG TOL\nGARDA INTEGRA SOLUSINDO PT  NO. REKENING..."
        const nameMatch = allText.match(/(?:KCP?\s+.+\n)([A-Z][A-Z\s]+(?:PT|CV|SOLUSINDO)?[A-Z\s]*?)(?:\s{2,}NO|\n)/m);
        if (nameMatch) {
            accountName = nameMatch[1].trim();
        } else {
            // Fallback: look for name before NO. REKENING
            const nameMatch2 = allText.match(/\n([A-Z][A-Z\s]+(?:PT|CV)?[A-Z\s]*?)\s+NO\.?\s*REKENING/m);
            if (nameMatch2) accountName = nameMatch2[1].trim();
        }

        // PERIODE : AGUSTUS 2024
        const periodMatch = allText.match(/PERIODE\s*:\s*(.+)/i);
        if (periodMatch) {
            period = periodMatch[1].trim();
            year = this.extractYear(period);
            month = this.extractMonth(period);
        }

        // Fallback from filename
        if (!year && metadata.filename) {
            year = this.extractYear(metadata.filename);
        }
        if (!month && metadata.filename) {
            month = this.extractMonth(metadata.filename);
        }

        // Extract transactions
        const transactions = [];
        let openingBalance = 0;
        let closingBalance = null; // null = not found, 0 = legitimately zero
        let totalDebit = 0;
        let totalCredit = 0;

        // Process all pages
        for (const page of pages) {
            const text = page.text || '';
            const lines = text.split('\n');
            
            let currentDate = null;
            let currentDesc = [];
            let currentAmount = 0;
            let currentIsDebit = false;
            let currentBalance = null;
            let pendingTransaction = false;

            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (!line) continue;

                // Skip header lines
                if (line.includes('REKENING') && (line.includes('GIRO') || line.includes('TAHAPAN'))) continue;
                if (line.includes('CATATAN:') || line.includes('Apabila nasabah')) continue;
                if (line.includes('TANGGAL') && line.includes('KETERANGAN')) continue;
                if (line.includes('HALAMAN') || line.includes('PERIODE') || line.includes('MATA UANG')) continue;
                if (line.includes('NO. REKENING')) continue;
                if (line.includes('Bersambung')) continue;
                if (line.includes('BCA berhak')) continue;
                if (line.includes('tercantum pada')) continue;
                if (line.includes('nasabah dianggap')) continue;

                // SALDO AWAL line (handles both "SALDO AWAL 812,945.00" and "SALDO AWAL : 812,945.00")
                const saldoAwalMatch = line.match(/SALDO\s+AWAL\s*[:\s]\s*([\d,]+\.\d{2})/i);
                if (saldoAwalMatch) {
                    // Flush pending transaction before processing summary
                    if (pendingTransaction && currentDate) {
                        transactions.push({
                            date: this.parseDate(currentDate, year),
                            dateStr: currentDate,
                            description: currentDesc.join(' ').trim(),
                            debit: currentIsDebit ? currentAmount : 0,
                            credit: currentIsDebit ? 0 : currentAmount,
                            balance: currentBalance !== null ? currentBalance : 0
                        });
                        pendingTransaction = false;
                    }
                    openingBalance = this.parseAmount(saldoAwalMatch[1]);
                    currentDate = null;
                    continue;
                }

                // Summary lines at bottom (OCR may read : as H or other chars)
                const saldoAkhirMatch = line.match(/SALDO\s+AKHIR\s*[:\sH]\s*([\d,]+\.\d{2})/i);
                if (saldoAkhirMatch) {
                    // Flush pending transaction before processing summary
                    if (pendingTransaction && currentDate) {
                        transactions.push({
                            date: this.parseDate(currentDate, year),
                            dateStr: currentDate,
                            description: currentDesc.join(' ').trim(),
                            debit: currentIsDebit ? currentAmount : 0,
                            credit: currentIsDebit ? 0 : currentAmount,
                            balance: currentBalance !== null ? currentBalance : 0
                        });
                        pendingTransaction = false;
                    }
                    closingBalance = this.parseAmount(saldoAkhirMatch[1]);
                    continue;
                }
                const mutasiCRMatch = line.match(/MUTASI\s+CR\s*[:\sH]\s*([\d,]+\.\d{2})/i);
                if (mutasiCRMatch) {
                    totalCredit = this.parseAmount(mutasiCRMatch[1]);
                    continue;
                }
                const mutasiDBMatch = line.match(/MUTASI\s+DB\s*[:\sH]\s*([\d,]+\.\d{2})/i);
                if (mutasiDBMatch) {
                    totalDebit = this.parseAmount(mutasiDBMatch[1]);
                    continue;
                }

                // Transaction line: starts with DD/MM
                const txnMatch = line.match(/^\s*(\d{2}\/\d{2})\s+(.+)/);
                if (txnMatch) {
                    // Save pending transaction
                    if (pendingTransaction && currentDate) {
                        transactions.push({
                            date: this.parseDate(currentDate, year),
                            dateStr: currentDate,
                            description: currentDesc.join(' ').trim(),
                            debit: currentIsDebit ? currentAmount : 0,
                            credit: currentIsDebit ? 0 : currentAmount,
                            balance: currentBalance !== null ? currentBalance : 0
                        });
                    }

                    currentDate = txnMatch[1];
                    const rest = txnMatch[2];
                    currentDesc = [];
                    currentAmount = 0;
                    currentIsDebit = false;
                    currentBalance = null;
                    pendingTransaction = true;

                    // Try to extract amount and balance from this line
                    this._parseTransactionLine(rest, (desc, amount, isDebit, balance) => {
                        currentDesc = [desc];
                        currentAmount = amount;
                        currentIsDebit = isDebit;
                        if (balance !== null) currentBalance = balance;
                    });
                } else if (pendingTransaction) {
                    // Continuation line - may contain amount/balance or description
                    const amountMatch = line.match(/(?:^|\s)(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*(DB)?\s*(?:(\d{1,3}(?:[.,]\d{3})*[.,]\d{2}))?(?=\s|$)/);
                    if (amountMatch && !line.match(/^\d{10,}/)) {
                        // Could be just an amount line or description with amount
                        const descPart = line.replace(/(?:^|\s)(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*(DB)?\s*$/g, '').trim();
                        if (descPart) currentDesc.push(descPart);
                        
                        // Check if line has balance at end
                        const balanceMatch = line.match(/(?:^|\s)(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*$/);
                        const dbMatch = line.match(/(?:^|\s)(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s+DB(?=\s|$)/);
                        
                        if (dbMatch && currentAmount === 0) {
                            currentAmount = this.parseAmount(dbMatch[1]);
                            currentIsDebit = true;
                        }
                        if (!dbMatch && currentAmount === 0) {
                            // Credit amount
                            const crAmountMatch = line.match(/^\s*(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*$/);
                            if (crAmountMatch) {
                                currentAmount = this.parseAmount(crAmountMatch[1]);
                                currentIsDebit = false;
                            }
                        }
                        if (balanceMatch) {
                            currentBalance = this.parseAmount(balanceMatch[1]);
                        }
                    } else {
                        // Pure description continuation
                        if (line && !line.match(/^(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})$/) && !line.match(/^\s*$/)) {
                            currentDesc.push(line);
                        }
                    }
                }
            }

            // Don't forget the last pending transaction
            if (pendingTransaction && currentDate) {
                transactions.push({
                    date: this.parseDate(currentDate, year),
                    dateStr: currentDate,
                    description: currentDesc.join(' ').trim(),
                    debit: currentIsDebit ? currentAmount : 0,
                    credit: currentIsDebit ? 0 : currentAmount,
                    balance: currentBalance !== null ? currentBalance : 0
                });
            }
        }

        // ALWAYS recalculate totals from transactions to ensure mathematical consistency with daily summary
        totalDebit = transactions.reduce((sum, t) => sum + t.debit, 0);
        totalCredit = transactions.reduce((sum, t) => sum + t.credit, 0);
        
        if (closingBalance === null && transactions.length > 0) {
            // Fallback to last transaction balance only if summary extraction failed
            closingBalance = transactions[transactions.length - 1].balance;
        }
        if (closingBalance === null) closingBalance = 0;

        return this.formatResult({
            accountNo, accountName, branch, period, year, month,
            openingBalance, closingBalance, totalDebit, totalCredit,
            transactions
        });
    }

    _parseTransactionLine(rest, callback) {
        // BCA format: KETERANGAN [CBG] AMOUNT [DB] [BALANCE]
        // Try to find amount pattern at end of line
        // Pattern: "description  AMOUNT DB  BALANCE" or "description  AMOUNT  BALANCE"
        
        // Match amount with DB and balance
        let m = rest.match(/^(.+?)\s+(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s+DB\s+(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})$/);
        if (m) {
            callback(m[1].trim(), this.parseAmount(m[2]), true, this.parseAmount(m[3]));
            return;
        }

        // Match amount DB without balance
        m = rest.match(/^(.+?)\s+(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s+DB\s*$/);
        if (m) {
            callback(m[1].trim(), this.parseAmount(m[2]), true, null);
            return;
        }

        // Match credit amount and balance
        m = rest.match(/^(.+?)\s+(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s+(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})$/);
        if (m) {
            callback(m[1].trim(), this.parseAmount(m[2]), false, this.parseAmount(m[3]));
            return;
        }
        
        // Match credit amount without balance
        m = rest.match(/^(.+?)\s+(\d{1,3}(?:[.,]\d{3})*[.,]\d{2})\s*$/);
        if (m) {
            callback(m[1].trim(), this.parseAmount(m[2]), false, null);
            return;
        }

        // Just description
        callback(rest.trim(), 0, false, null);
    }
}
