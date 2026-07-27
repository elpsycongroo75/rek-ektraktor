/**
 * Base Parser - Abstract class for all bank statement parsers
 * Each bank parser extends this and implements its own parsing logic
 */
class BaseParser {
    constructor(bankName) {
        this.bankName = bankName;
    }

    /**
     * Parse extracted text/tables from PDF pages into standardized transactions
     * @param {Array} pages - Array of {text, tables, pageNum} from PDF extraction
     * @param {Object} metadata - Additional info like filename, period, etc.
     * @returns {Object} { accountNo, accountName, branch, period, currency, openingBalance, closingBalance, transactions[] }
     */
    parse(pages, metadata = {}) {
        throw new Error('parse() must be implemented by subclass');
    }

    /**
     * Parse a numeric string (e.g., "1,234,567.89") to a float
     */
    parseAmount(str) {
        if (!str || str === '-' || str === '0' || str === '0.00') return 0;
        // Remove any trailing minus sign (some banks use "25,000.00-")
        let negative = false;
        str = String(str).trim();
        if (str.endsWith('-')) {
            negative = true;
            str = str.slice(0, -1);
        }
        if (str.startsWith('-')) {
            negative = true;
            str = str.slice(1);
        }
        if (str.startsWith('(') && str.endsWith(')')) {
            negative = true;
            str = str.slice(1, -1);
        }
        // Remove thousand separators (commas) and parse
        const cleaned = str.replace(/,/g, '').replace(/\s/g, '');
        const val = parseFloat(cleaned);
        if (isNaN(val)) return 0;
        return negative ? -val : val;
    }

    /**
     * Parse date string to a standardized Date object
     * Handles various formats: DD/MM/YYYY, DD-MM-YYYY, DD/MM, MMM DD YYYY, etc.
     */
    parseDate(str, year = null) {
        if (!str) return null;
        str = String(str).trim();

        // Format: "Jan 06, 2025" or "Jan 06, 2025 10:00:54 WIB"
        const monthNames = {
            'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'mei': 4, 'jun': 5,
            'jul': 6, 'aug': 7, 'agt': 7, 'sep': 8, 'oct': 9, 'okt': 9, 'nov': 10, 'dec': 11, 'des': 11
        };

        // Format: "Jan 06, 2025"
        let m = str.match(/^(\w{3})\s+(\d{1,2}),?\s+(\d{4})/i);
        if (m) {
            const mon = monthNames[m[1].toLowerCase()];
            if (mon !== undefined) {
                return new Date(parseInt(m[3]), mon, parseInt(m[2]));
            }
        }

        // Format: "DD/MM/YYYY HH.MM.SS" or "DD/MM/YYYY"
        m = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (m) {
            let y = parseInt(m[3]);
            if (y < 100) y += 2000;
            return new Date(y, parseInt(m[2]) - 1, parseInt(m[1]));
        }

        // Format: "DD-MMM-YYYY" e.g., "31-01-2024"
        m = str.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
        if (m) {
            return new Date(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1]));
        }

        // Format: "DD/MM" (no year - use provided year)
        m = str.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
        if (m && year) {
            return new Date(year, parseInt(m[2]) - 1, parseInt(m[1]));
        }

        return null;
    }

    /**
     * Extract year from period string or filename
     */
    extractYear(text) {
        const m = text.match(/\b(20\d{2})\b/);
        return m ? parseInt(m[1]) : new Date().getFullYear();
    }

    /**
     * Extract month from period string or filename
     */
    extractMonth(text) {
        const monthMap = {
            'januari': 1, 'februari': 2, 'maret': 3, 'april': 4,
            'mei': 5, 'juni': 6, 'juli': 7, 'agustus': 8,
            'september': 9, 'oktober': 10, 'november': 11, 'desember': 12,
            'january': 1, 'february': 2, 'march': 3, 'may': 5,
            'june': 6, 'july': 7, 'august': 8, 'october': 10,
            'december': 12, 'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4,
            'jun': 6, 'jul': 7, 'aug': 8, 'agt': 8, 'sep': 9,
            'oct': 10, 'okt': 10, 'nov': 11, 'dec': 12, 'des': 12
        };
        const lower = text.toLowerCase();
        for (const [name, num] of Object.entries(monthMap)) {
            if (lower.includes(name)) return num;
        }
        // Try numeric month from date pattern
        const m = lower.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (m) return parseInt(m[2]);
        return null;
    }

    /**
     * Format a standardized result object
     */
    formatResult(data) {
        return {
            bankName: this.bankName,
            accountNo: data.accountNo || '',
            accountName: data.accountName || '',
            branch: data.branch || '',
            period: data.period || '',
            year: data.year || null,
            month: data.month || null,
            currency: data.currency || 'IDR',
            openingBalance: data.openingBalance ?? 0,
            closingBalance: data.closingBalance ?? 0,
            totalDebit: data.totalDebit ?? 0,
            totalCredit: data.totalCredit ?? 0,
            transactions: (data.transactions || []).map(t => ({
                date: t.date,
                dateStr: t.dateStr || '',
                description: t.description || '',
                debit: t.debit ?? 0,
                credit: t.credit ?? 0,
                balance: t.balance ?? 0,
            }))
        };
    }
}
