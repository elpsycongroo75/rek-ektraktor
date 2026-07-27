/**
 * BNI Bank Statement Parser
 * Format: ACCOUNT STATEMENT
 * Columns: Posting Date | Effective Date | Branch | Journal | Transaction Description | Amount | DB/CR | Balance
 * Amount has double comma issue from PDF extraction (e.g., "22,,000000,,000000..0000")
 */
class BNIParser extends BaseParser {
    constructor() {
        super('BNI');
    }

    parse(pages, metadata = {}) {
        const allText = pages.map(p => p.text || '').join('\n');
        
        // Extract account info
        let accountNo = '';
        let accountName = '';
        let branch = '';
        let period = '';
        let year = null;
        let month = null;

        // Account No. : 6009992729 / GARDA INTEGRA SOLUSINDO PT(IDR)
        const accMatch = allText.match(/Account\s*No\.?\s*:\s*(\d+)\s*\/?\s*([^(\n]+)?/i);
        if (accMatch) {
            accountNo = accMatch[1];
            if (accMatch[2]) accountName = accMatch[2].trim().replace(/\(IDR\)/i, '').trim();
        }

        // Fallback for account name
        if (!accountName) {
            const nameMatch = allText.match(/^([A-Z][A-Z\s]+(?:PT|CV)?\s+[A-Z\s]+?)\s+Account/m);
            if (nameMatch) accountName = nameMatch[1].trim();
        }

        // Period : 01-Jan-24 - 31-Jan-24
        const periodMatch = allText.match(/Period\s*:\s*(.+?)(?:\n|$)/i);
        if (periodMatch) {
            period = periodMatch[1].trim();
            // Try to extract year from period - "01-Jan-24" format
            const yMatch = period.match(/(\d{2})-(\w{3})-(\d{2})/);
            if (yMatch) {
                year = 2000 + parseInt(yMatch[3]);
                const monthMap = { 'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12 };
                month = monthMap[yMatch[2].toLowerCase()] || null;
            }
            // Also try YYYY format
            if (!year) {
                const y4Match = period.match(/(\d{4})/);
                if (y4Match) year = parseInt(y4Match[1]);
            }
        }

        if (!year && metadata.filename) year = this.extractYear(metadata.filename);
        if (!month && metadata.filename) month = this.extractMonth(metadata.filename);

        // Extract transactions using table data (most reliable for BNI)
        const transactions = [];
        let openingBalance = 0;
        let totalDebit = 0;
        let totalCredit = 0;

        // Get Ledger Balance (opening balance)
        const ledgerMatch = allText.match(/(?:Ledger|Beginning)\s*Balance[: ]*([\d,]+\.\d{2})/i);
        if (ledgerMatch) {
            openingBalance = this.parseAmount(ledgerMatch[1]);
        }

        // Parse from table data
        for (const page of pages) {
            if (page.tables && page.tables.length > 0) {
                for (const table of page.tables) {
                    this._parseTable(table, transactions, year);
                }
            }
        }

        // If no table data, parse from text
        if (transactions.length === 0) {
            this._parseFromText(pages, transactions, year);
        }

        // Calculate totals
        totalDebit = transactions.reduce((sum, t) => sum + t.debit, 0);
        totalCredit = transactions.reduce((sum, t) => sum + t.credit, 0);
        
        if (openingBalance === 0 && transactions.length > 0 && transactions[0].balance > 0) {
            const first = transactions[0];
            const firstAmount = first.debit > 0 ? first.debit : -first.credit;
            openingBalance = first.balance + firstAmount;
        }
        
        const closingBalance = transactions.length > 0 ? transactions[transactions.length - 1].balance : openingBalance;

        return this.formatResult({
            accountNo, accountName, branch, period, year, month,
            openingBalance, closingBalance, totalDebit, totalCredit,
            transactions
        });
    }

    _parseTable(table, transactions, year) {
        for (let i = 1; i < table.length; i++) {
            const row = table[i];
            if (!row || row.length < 5) continue;

            // Skip ledger balance row
            if (row[0] && String(row[0]).includes('Ledger Balance')) continue;
            
            const dateStr = String(row[0] || '').trim();
            const description = String(row[5] || '').replace(/\n/g, ' ').trim();
            const amountStr = String(row[6] || '');
            const dbcr = String(row[7] || '').trim().toUpperCase();
            // Balance could be in column 8 or 9 depending on the table structure
            const balanceStr = String(row[9] || row[8] || '');

            if (!dateStr.match(/\d{2}\/\d{2}\/\d{4}/)) continue;

            const amount = this._fixBNIAmount(amountStr);
            const balance = this.parseAmount(balanceStr);
            const isDebit = dbcr === 'D';

            // Skip fee entries with very small amounts if they duplicate
            const date = this.parseDate(dateStr.split(' ')[0], year);

            transactions.push({
                date,
                dateStr: dateStr.split(' ')[0],
                description: description || 'N/A',
                debit: isDebit ? amount : 0,
                credit: isDebit ? 0 : amount,
                balance
            });
        }
    }

    _parseFromText(pages, transactions, year) {
        for (const page of pages) {
            const text = page.text || '';
            const lines = text.split('\n');
            
            let i = 0;
            while (i < lines.length) {
                const line = lines[i].trim();
                // Format 1: DD/MM/YYYY HH.MM.SS DD/MM/YYYY HH.MM.SS
                const dateMatch1 = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\.\d{2}\.\d{2})\s+(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\.\d{2}\.\d{2})\s+(.+)/);
                // Format 2: ID DD/MM/YYYY TEXT
                const dateMatch2 = line.match(/^(\d+)\s+(\d{2}\/\d{2}\/\d{4})\s+(.+)/);
                
                let dateStr = null;
                let rest = null;
                
                if (dateMatch1) {
                    dateStr = dateMatch1[1];
                    rest = dateMatch1[5];
                } else if (dateMatch2) {
                    dateStr = dateMatch2[2];
                    rest = dateMatch2[3];
                }

                if (dateStr && rest) {
                    // Try to extract amount and D/K/C
                    // Pattern: BRANCH_INFO JOURNAL_NO DESCRIPTION AMOUNT D/K/C BALANCE
                    let amountMatch = rest.match(/([\d,\.]+)\s+([DKC])\s+([\d,]+\.\d{2})\s*$/);
                    let hasBalance = true;
                    if (!amountMatch) {
                        amountMatch = rest.match(/([\d,\.]+)\s+([DKC])\s*$/);
                        hasBalance = false;
                    }
                    
                    if (amountMatch) {
                        let rawAmountStr = amountMatch[1];
                        let amount = this._fixBNIAmount(rawAmountStr);
                        const isDebit = amountMatch[2] === 'D';
                        let balance = hasBalance ? this.parseAmount(amountMatch[3]) : 0;
                        if (!hasBalance && transactions.length > 0) {
                            const prevTxn = transactions[transactions.length - 1];
                            balance = prevTxn.balance + (isDebit ? -amount : amount);
                        }

                        // Get description part
                        let desc = rest.substring(0, amountMatch.index).trim();
                        
                        // FIX for Credit transactions where amount is extracted as 0.00
                        // AND for Debit transactions where Journal No is extracted instead of Amount
                        let isAmountValid = /\.\d{2}$/.test(rawAmountStr) || /,\d{2}$/.test(rawAmountStr);
                        if (!isDebit && amount === 0) {
                            isAmountValid = false;
                        }

                        if (!isAmountValid) {
                            let targetText = "";
                            let foundInDesc = false;
                            
                            // Check description first
                            if (desc.match(/[\d,]+\.\d{2}/)) {
                                targetText = desc;
                                foundInDesc = true;
                            } else if (i > 0) {
                                targetText = lines[i-1].trim();
                            }

                            if (targetText) {
                                const nums = targetText.match(/([\d,]+\.\d{2})/g);
                                if (nums && nums.length > 0) {
                                    amount = this._fixBNIAmount(nums[0]);
                                    
                                    if (!hasBalance) {
                                        if (nums.length === 3) {
                                            hasBalance = true;
                                            balance = this.parseAmount(nums[2]);
                                        } else if (nums.length === 2 && nums[0] !== nums[1]) {
                                            hasBalance = true;
                                            balance = this.parseAmount(nums[1]);
                                        }
                                    }
                                    
                                    if (foundInDesc) {
                                        const firstNumIdx = desc.indexOf(nums[0]);
                                        if (firstNumIdx > -1) {
                                            desc = desc.substring(0, firstNumIdx).trim();
                                        }
                                    }
                                }
                            }
                        }

                        // Remove branch info (DIVISI, etc.)
                        desc = desc.replace(/^(?:DIVISI\s+)?(?:TRANSACTI|OPERASIO)\w*\s*/i, '');
                        desc = desc.replace(/^\d+\s+/, ''); // Remove journal number
                        
                        // Collect continuation lines
                        let j = i + 1;
                        while (j < lines.length) {
                            const nextLine = lines[j].trim();
                            if (nextLine.match(/^\d{2}\/\d{2}\/\d{4}/) || 
                                nextLine.match(/^Ledger Balance/) ||
                                nextLine.match(/^Ending Balance/) ||
                                nextLine === '') {
                                break;
                            }
                            // Skip structural labels
                            if (!nextLine.match(/^(?:DIVISI|TRANSACTI|BANKING|SERVICES|\(TBS\)|OPERASIO|NAL)$/i)) {
                                desc += ' ' + nextLine;
                            }
                            j++;
                        }

                        transactions.push({
                            date: this.parseDate(dateStr, year),
                            dateStr,
                            description: desc.trim() || 'N/A',
                            debit: isDebit ? amount : 0,
                            credit: isDebit ? 0 : amount,
                            balance
                        });
                    }
                }
                i++;
            }
        }
    }

    _fixBNIAmount(str) {
        if (!str) return 0;
        str = String(str).trim();
        
        // BNI PDF extraction produces doubled text: "22,,000000,,000000..0000"
        // This is because the PDF has overlapping text renders
        // Strategy: detect doubled pattern and extract the correct amount
        
        if (str.includes(',,') || str.includes('..')) {
            // Method 1: Look for the pattern where digits are doubled
            // "22,,000000,,000000..0000" should be "22,000,000.00"
            // "28,534,6008..0000" should be "28,534,608.00" (or 28,534,600.80)
            
            // First normalize: remove doubled separators
            let cleaned = str.replace(/,,+/g, ',').replace(/\.\.+/g, '.');
            
            // Check if number of digits after comma groups is unusual
            const parts = cleaned.split('.');
            const intPart = parts[0] || '';
            const decPart = parts[1] || '';
            
            // Check digit groups
            const groups = intPart.split(',');
            let reconstructed = '';
            
            if (groups.length > 0) {
                // First group might have 1-3 digits
                reconstructed = groups[0];
                
                for (let g = 1; g < groups.length; g++) {
                    const grp = groups[g];
                    if (grp.length > 3) {
                        // This group has doubled digits - take first half or first 3
                        reconstructed += ',' + grp.substring(0, 3);
                    } else {
                        reconstructed += ',' + grp;
                    }
                }
            }
            
            // Handle decimal part
            if (decPart.length > 2) {
                reconstructed += '.' + decPart.substring(0, 2);
            } else {
                reconstructed += '.' + decPart;
            }
            
            return this.parseAmount(reconstructed);
        }
        
        return this.parseAmount(str);
    }
}
