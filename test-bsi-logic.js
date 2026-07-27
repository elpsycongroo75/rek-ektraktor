const testText = `Mutasi Rekening
REKENING : IDR 7159595913 - BSI Giro Institusi Wadiah
Cabang
ID0010067
Periode     : 01/08/2024 s/d 31/08/2024
Total Debet (Dalam Periode)     : 2,641,100.00-
Total Kredit (Dalam Periode) : 3,700,000.00
Saldo riil awal per 01/08/2024 : 684,109.35
Saldo riil awal per 31/08/2024 : 1,743,009.35
Waktu
No     No.Referensi     Nama Pengirim     Bank Pengirim     Nama Penerima     Bank Penerima Deskripsi     Debet     Kredit     Saldo Riil     Kode
Transaksi   
BIFAST - TRF Dari -
PT GARDA
02-08-2024  WINARDO  Bank Syariah  Bank BCA -
1     FT242153F718     Bank BCA  INTEGRA  1,000,000.00     1,684,109.35     213
15.11     MARDANUS     Indonesia  WINARDO
SOLUSINDO
MARDANUS
BIFAST - TRF Dari -
PT GARDA
28-08-2024  WINARDO  Bank Syariah  Bank BCA -
2     FT24241NMZTK     Bank BCA  INTEGRA  2,700,000.00     4,384,109.35     213
12.13     MARDANUS     Indonesia  WINARDO
SOLUSINDO
MARDANUS
PB LPO 347 - TRF Ke
PT GARDA  VISINDO
28-08-2024  Bank Syariah  Bank Central  - 014 - VISINDO
3     FT24241NDHM0  INTEGRA  GLOBAL  2,619,600.00-     1,764,509.35     213
12.17     Indonesia  Asia  GLOBAL
SOLUSINDO  TEKNOLOGI
TEKNOLOGI
PT GARDA
28-08-2024  Bank Syariah  Biaya Pemindahbukuan
4     FT24241NDHM0  INTEGRA  6,500.00-     1,758,009.35     234
12.17     Indonesia  e-Banking   
SOLUSINDO
PT GARDA
31-08-2024  Bank Syariah
5     7159595913.73.202408  INTEGRA  Biaya Administrasi     15,000.00-     1,743,009.35     961
19.04     Indonesia   
SOLUSINDO`;

const lines = testText.split('\n');
let lastDateStr = '';
const transactions = [];

for (const line of lines) {
    const dateMatch = line.match(/(\d{2}-\d{2}-\d{4})/);
    if (dateMatch) {
        lastDateStr = dateMatch[1];
    }
    
    const amountsMatch = line.match(/([\d,]+\.\d{2}-?)\s+([\d,]+\.\d{2}-?)(?:\s+\d{3})?$/);
    if (amountsMatch && !line.includes('Total') && !line.includes('Saldo riil')) {
        let amt1 = amountsMatch[1];
        let amt2 = amountsMatch[2];
        
        let debit = 0;
        let credit = 0;
        
        if (amt1.endsWith('-')) {
            debit = parseFloat(amt1.replace(/,/g, '').replace('-', ''));
        } else {
            credit = parseFloat(amt1.replace(/,/g, ''));
        }
        const balance = parseFloat(amt2.replace(/,/g, '').replace('-', ''));
        
        // Try to get description if possible
        const descMatch = line.replace(/^\s*\d+\s+\S+\s+(.+?)\s+[\d,]+\.\d{2}-?\s+[\d,]+\.\d{2}-?/, '$1').trim();
        
        transactions.push({ dateStr: lastDateStr, debit, credit, balance, description: descMatch });
    }
}
console.log(transactions);
