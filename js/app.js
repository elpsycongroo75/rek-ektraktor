/**
 * RekBank Extractor - Client-Side App (Vercel Edition)
 * All PDF processing happens in the browser using PDF.js + Tesseract.js
 * No server-side processing needed
 */

// ===================== STATE =====================
let currentBank = 'bca';
let currentType = 'tahunan';
let selectedFiles = [];
let parsedResults = [];
let activePreviewTab = 0;

const bankNames = {
    'bca': 'BCA', 'bni': 'BNI', 'bsi': 'BSI',
    'danamon': 'Danamon', 'mandiri': 'Mandiri', 'bankjakarta': 'Bank Jakarta'
};

function getMetaFields() {
    return {
        namaRM: document.getElementById('metaNamaRM')?.value || '',
        bankRK: document.getElementById('metaBankRK')?.value || '',
        namaGroup: document.getElementById('metaNamaGroup')?.value || '',
        jenisRek: document.getElementById('metaJenisRek')?.value || ''
    };
}

// ===================== INITIALIZATION =====================
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initUpload();
    updateTitle();
});

function initTabs() {
    document.querySelectorAll('.bank-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.bank-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentBank = tab.dataset.bank;
            updateTitle();
            resetApp();
        });
    });

    document.querySelectorAll('.sub-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.sub-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentType = tab.dataset.type;
            updateTitle();
            if (parsedResults.length > 0) renderResults();
        });
    });
}

function initUpload() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');

    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.classList.add('dragover'); });
    uploadArea.addEventListener('dragleave', () => uploadArea.classList.remove('dragover'));
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        addFiles(Array.from(e.dataTransfer.files).filter(f => f.name.endsWith('.pdf')));
    });

    fileInput.addEventListener('change', (e) => {
        addFiles(Array.from(e.target.files));
        fileInput.value = '';
    });
}

function updateTitle() {
    const title = `${bankNames[currentBank]} - ${currentType === 'tahunan' ? 'Rekap Tahunan' : 'Rekap Harian'}`;
    document.getElementById('sectionTitle').textContent = title;
}

// ===================== FILE MANAGEMENT =====================
function addFiles(files) {
    for (const file of files) {
        if (!selectedFiles.find(f => f.name === file.name && f.size === file.size)) {
            selectedFiles.push(file);
        }
    }
    renderFileList();
}

function removeFile(index) { selectedFiles.splice(index, 1); renderFileList(); }
function clearFiles() { selectedFiles = []; renderFileList(); }

function renderFileList() {
    const fileList = document.getElementById('fileList');
    const fileItems = document.getElementById('fileItems');
    const actionRow = document.getElementById('actionRow');

    if (selectedFiles.length === 0) {
        fileList.style.display = 'none';
        actionRow.style.display = 'none';
        return;
    }

    fileList.style.display = 'block';
    actionRow.style.display = 'flex';

    fileItems.innerHTML = selectedFiles.map((file, i) => `
        <div class="file-item" id="file-item-${i}">
            <div class="file-item-info">
                <span class="file-item-icon">📄</span>
                <span class="file-item-name">${file.name}</span>
                <span class="file-item-size">${(file.size / 1024).toFixed(1)} KB</span>
            </div>
            <span class="file-item-status" id="file-status-${i}"></span>
            <button class="file-item-remove" id="file-remove-${i}" onclick="removeFile(${i})" title="Hapus file">✕</button>
        </div>
    `).join('');
}

function togglePassword() {
    const input = document.getElementById('pdfPassword');
    input.type = input.type === 'password' ? 'text' : 'password';
}

// ===================== CLIENT-SIDE PDF PROCESSING =====================
async function processFiles() {
    if (selectedFiles.length === 0) return;

    const btnProcess = document.getElementById('btnProcess');
    const progressSection = document.getElementById('progressSection');
    const progressBar = document.getElementById('progressBar');
    const progressText = document.getElementById('progressText');

    btnProcess.disabled = true;
    btnProcess.innerHTML = '<span class="spinner"></span> Memproses...';
    progressSection.style.display = 'block';

    selectedFiles.forEach((_, i) => {
        const btn = document.getElementById(`file-remove-${i}`);
        if (btn) btn.disabled = true;
    });

    parsedResults = [];
    const password = document.getElementById('pdfPassword').value;

    // Ensure PDF.js is loaded
    await window.pdfjsReady;

    for (let i = 0; i < selectedFiles.length; i++) {
        const file = selectedFiles[i];
        const statusSpan = document.getElementById(`file-status-${i}`);
        if (statusSpan) {
            statusSpan.innerHTML = '<span class="spinner" style="width: 14px; height: 14px; border-width: 2px;"></span> Memproses...';
            statusSpan.style.color = 'var(--primary)';
        }

        progressText.textContent = `Mengekstrak file ${i + 1} dari ${selectedFiles.length}...`;
        progressBar.style.width = '0%';
        const startTime = Date.now();

        try {
            const result = await processOnePDF(file, password, (progress, msg) => {
                progressBar.style.width = `${progress}%`;
                if (msg) progressText.textContent = msg;
            });

            progressBar.style.width = '100%';
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);

            if (result.error) {
                if (statusSpan) { statusSpan.textContent = `❌ ${result.error} (${duration}s)`; statusSpan.style.color = 'var(--danger)'; }
            } else {
                parsedResults.push(result);
                if (statusSpan) { statusSpan.textContent = `✅ Selesai (${duration}s)`; statusSpan.style.color = 'var(--success)'; }
            }
        } catch (err) {
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            if (statusSpan) { statusSpan.textContent = `❌ ${err.message} (${duration}s)`; statusSpan.style.color = 'var(--danger)'; }
        }
    }

    progressText.textContent = 'Menyiapkan preview...';
    if (parsedResults.length > 0) {
        parsedResults.sort((a, b) => (a.month || 0) - (b.month || 0));
        progressText.textContent = 'Selesai!';
        setTimeout(() => renderResults(), 500);
    } else {
        progressText.textContent = 'Gagal memproses file.';
        btnProcess.disabled = false;
        btnProcess.innerHTML = '<span class="btn-icon">⚡</span> Proses Ekstraksi';
    }
}

/**
 * Process a single PDF file entirely in the browser
 * 1. PDF.js extracts text from each page
 * 2. If page is image-based (text < 50 chars), render to canvas → Tesseract OCR
 * 3. Pass all page texts to the appropriate bank parser
 */
async function processOnePDF(file, password, onProgress) {
    const arrayBuffer = await file.arrayBuffer();
    
    // Load PDF with PDF.js
    const loadingTask = pdfjsLib.getDocument({
        data: arrayBuffer,
        password: password || undefined,
        standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@3.11.174/standard_fonts/'
    });
    
    onProgress(5, `Membuka PDF: ${file.name}...`);
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;
    
    const pages = [];
    let ocrWorker = null;

    for (let i = 1; i <= numPages; i++) {
        onProgress(5 + (i / numPages) * 40, `Mengekstrak halaman ${i}/${numPages}...`);
        
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        let text = textContent.items.map(item => item.str).join(' ');
        
        // Reconstruct lines from PDF text items using Y-position grouping
        const lineMap = {};
        for (const item of textContent.items) {
            const y = Math.round(item.transform[5]); // Y position
            if (!lineMap[y]) lineMap[y] = [];
            lineMap[y].push({ x: item.transform[4], str: item.str });
        }
        // Sort by Y descending (PDF coords), then X ascending within each line
        const sortedYs = Object.keys(lineMap).map(Number).sort((a, b) => b - a);
        const lines = sortedYs.map(y => {
            return lineMap[y].sort((a, b) => a.x - b.x).map(i => i.str).join('  ');
        });
        text = lines.join('\n');
        
        const isImage = text.replace(/\s/g, '').length < 50;
        
        if (isImage) {
            onProgress(45 + (i / numPages) * 45, `OCR halaman ${i}/${numPages} (image)...`);
            
            // Render page to canvas for OCR
            const viewport = page.getViewport({ scale: 2.0 }); // High res for OCR
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            const ctx = canvas.getContext('2d');
            
            await page.render({ canvasContext: ctx, viewport }).promise;
            
            // OCR with Tesseract.js
            if (!ocrWorker) {
                onProgress(45, 'Memuat mesin OCR...');
                ocrWorker = await Tesseract.createWorker('eng+ind');
                await ocrWorker.setParameters({
                    tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz.,/-:() \n\r\t',
                    preserve_interword_spaces: '1',
                });
            }
            
            const { data } = await ocrWorker.recognize(canvas);
            text = data.text;
        }
        
        pages.push({ text, pageNum: i, tables: [], isImage });
        page.cleanup();
    }
    
    if (ocrWorker) await ocrWorker.terminate();
    
    onProgress(92, 'Parsing data...');
    
    // Get the correct parser
    const parser = window.Parsers[currentBank];
    if (!parser) return { error: `Parser untuk ${currentBank} tidak ditemukan` };
    
    const result = parser.parse(pages, { filename: file.name });
    result.filename = file.name;
    
    onProgress(100, 'Selesai!');
    return result;
}

// ===================== RESULTS RENDERING =====================
function renderResults() {
    document.getElementById('uploadSection').style.display = 'none';
    const resultsSection = document.getElementById('resultsSection');
    resultsSection.style.display = 'block';

    const grouped = groupByAccount(parsedResults);
    renderInfoCards(grouped);
    renderPreviewTabs(grouped);
    renderPreviewContent(grouped, activePreviewTab);
}

function groupByAccount(results) {
    const groups = {};
    for (const r of results) {
        const key = r.accountNo || 'unknown';
        if (!groups[key]) {
            groups[key] = { accountNo: r.accountNo, accountName: r.accountName, branch: r.branch, bankName: r.bankName, months: {} };
        }
        
        // Auto-split multi-month PDFs based on transaction dates
        const txnsByMonth = {};
        for (const txn of r.transactions || []) {
            let txnMonth = r.month;
            if (txn.date && txn.date.includes('/')) {
                const parts = txn.date.split('/');
                if (parts.length >= 2) txnMonth = parseInt(parts[1], 10);
            } else if (txn.date && txn.date.includes('-')) {
                // BNI uses DD-MMM
                const parts = txn.date.split('-');
                if (parts.length >= 2) {
                    const mStr = parts[1].toLowerCase();
                    const monthMap = { jan:1, feb:2, mar:3, apr:4, may:5, mei:5, jun:6, jul:7, aug:8, agu:8, sep:9, oct:10, okt:10, nov:11, dec:12, des:12 };
                    if (monthMap[mStr]) txnMonth = monthMap[mStr];
                }
            }
            
            if (txnMonth) {
                if (!txnsByMonth[txnMonth]) txnsByMonth[txnMonth] = [];
                txnsByMonth[txnMonth].push(txn);
            }
        }
        
        const monthKeys = Object.keys(txnsByMonth);
        if (monthKeys.length > 1) {
            let prevClose = r.openingBalance || 0;
            monthKeys.sort((a, b) => parseInt(a) - parseInt(b)).forEach((mStr, idx) => {
                const m = parseInt(mStr);
                const mTxns = txnsByMonth[m];
                let mDebit = 0, mCredit = 0;
                mTxns.forEach(t => { mDebit += (t.debit||0); mCredit += (t.credit||0); });
                
                const mOpen = (idx === 0) ? (r.openingBalance || 0) : prevClose;
                const mClose = (idx === monthKeys.length - 1 && r.closingBalance) 
                                ? r.closingBalance 
                                : mOpen - mDebit + mCredit;
                
                prevClose = mClose;
                
                groups[key].months[m] = {
                    ...r,
                    month: m,
                    transactions: mTxns,
                    openingBalance: mOpen,
                    closingBalance: mClose,
                    totalDebit: mDebit,
                    totalCredit: mCredit
                };
            });
        } else if (monthKeys.length === 1) {
            const m = parseInt(monthKeys[0]);
            r.month = m;
            groups[key].months[m] = r;
        } else if (r.month) {
            groups[key].months[r.month] = r;
        } else {
            // Safe fallback
            r.month = 1;
            groups[key].months[1] = r;
        }
    }
    return Object.values(groups);
}

function renderInfoCards(grouped) {
    const infoCards = document.getElementById('infoCards');
    let totalDebit = 0, totalCredit = 0, totalTxns = 0;
    const accountCount = grouped.length;

    for (const g of grouped) {
        for (const m of Object.values(g.months)) {
            totalDebit += m.totalDebit || 0;
            totalCredit += m.totalCredit || 0;
            totalTxns += (m.transactions || []).length;
        }
    }

    infoCards.innerHTML = `
        <div class="info-card"><div class="info-card-label">Bank</div><div class="info-card-value">${bankNames[currentBank]}</div></div>
        <div class="info-card"><div class="info-card-label">Jumlah Rekening</div><div class="info-card-value">${accountCount}</div></div>
        <div class="info-card"><div class="info-card-label">Total Transaksi</div><div class="info-card-value">${totalTxns.toLocaleString()}</div></div>
        <div class="info-card"><div class="info-card-label">Total Debet</div><div class="info-card-value debit">${formatCurrency(totalDebit)}</div></div>
        <div class="info-card"><div class="info-card-label">Total Kredit</div><div class="info-card-value credit">${formatCurrency(totalCredit)}</div></div>
    `;
}

function renderPreviewTabs(grouped) {
    const previewTabs = document.getElementById('previewTabs');
    if (grouped.length <= 1) { previewTabs.innerHTML = ''; return; }
    previewTabs.innerHTML = grouped.map((g, i) => `
        <button class="preview-tab ${i === activePreviewTab ? 'active' : ''}" onclick="switchPreviewTab(${i})" data-idx="${i}">
            ${g.accountNo || 'Rekening ' + (i + 1)}
        </button>
    `).join('');
}

function switchPreviewTab(idx) {
    activePreviewTab = idx;
    const grouped = groupByAccount(parsedResults);
    document.querySelectorAll('.preview-tab').forEach(t => t.classList.remove('active'));
    document.querySelector(`.preview-tab[data-idx="${idx}"]`)?.classList.add('active');
    renderPreviewContent(grouped, idx);
}

function renderPreviewContent(grouped, tabIdx) {
    const content = document.getElementById('previewContent');
    const group = grouped[tabIdx] || grouped[0];
    if (!group) {
        content.innerHTML = '<p style="color:var(--gray-400);text-align:center;padding:40px;">Tidak ada data untuk ditampilkan.</p>';
        return;
    }
    if (currentType === 'tahunan') renderRekapTahunan(content, group);
    else renderRekapHarian(content, group);
}

function renderRekapTahunan(container, group) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const year = Object.values(group.months)[0]?.year || new Date().getFullYear();
    const shortYear = String(year).slice(-2);

    let rows = '';
    let totalDebit = 0, totalCredit = 0, totalOpeningBalance = 0, totalBalance = 0, countMonths = 0;

    for (let m = 1; m <= 12; m++) {
        const data = group.months[m];
        const debit = data?.totalDebit ?? 0;
        const credit = data?.totalCredit ?? 0;
        const openingBalance = data?.openingBalance ?? 0;
        const balance = data?.closingBalance ?? 0;

        if (data) { totalDebit += debit; totalCredit += credit; totalOpeningBalance += openingBalance; totalBalance += balance; countMonths++; }

        rows += `<tr>
            <td class="label">${months[m-1]}-${shortYear}</td>
            <td class="num editable" onclick="editCell(this)" data-field="debit" data-month="${m}">${data ? formatNum(debit) : ''}</td>
            <td class="num editable" onclick="editCell(this)" data-field="credit" data-month="${m}">${data ? formatNum(credit) : ''}</td>
            <td class="num editable" onclick="editCell(this)" data-field="openingBalance" data-month="${m}">${data ? formatNum(openingBalance) : ''}</td>
            <td class="num editable" onclick="editCell(this)" data-field="balance" data-month="${m}">${data ? formatNum(balance) : ''}</td>
            <td class="num"></td>
        </tr>`;
    }

    const avgD = countMonths > 0 ? totalDebit / countMonths : 0;
    const avgC = countMonths > 0 ? totalCredit / countMonths : 0;
    const avgOB = countMonths > 0 ? totalOpeningBalance / countMonths : 0;
    const avgB = countMonths > 0 ? totalBalance / countMonths : 0;

    container.innerHTML = `
        <div style="margin-bottom:16px;"><p style="font-size:12px;color:var(--gray-500);">
            <strong>No. Rekening:</strong> ${group.accountNo} &nbsp;|&nbsp;
            <strong>Nama:</strong> ${group.accountName} &nbsp;|&nbsp;
            <strong>Cabang:</strong> ${group.branch}
        </p></div>
        <table class="rekap-table">
            <thead><tr><th colspan="6" style="text-align:center;">MUTASI</th></tr>
            <tr><th class="bulan-header">BULAN</th><th>DEBET</th><th>KREDIT</th><th>SALDO AWAL</th><th>SALDO AKHIR</th><th>BUNGA</th></tr></thead>
            <tbody>${rows}
                <tr class="total-row"><td class="label"><strong>TOTAL</strong></td><td class="num">${formatNum(totalDebit)}</td><td class="num">${formatNum(totalCredit)}</td><td class="num">-</td><td class="num">-</td><td class="num">-</td></tr>
                <tr class="avg-row"><td class="label"><strong>RATA-RATA</strong></td><td class="num">${formatNum(avgD)}</td><td class="num">${formatNum(avgC)}</td><td class="num">${formatNum(avgOB)}</td><td class="num">${formatNum(avgB)}</td><td class="num"></td></tr>
            </tbody>
        </table>
        <p style="font-size:11px;color:var(--gray-400);margin-top:8px;">💡 Klik pada sel untuk mengedit nilai</p>
    `;
}

function renderRekapHarian(container, group) {
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const year = Object.values(group.months)[0]?.year || new Date().getFullYear();
    let html = `<div style="margin-bottom:16px;"><p style="font-size:12px;color:var(--gray-500);">
        <strong>No. Rekening:</strong> ${group.accountNo} &nbsp;|&nbsp;
        <strong>Nama:</strong> ${group.accountName} &nbsp;|&nbsp;
        <strong>Cabang:</strong> ${group.branch}
    </p></div>`;

    for (let m = 1; m <= 12; m++) {
        const data = group.months[m];
        const transactions = data?.transactions || [];
        html += `<div class="month-section"><h3>📅 ${months[m-1]} ${year}</h3>`;

        if (transactions.length === 0) {
            html += `<div style="padding:16px;border:1px solid var(--gray-200);border-top:none;border-radius:0 0 var(--radius) var(--radius);color:var(--gray-400);font-size:13px;">Tidak ada data</div>`;
        } else {
            let totalDebit = 0, totalCredit = 0;
            let rows = '';
            const openBal = data.openingBalance ?? 0;
            rows += `<tr><td class="label" style="font-weight:600;">Saldo Awal</td><td class="num"></td><td class="num"></td><td class="num">${formatNum(openBal)}</td></tr>`;

            const dailyData = {}, dateOrder = [];
            for (const txn of transactions) {
                if (txn.description === 'Saldo Awal' && txn.debit === 0 && txn.credit === 0) continue;
                const dateDisplay = txn.dateStr || (txn.date ? formatDate(txn.date) : '-');
                if (!dailyData[dateDisplay]) { dailyData[dateDisplay] = { dateDisplay, debit: 0, credit: 0, balance: 0 }; dateOrder.push(dateDisplay); }
                dailyData[dateDisplay].debit += (txn.debit || 0);
                dailyData[dateDisplay].credit += (txn.credit || 0);
                dailyData[dateDisplay].balance = txn.balance;
            }

            const aggregatedTxns = dateOrder.map(key => dailyData[key]);
            for (const txn of aggregatedTxns) {
                totalDebit += txn.debit;
                totalCredit += txn.credit;
                rows += `<tr>
                    <td class="label">${txn.dateDisplay}</td>
                    <td class="num editable" onclick="editCell(this)">${txn.debit > 0 ? formatNum(txn.debit) : ''}</td>
                    <td class="num editable" onclick="editCell(this)">${txn.credit > 0 ? formatNum(txn.credit) : ''}</td>
                    <td class="num">${formatNum(txn.balance)}</td>
                </tr>`;
            }

            const countDebit = aggregatedTxns.filter(t => t.debit > 0).length || 1;
            const countCredit = aggregatedTxns.filter(t => t.credit > 0).length || 1;

            html += `<table class="rekap-table" style="border-top:none;">
                <thead><tr><th class="bulan-header" style="width:140px;">TANGGAL</th><th>DEBET</th><th>KREDIT</th><th>SALDO</th></tr></thead>
                <tbody>${rows}
                    <tr class="total-row"><td class="label"><strong>TOTAL</strong></td><td class="num">${formatNum(totalDebit)}</td><td class="num">${formatNum(totalCredit)}</td><td class="num">-</td></tr>
                    <tr class="avg-row"><td class="label"><strong>RATA-RATA</strong></td><td class="num">${aggregatedTxns.length > 0 ? formatNum(totalDebit / countDebit) : ''}</td><td class="num">${aggregatedTxns.length > 0 ? formatNum(totalCredit / countCredit) : ''}</td><td class="num"></td></tr>
                </tbody></table>`;
        }
        html += '</div>';
    }
    container.innerHTML = html;
}

// ===================== CELL EDITING =====================
function editCell(td) {
    if (td.querySelector('input')) return;
    const currentValue = td.textContent.trim().replace(/,/g, '');
    const input = document.createElement('input');
    input.type = 'text';
    input.value = currentValue;
    td.textContent = '';
    td.appendChild(input);
    input.focus();
    input.select();

    const finishEdit = () => {
        const newValue = parseFloat(input.value.replace(/,/g, '')) || 0;
        td.textContent = formatNum(newValue);
        const month = td.dataset?.month;
        const field = td.dataset?.field;
        if (month && field) {
            const grouped = groupByAccount(parsedResults);
            const group = grouped[activePreviewTab];
            if (group?.months[month]) {
                if (field === 'debit') group.months[month].totalDebit = newValue;
                if (field === 'credit') group.months[month].totalCredit = newValue;
                if (field === 'balance') group.months[month].closingBalance = newValue;
            }
        }
    };
    input.addEventListener('blur', finishEdit);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finishEdit();
        else if (e.key === 'Escape') td.textContent = formatNum(parseFloat(currentValue) || 0);
    });
}

// ===================== EXCEL GENERATION =====================
async function downloadExcel() {
    const btn = document.getElementById('btnDownload');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span> Generating...';

    try {
        const workbook = new ExcelJS.Workbook();
        const grouped = groupByAccount(parsedResults);

        for (const group of grouped) {
            if (currentType === 'tahunan') generateRekapTahunanSheet(workbook, group);
            else generateRekapHarianSheet(workbook, group);
        }

        const buffer = await workbook.xlsx.writeBuffer();
        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const year = Object.values(grouped[0]?.months || {})[0]?.year || new Date().getFullYear();
        a.href = url;
        a.download = `Rekap_${bankNames[currentBank]}_${currentType === 'tahunan' ? 'Tahunan' : 'Harian'}_${year}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        console.error('Excel error:', err);
        alert('Error generating Excel: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<span>📥</span> Download Excel';
    }
}

function generateRekapTahunanSheet(workbook, group) {
    const year = Object.values(group.months)[0]?.year || new Date().getFullYear();
    const sheetName = (group.accountNo || 'Sheet1').substring(0, 31);
    const ws = workbook.addWorksheet(sheetName);

    ws.columns = [{ width: 4 }, { width: 14 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 4 }];

    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
    const borderThin = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    const boldFont = { name: 'Calibri', size: 11, bold: true };
    const normalFont = { name: 'Calibri', size: 11 };

    ws.getCell('B1').value = `BANK ${bankNames[currentBank].toUpperCase()}`;
    ws.getCell('B1').font = { ...boldFont, size: 12 };
    ws.getCell('B2').value = `KC ${group.branch || 'N/A'}`;
    ws.getCell('B2').font = boldFont;

    const meta = getMetaFields();
    ws.getCell('B4').value = meta.bankRK || bankNames[currentBank];
    ws.getCell('B4').font = boldFont;
    ws.getCell('B5').value = 'FORMULIR MUTASI REKENING';
    ws.getCell('B5').font = { ...boldFont, size: 12 };
    ws.getCell('B6').value = 'TAHUN';
    ws.getCell('B6').font = boldFont;
    ws.getCell('B7').value = year;
    ws.getCell('B7').font = boldFont;

    const infoLabels = [
        ['Nama Nasabah', group.accountName || ''],
        ['Nama Group', meta.namaGroup],
        ['Jenis Rekening', meta.jenisRek],
        ['Bank', meta.bankRK || bankNames[currentBank]],
        ['No. Rekening', group.accountNo || '']
    ];
    for (let i = 0; i < infoLabels.length; i++) {
        const row = 9 + i;
        ws.getCell(`B${row}`).value = i + 1; ws.getCell(`B${row}`).font = boldFont;
        ws.getCell(`C${row}`).value = infoLabels[i][0] + ' :'; ws.getCell(`C${row}`).font = boldFont;
        ws.getCell(`D${row}`).value = infoLabels[i][1]; ws.getCell(`D${row}`).font = normalFont;
    }

    ws.getCell('G14').value = '(Dalam Rupiah)';
    ws.getCell('G14').font = { ...normalFont, italic: true, size: 10 };
    ws.getCell('G14').alignment = { horizontal: 'right' };

    ws.mergeCells('D15:G15');
    ws.getCell('D15').value = 'MUTASI'; ws.getCell('D15').font = boldFont; ws.getCell('D15').alignment = { horizontal: 'center' }; ws.getCell('D15').fill = headerFill; ws.getCell('D15').border = borderThin;
    ws.mergeCells('B15:C15'); ws.getCell('B15').value = ''; ws.getCell('C15').value = 'BULAN'; ws.getCell('C15').font = boldFont; ws.getCell('C15').fill = headerFill; ws.getCell('C15').border = borderThin;

    ws.mergeCells('B16:C16'); ws.getCell('B16').value = 'BULAN'; ws.getCell('B16').font = boldFont; ws.getCell('B16').fill = headerFill; ws.getCell('B16').border = borderThin; ws.getCell('B16').alignment = { horizontal: 'center' };
    ['D', 'E', 'F', 'G', 'H'].forEach((col, idx) => {
        ws.getCell(`${col}16`).value = ['DEBET', 'KREDIT', 'SALDO AWAL', 'SALDO AKHIR', 'BUNGA'][idx];
        ws.getCell(`${col}16`).font = boldFont; ws.getCell(`${col}16`).fill = headerFill; ws.getCell(`${col}16`).border = borderThin; ws.getCell(`${col}16`).alignment = { horizontal: 'center' };
    });

    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const shortYear = String(year).slice(-2);
    let totalDebit = 0, totalCredit = 0, totalOpeningBalance = 0, totalBalance = 0, countMonths = 0;

    for (let m = 0; m < 12; m++) {
        const row = 17 + m;
        const data = group.months[m + 1];
        ws.mergeCells(`B${row}:C${row}`);
        ws.getCell(`B${row}`).value = `${monthNames[m]}-${shortYear}`; ws.getCell(`B${row}`).font = normalFont; ws.getCell(`B${row}`).alignment = { horizontal: 'right' }; ws.getCell(`B${row}`).border = borderThin;

        if (data) {
            const debit = data.totalDebit ?? 0, credit = data.totalCredit ?? 0, openBal = data.openingBalance ?? 0, balance = data.closingBalance ?? 0;
            totalDebit += debit; totalCredit += credit; totalOpeningBalance += openBal; totalBalance += balance; countMonths++;
            ws.getCell(`D${row}`).value = debit; ws.getCell(`E${row}`).value = credit; ws.getCell(`F${row}`).value = openBal; ws.getCell(`G${row}`).value = balance;
        }
        ['D', 'E', 'F', 'G', 'H'].forEach(col => { ws.getCell(`${col}${row}`).font = normalFont; ws.getCell(`${col}${row}`).border = borderThin; ws.getCell(`${col}${row}`).numFmt = '#,##0.00'; ws.getCell(`${col}${row}`).alignment = { horizontal: 'right' }; });
    }

    // TOTAL & RATA-RATA rows
    [29, 30].forEach(r => {
        ws.mergeCells(`B${r}:C${r}`);
        ws.getCell(`B${r}`).value = r === 29 ? 'TOTAL' : 'RATA-RATA'; ws.getCell(`B${r}`).font = boldFont; ws.getCell(`B${r}`).fill = headerFill; ws.getCell(`B${r}`).border = borderThin;
        if (r === 29) {
            ws.getCell(`D${r}`).value = totalDebit; ws.getCell(`E${r}`).value = totalCredit; ws.getCell(`F${r}`).value = '-'; ws.getCell(`G${r}`).value = '-'; ws.getCell(`H${r}`).value = '-';
        } else {
            ws.getCell(`D${r}`).value = countMonths > 0 ? totalDebit / countMonths : 0; ws.getCell(`E${r}`).value = countMonths > 0 ? totalCredit / countMonths : 0;
            ws.getCell(`F${r}`).value = countMonths > 0 ? totalOpeningBalance / countMonths : 0; ws.getCell(`G${r}`).value = countMonths > 0 ? totalBalance / countMonths : 0;
        }
        ['D', 'E', 'F', 'G', 'H'].forEach(col => { ws.getCell(`${col}${r}`).font = boldFont; ws.getCell(`${col}${r}`).fill = headerFill; ws.getCell(`${col}${r}`).border = borderThin; ws.getCell(`${col}${r}`).numFmt = '#,##0.00'; ws.getCell(`${col}${r}`).alignment = { horizontal: 'right' }; });
    });

    ws.getCell('B33').value = 'Dipersiapkan Oleh'; ws.getCell('B33').font = normalFont;
    ws.getCell('G33').value = 'Disetujui'; ws.getCell('G33').font = normalFont;
    ws.getCell('B37').value = meta.namaRM || 'Nama RM'; ws.getCell('B37').font = boldFont;
    ws.getCell('G37').value = 'Nama Analis'; ws.getCell('G37').font = boldFont;
    ws.getCell('B38').value = 'RM UKM Syariah'; ws.getCell('B38').font = boldFont;
    ws.getCell('G38').value = 'Analis Pembiayaan'; ws.getCell('G38').font = boldFont;
}

function generateRekapHarianSheet(workbook, group) {
    const year = Object.values(group.months)[0]?.year || new Date().getFullYear();
    const sheetName = (group.accountNo || 'Sheet1').substring(0, 31);
    const ws = workbook.addWorksheet(sheetName);

    const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD6E4F0' } };
    const borderThin = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } };
    const boldFont = { name: 'Calibri', size: 11, bold: true };
    const normalFont = { name: 'Calibri', size: 11 };

    ws.columns = [{ width: 4 }, { width: 16 }, { width: 14 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 4 }];

    ws.getCell('B1').value = `BANK ${bankNames[currentBank].toUpperCase()}`; ws.getCell('B1').font = { ...boldFont, size: 12 };
    ws.getCell('B2').value = `KC ${group.branch || 'N/A'}`; ws.getCell('B2').font = boldFont;
    const meta = getMetaFields();
    ws.getCell('B4').value = meta.bankRK || bankNames[currentBank]; ws.getCell('B4').font = boldFont;
    ws.getCell('B5').value = 'FORMULIR MUTASI REKENING'; ws.getCell('B5').font = { ...boldFont, size: 12 };
    ws.getCell('B6').value = 'TAHUN'; ws.getCell('B6').font = boldFont;
    ws.getCell('B7').value = year; ws.getCell('B7').font = boldFont;

    const infoLabels = [['Nama Nasabah', group.accountName || ''], ['Nama Group', meta.namaGroup], ['Jenis Rekening', meta.jenisRek], ['Bank', meta.bankRK || bankNames[currentBank]], ['No. Rekening', group.accountNo || '']];
    for (let i = 0; i < infoLabels.length; i++) {
        const row = 9 + i;
        ws.getCell(`A${row}`).value = i + 1; ws.getCell(`A${row}`).font = boldFont;
        ws.getCell(`B${row}`).value = infoLabels[i][0] + ' :'; ws.getCell(`B${row}`).font = boldFont;
        ws.getCell(`C${row}`).value = infoLabels[i][1]; ws.getCell(`C${row}`).font = normalFont;
    }

    let currentRow = 15;
    const monthNames = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

    for (let m = 1; m <= 12; m++) {
        const data = group.months[m];
        const transactions = data?.transactions || [];

        ws.mergeCells(`D${currentRow}:E${currentRow}`);
        ws.getCell(`D${currentRow}`).value = 'MUTASI'; ws.getCell(`D${currentRow}`).font = boldFont; ws.getCell(`D${currentRow}`).alignment = { horizontal: 'center' }; ws.getCell(`D${currentRow}`).fill = headerFill; ws.getCell(`D${currentRow}`).border = borderThin;
        ['B', 'C', 'F'].forEach(c => { ws.getCell(`${c}${currentRow}`).fill = headerFill; ws.getCell(`${c}${currentRow}`).border = borderThin; });
        currentRow++;

        ws.mergeCells(`B${currentRow}:C${currentRow}`);
        ws.getCell(`B${currentRow}`).value = 'BULAN'; ws.getCell(`B${currentRow}`).font = boldFont; ws.getCell(`B${currentRow}`).fill = headerFill; ws.getCell(`B${currentRow}`).border = borderThin; ws.getCell(`B${currentRow}`).alignment = { horizontal: 'center' };
        ['D', 'E', 'F'].forEach((col, idx) => {
            ws.getCell(`${col}${currentRow}`).value = ['DEBET', 'KREDIT', 'SALDO'][idx];
            ws.getCell(`${col}${currentRow}`).font = boldFont; ws.getCell(`${col}${currentRow}`).fill = headerFill; ws.getCell(`${col}${currentRow}`).border = borderThin; ws.getCell(`${col}${currentRow}`).alignment = { horizontal: 'center' };
        });
        currentRow++;

        ws.mergeCells(`B${currentRow}:C${currentRow}`);
        ws.getCell(`B${currentRow}`).value = 'Saldo Awal'; ws.getCell(`B${currentRow}`).font = { ...normalFont, bold: true }; ws.getCell(`B${currentRow}`).border = borderThin;
        ws.getCell(`D${currentRow}`).border = borderThin; ws.getCell(`E${currentRow}`).border = borderThin;
        ws.getCell(`F${currentRow}`).value = data?.openingBalance ?? 0; ws.getCell(`F${currentRow}`).font = normalFont; ws.getCell(`F${currentRow}`).numFmt = '#,##0.00'; ws.getCell(`F${currentRow}`).border = borderThin; ws.getCell(`F${currentRow}`).alignment = { horizontal: 'right' };
        currentRow++;

        let totalDebit = 0, totalCredit = 0;
        const dailyData = {}, dateOrder = [];
        for (const txn of transactions) {
            if (txn.description === 'Saldo Awal' && txn.debit === 0 && txn.credit === 0) continue;
            let dateDisplay = txn.dateStr || '';
            if (txn.date) { const d = new Date(txn.date); if (!isNaN(d.getTime())) dateDisplay = `${String(d.getDate()).padStart(2, '0')}-${monthNames[d.getMonth()].substring(0, 3)}-${String(d.getFullYear()).slice(-2)}`; }
            if (!dailyData[dateDisplay]) { dailyData[dateDisplay] = { dateDisplay, debit: 0, credit: 0, balance: 0 }; dateOrder.push(dateDisplay); }
            dailyData[dateDisplay].debit += (txn.debit || 0); dailyData[dateDisplay].credit += (txn.credit || 0); dailyData[dateDisplay].balance = txn.balance;
        }

        const aggregatedTxns = dateOrder.map(key => dailyData[key]);
        for (const txn of aggregatedTxns) {
            totalDebit += txn.debit; totalCredit += txn.credit;
            ws.mergeCells(`B${currentRow}:C${currentRow}`);
            ws.getCell(`B${currentRow}`).value = txn.dateDisplay; ws.getCell(`B${currentRow}`).font = normalFont; ws.getCell(`B${currentRow}`).alignment = { horizontal: 'right' }; ws.getCell(`B${currentRow}`).border = borderThin;
            if (txn.debit > 0) ws.getCell(`D${currentRow}`).value = txn.debit;
            if (txn.credit > 0) ws.getCell(`E${currentRow}`).value = txn.credit;
            ws.getCell(`F${currentRow}`).value = txn.balance;
            ['D', 'E', 'F'].forEach(col => { ws.getCell(`${col}${currentRow}`).font = normalFont; ws.getCell(`${col}${currentRow}`).numFmt = '#,##0.00'; ws.getCell(`${col}${currentRow}`).border = borderThin; ws.getCell(`${col}${currentRow}`).alignment = { horizontal: 'right' }; });
            currentRow++;
        }

        // TOTAL + RATA-RATA
        const countDebit = aggregatedTxns.filter(t => t.debit > 0).length || 1;
        const countCredit = aggregatedTxns.filter(t => t.credit > 0).length || 1;
        [['TOTAL', totalDebit, totalCredit, '-'], ['RATA-RATA', totalDebit / countDebit, totalCredit / countCredit, '']].forEach(([label, d, c, s]) => {
            ws.mergeCells(`B${currentRow}:C${currentRow}`);
            ws.getCell(`B${currentRow}`).value = label; ws.getCell(`B${currentRow}`).font = boldFont; ws.getCell(`B${currentRow}`).fill = headerFill; ws.getCell(`B${currentRow}`).border = borderThin;
            ws.getCell(`D${currentRow}`).value = d; ws.getCell(`E${currentRow}`).value = c; ws.getCell(`F${currentRow}`).value = s;
            ['D', 'E', 'F'].forEach(col => { ws.getCell(`${col}${currentRow}`).font = boldFont; ws.getCell(`${col}${currentRow}`).fill = headerFill; ws.getCell(`${col}${currentRow}`).border = borderThin; ws.getCell(`${col}${currentRow}`).numFmt = '#,##0.00'; ws.getCell(`${col}${currentRow}`).alignment = { horizontal: 'right' }; });
            currentRow++;
        });
        currentRow++; // gap
    }

    ws.getCell(`B${currentRow + 1}`).value = 'Dipersiapkan Oleh'; ws.getCell(`B${currentRow + 1}`).font = normalFont;
    ws.getCell(`E${currentRow + 1}`).value = 'Disetujui'; ws.getCell(`E${currentRow + 1}`).font = normalFont;
    ws.getCell(`B${currentRow + 5}`).value = meta.namaRM || 'Nama RM'; ws.getCell(`B${currentRow + 5}`).font = boldFont;
    ws.getCell(`E${currentRow + 5}`).value = 'Nama Analis'; ws.getCell(`E${currentRow + 5}`).font = boldFont;
    ws.getCell(`B${currentRow + 6}`).value = 'RM UKM Syariah'; ws.getCell(`B${currentRow + 6}`).font = boldFont;
    ws.getCell(`E${currentRow + 6}`).value = 'Analis Pembiayaan'; ws.getCell(`E${currentRow + 6}`).font = boldFont;
}

// ===================== UTILITIES =====================
function formatCurrency(num) { return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(num); }
function formatNum(num) { if (num == null) return ''; return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num); }
function formatDate(date) { if (!date) return '-'; const d = new Date(date); if (isNaN(d.getTime())) return '-'; return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; }

function resetApp() {
    parsedResults = []; selectedFiles = []; activePreviewTab = 0;
    document.getElementById('uploadSection').style.display = 'block';
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('progressSection').style.display = 'none';
    document.getElementById('fileList').style.display = 'none';
    document.getElementById('actionRow').style.display = 'none';
    document.getElementById('pdfPassword').value = '';
    const pb = document.getElementById('progressBar');
    pb.style.width = '0%'; pb.style.background = '';
}
