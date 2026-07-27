const fs = require('fs');

// Mock global for browser script
global.window = {};

// Evaluate the base parser and bsi parser
eval(fs.readFileSync('./js/parsers/base-parser.js', 'utf8'));
eval(fs.readFileSync('./js/parsers/bsi-parser.js', 'utf8'));

const parser = new BSIParser();

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
MARDANUS`;

const result = parser.parse([{ text: testText, pageNum: 1, tables: [] }], { filename: 'test.pdf' });
console.log(JSON.stringify(result, null, 2));
