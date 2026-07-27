/**
 * Mandiri Bank Statement Parser
 * Format: Rekening Koran / Statement of Account
 * Mixed: some text-based, some image-based (needs OCR)
 * May require password
 * Columns: Tanggal Transaksi | Tanggal Valuta | Rincian Transaksi/Nomor Referensi | Debit/Kredit | Saldo
 * Debit marked with "D" suffix on amount, Credit has no suffix
 */
class MandiriParser extends BaseParser {
    constructor() {
        super('MANDIRI');
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

        // No. Rekening: 157-00-0784745-3 (in table row format)
        const accMatch = allText.match(/(\d{3}-\d{2}-\d{7,}-\d)/);
        if (accMatch) accountNo = accMatch[1];
        if (!accountNo) {
            const accMatch2 = allText.match(/(?:No\.?\s*Rekening|Account\s*Number)\s*[:\s]*(\d[\d\-]+\d)/i);
            if (accMatch2) accountNo = accMatch2[1];
        }

        // Account name from header (usually first text line after company name)
        const nameMatch = allText.match(/Rekening Koran.*?\n(.+?)\n/i);
        if (nameMatch) {
            const name = nameMatch[1].trim();
            // Only take it if it looks like a company name
            if (name.match(/^[A-Z]/) && !name.match(/^Periode|^Period|^Hubungi/i)) {
                accountName = name;
            }
        }
        if (!accountName) {
            // Try from table: product name after account number
            const prodMatch = allText.match(/Mandiri\s+Tabungan\s+\w+/i);
            if (prodMatch) accountName = prodMatch[0];
        }

        // Branch - "15717 - KCP Cinere"
        const branchMatch = allText.match(/(\d+\s*-\s*KCP?\s+[\w\s]+)/i);
        if (branchMatch) branch = branchMatch[1].trim();

        // Period: 1/01/24 s/d 31/01/24
        const periodMatch = allText.match(/Periode?\s*(?:\/\s*Period)?\s*[:\s]*(\d{1,2}\/\d{2}\/\d{2,4}\s+s\/d\s+\d{1,2}\/\d{2}\/\d{2,4})/i);
        if (periodMatch) {
            period = periodMatch[1].trim();
            // Extract year from DD/MM/YY format
            const yMatch = period.match(/\/(\d{2})(?:\s|$)/);
            if (yMatch) year = 2000 + parseInt(yMatch[1]);
            // Try 4-digit year
            if (!year) {
                const y4Match = period.match(/\/(\d{4})/);
                if (y4Match) year = parseInt(y4Match[1]);
            }
            month = this.extractMonth(period);
            if (!month) {
                // From DD/MM/YY, extract the MM
                const mMatch = period.match(/\d{1,2}\/(\d{2})\/\d{2,4}/);
                if (mMatch) month = parseInt(mMatch[1]);
            }
        }

        if (!year && metadata.filename) year = this.extractYear(metadata.filename);
        if (!month && metadata.filename) month = this.extractMonth(metadata.filename);

        // Extract summary data
        const summaryDebit = allText.match(/Mutasi\s+Debit.*?:\s*([\d,]+\.\d{2})/i);
        if (summaryDebit) totalDebit = this.parseAmount(summaryDebit[1]);

        const summaryCredit = allText.match(/Mutasi\s+Kredit.*?:\s*([\d,]+\.\d{2})/i);
        if (summaryCredit) totalCredit = this.parseAmount(summaryCredit[1]);

        const summaryOpen = allText.match(/(?:Saldo\s+Awal|Previous\s+Balance)\s*[:\s]*([\d,]+\.\d{2})/i);
        if (summaryOpen) openingBalance = this.parseAmount(summaryOpen[1]);

        const summaryClose = allText.match(/(?:Saldo\s+Akhir|Current\s+Balance)\s*[:\s]*([\d,]+\.\d{2})/i);
        if (summaryClose) closingBalance = this.parseAmount(summaryClose[1]);

        // Extract transactions
        const transactions = [];
        this._parseFromText(pages, transactions, year);

        // Calculate totals if not from summary
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
            
            // Skip pages that are summary/cover pages
            if (lines.some(l => l.includes('Ringkasan / At a glance') || l.includes('Ringkasan Akun'))) {
                if (!lines.some(l => l.match(/^\d{2}\/\d{2}\s+\d{2}\/\d{2}\s+/))) {
                    continue;
                }
            }

            let i = 0;
            while (i < lines.length) {
                const line = lines[i].trim();
                
                // Skip header/footer lines
                if (!line || line.includes('Tabungan / Savings') || 
                    line.includes('No. Rekening') || line.includes('Account Number') ||
                    line.includes('Tanggal') && line.includes('Rincian') ||
                    line.includes('Transaction') && line.includes('Date') ||
                    line.match(/^Hal\s+Page/) || line.includes('Ringkasan') ||
                    line.includes('Informasi /') || line.includes('Catatan') ||
                    line.match(/^\* /) || line.includes('Total Mandiri')) {
                    i++;
                    continue;
                }

                // Saldo Awal line: "01/01 Saldo Awal AMOUNT"
                const saldoAwalMatch = line.match(/^.*?(\d{2}[/l1I\.\-]\d{2})\s+Saldo\s+Awal\s+([\d,]+\.\d{2})/i);
                if (saldoAwalMatch) {
                    const parsedOp = this.parseAmount(saldoAwalMatch[2]);
                    transactions.push({
                        date: saldoAwalMatch[1], // Store as string
                        description: 'Saldo Awal',
                        debit: 0,
                        credit: 0,
                        balance: parsedOp
                    });
                    i++;
                    continue;
                }

                // Transaction: "DD/MM DD/MM -description amount [D] balance"
                const txnMatch = line.match(/^.*?(\d{2}[/l1I\.\-]\d{2})\s+(\d{2}[/l1I\.\-]\d{2})\s+(.+)/i);
                if (txnMatch) {
                    const dateStr = txnMatch[1];
                    let rest = txnMatch[3];
                    let description = '';
                    let amount = 0;
                    let isDebit = false;
                    let balance = 0;

                    // Try extracting amount and balance from this line
                    // Pattern 1: description AMOUNT D BALANCE
                    let m = rest.match(/^(.+?)\s+([\d,]+\.\d{2})\s+D\s+([\d,]+\.\d{2})\s*$/i);
                    if (m) {
                        description = m[1].trim();
                        amount = this.parseAmount(m[2]);
                        isDebit = true;
                        balance = this.parseAmount(m[3]);
                    } else {
                        // Pattern 2: description AMOUNT BALANCE (credit)
                        m = rest.match(/^(.+?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/);
                        if (m) {
                            description = m[1].trim();
                            amount = this.parseAmount(m[2]);
                            isDebit = false;
                            balance = this.parseAmount(m[3]);
                        } else {
                            // Pattern 3: description AMOUNT D (no balance - continues next line)
                            m = rest.match(/^(.+?)\s+([\d,]+\.\d{2})\s+D\s*$/);
                            if (m) {
                                description = m[1].trim();
                                amount = this.parseAmount(m[2]);
                                isDebit = true;
                            } else {
                                // Pattern 4: description AMOUNT (credit, no balance)
                                m = rest.match(/^(.+?)\s+([\d,]+\.\d{2})\s*$/);
                                if (m) {
                                    description = m[1].trim();
                                    amount = this.parseAmount(m[2]);
                                } else {
                                    description = rest.trim();
                                }
                            }
                        }
                    }

                    // Collect continuation lines
                    let j = i + 1;
                    while (j < lines.length) {
                        const nextLine = lines[j].trim();
                        if (nextLine.match(/^\d{2}\/\d{2}\s+/) || 
                            nextLine.match(/^Hal\s+Page/) ||
                            nextLine.match(/^Saldo\s+Awal/i) ||
                            nextLine.match(/^Saldo\s+Akhir/i) ||
                            nextLine.match(/^Tabungan/) ||
                            nextLine.match(/^No\.\s*Rekening/) ||
                            nextLine.match(/^Tanggal/) ||
                            nextLine === '' ||
                            nextLine.match(/^P\s*age$/)) {
                            break;
                        }
                        
                        // Check if this line has amount + balance
                        const amtLine = nextLine.match(/^([\d,]+\.\d{2})\s+(D\s+)?([\d,]+\.\d{2})\s*$/);
                        if (amtLine && amount === 0) {
                            amount = this.parseAmount(amtLine[1]);
                            isDebit = !!amtLine[2];
                            balance = this.parseAmount(amtLine[3]);
                        } else if (nextLine.match(/^[\d,]+\.\d{2}\s+D?\s*$/) && balance === 0) {
                            const valMatch = nextLine.match(/([\d,]+\.\d{2})/);
                            if (valMatch) {
                                if (amount === 0) {
                                    amount = this.parseAmount(valMatch[1]);
                                    isDebit = nextLine.includes(' D');
                                } else {
                                    balance = this.parseAmount(valMatch[1]);
                                }
                            }
                        } else {
                            // Description continuation
                            description += ' ' + nextLine;
                        }
                        j++;
                    }

                    // Clean description
                    description = description.replace(/\s+/g, ' ').trim();
                    description = description.replace(/^-/, '').trim();

                    // Skip summary lines that got caught
                    if (description.includes('Saldo Awal / Previous Balance') ||
                        description.includes('Mutasi Kredit / Total') ||
                        description.includes('Mutasi Debit / Total') ||
                        description.includes('Saldo Akhir / Current Balance')) {
                        i = j;
                        continue;
                    }

                    if (amount > 0 || balance > 0) {
                        transactions.push({
                            date: dateStr, // store as string for consistency with other parsers
                            description: description,
                            debit: isDebit ? amount : 0,
                            credit: !isDebit ? amount : 0,
                            balance: balance
                        });
                    }

                    i = j;
                    continue;
                }

                i++;
            }
        }
    }
}

let openingBalance = 0; // Module-level for Saldo Awal reference
