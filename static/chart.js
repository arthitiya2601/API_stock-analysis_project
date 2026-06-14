// --- 1. ตัวแปร Global ---
let chartInstance = null;
const popularStocks = ["AMD", "NVDA", "MSFT", "AMZN", "GOOGL", "AAPL", "TSLA", "PTT.BK", "CPALL.BK"];
let watchlist = JSON.parse(localStorage.getItem('my_watchlist') || '["AAPL", "NVDA"]');

// รายการหุ้นแนะนำ (Featured) สำหรับแสดงฝั่งขวา
const featuredStocks = [
    { symbol: 'NVDA', tag: 'AI Leader', domain: 'nvidia.com' },
    { symbol: 'TSLA', tag: 'EV Tech', domain: 'tesla.com' },
    { symbol: 'AAPL', tag: 'Big Tech', domain: 'apple.com' },
    { symbol: 'MSFT', tag: 'Cloud Computing', domain: 'microsoft.com' },
    { symbol: 'GOOGL', tag: 'Search Engine', domain: 'google.com' },
    { symbol: 'BTC', tag: 'Crypto', domain: 'bitcoin.org' }
];

// --- 2. ฟังก์ชันเตรียมการ (Setup) ---
function setupAutoComplete() {
    const dl = document.getElementById('stock-list');
    if (dl) dl.innerHTML = popularStocks.map(s => `<option value="${s}">`).join('');
}

function renderWatchlist() {
    const container = document.getElementById('watchlist-items');
    if (!container) return;
    container.innerHTML = watchlist.map(s => `
        <div class="watch-item">
            <span onclick="quickLoad('${s}')">${s}</span>
            <span class="remove-btn" onclick="removeFromWatchlist('${s}')">×</span>
        </div>
    `).join('');
}

// ฟังก์ชันแสดงรายการหุ้นแนะนำพร้อมโลโก้
function renderFeatured() {
    const list = document.getElementById('featured-list');
    if (!list) return;

    list.innerHTML = featuredStocks.map(stock => {
        const logoUrl = `https://logo.clearbit.com/${stock.domain}`;
        const fallbackUrl = `https://ui-avatars.com/api/?name=${stock.symbol}&background=random&color=fff`;

        return `
            <div class="featured-item" onclick="quickLoad('${stock.symbol}')">
                <img src="${logoUrl}" class="featured-logo" onerror="this.src='${fallbackUrl}'">
                <div>
                    <span class="featured-name">${stock.symbol}</span>
                    <span class="featured-tag">${stock.tag}</span>
                </div>
            </div>
        `;
    }).join('');
}

// --- 3. ฟังก์ชันหลักในการดึงข้อมูล ---
async function loadStock() {
    const symbolInput = document.getElementById('symbol');
    const btn = document.getElementById('btn-analyze');
    const newsList = document.getElementById('news-list');
    const errBox = document.getElementById('error');
    const ctxMain = document.getElementById('chart-main');

    if (!symbolInput || !newsList || !ctxMain) return;

    let symbol = symbolInput.value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
    
    // Auto-Fix: แปลงการพิมพ์ BTC เป็น BTC-USD อัตโนมัติเพื่อป้องกัน Error หลังบ้าน
    if (symbol === "BTC") {
        symbol = "BTC-USD";
        symbolInput.value = "BTC-USD";
    }
    
    const period = document.getElementById('period').value;
    
    btn.textContent = 'กำลังโหลด...';
    btn.disabled = true;
    errBox.style.display = 'none';

    try {
        const res = await fetch(`/stock/${symbol}?period=${period}`);
        if (!res.ok) throw new Error("ไม่สามารถดึงข้อมูลได้");
        
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // อัปเดตตัวเลข Metrics แถวแรก
        document.getElementById('m-price').textContent = '$' + (data.currentPrice || 0).toFixed(2);
        const pct = ((data.currentPrice - data.previousClose) / data.previousClose * 100);
        const chEl = document.getElementById('m-change');
        chEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
        chEl.className = 'card-value ' + (pct >= 0 ? 'up' : 'down');
        document.getElementById('m-cap').textContent = (data.marketCap / 1e12).toFixed(2) + 'T';
        document.getElementById('m-high').textContent = '$' + (data.high52w || 0).toFixed(2);
        document.getElementById('m-low').textContent = '$' + (data.low52w || 0).toFixed(2);

        // ==========================================
        // คำนวณค่าที่เพิ่มใหม่ 4 รายการ (ย้ายเข้ามาอยู่ในจุดที่เหมาะสม)
        // ==========================================
        if (data.prices && data.prices.length > 0) {
            const prices = data.prices;
            const currentPrice = prices[prices.length - 1];

            // 1. คำนวณผลตอบแทนใน 1 ปี (1Y Return)
            const price1YAgo = prices[0]; 
            const return1Y = ((currentPrice - price1YAgo) / price1YAgo) * 100;
            const retEl = document.getElementById('m-return-1y');
            if (retEl) {
                retEl.textContent = (return1Y >= 0 ? '+' : '') + return1Y.toFixed(2) + '%';
                retEl.className = 'card-value ' + (return1Y >= 0 ? 'up' : 'down');
            }

            // 2. คำนวณ Volatility
            const returns = [];
            for(let i = 1; i < prices.length; i++) {
                returns.push((prices[i] - prices[i-1]) / prices[i-1]);
            }
            const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
            const variance = returns.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / returns.length;
            const dailyVolatility = Math.sqrt(variance);
            const annualizedVolatility = dailyVolatility * Math.sqrt(252) * 100; 
            const volEl = document.getElementById('m-volatility');
            if (volEl) volEl.textContent = annualizedVolatility.toFixed(2) + '%';

            // 3. ประเมิน Risk Level
            const riskEl = document.getElementById('m-risk');
            if (riskEl) {
                if (annualizedVolatility < 20) {
                    riskEl.textContent = 'ต่ำ (Low)';
                    riskEl.className = 'card-value risk-low';
                } else if (annualizedVolatility >= 20 && annualizedVolatility <= 40) {
                    riskEl.textContent = 'กลาง (Medium)';
                    riskEl.className = 'card-value risk-med';
                } else {
                    riskEl.textContent = 'สูง (High)';
                    riskEl.className = 'card-value risk-high';
                }
            }

            // 4. ประเมิน Trend
            const avgPrice = prices.reduce((a, b) => a + b, 0) / prices.length;
            const trendEl = document.getElementById('m-trend');
            if (trendEl) {
                if (currentPrice > avgPrice * 1.02) {
                    trendEl.textContent = '▲ ขาขึ้น (Bullish)';
                    trendEl.className = 'card-value trend-up';
                } else if (currentPrice < avgPrice * 0.98) {
                    trendEl.textContent = '▼ ขาลง (Bearish)';
                    trendEl.className = 'card-value trend-down';
                } else {
                    trendEl.textContent = '◀▶ Sideways';
                    trendEl.className = 'card-value trend-sideways';
                }
            }
        }

        // วาดกราฟหลัก
        if (chartInstance) chartInstance.destroy();
        const isDark = document.body.classList.contains('dark-mode');
        const ctx = ctxMain.getContext('2d');
        const grad = ctx.createLinearGradient(0, 0, 0, 350);
        grad.addColorStop(0, isDark ? 'rgba(0, 212, 255, 0.3)' : 'rgba(24, 119, 242, 0.2)');
        grad.addColorStop(1, 'transparent');

        chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.dates,
                datasets: [{
                    label: symbol,
                    data: data.prices,
                    borderColor: isDark ? '#00d4ff' : '#1877f2',
                    borderWidth: 3,
                    fill: true,
                    backgroundColor: grad,
                    tension: 0.35,
                    pointRadius: 0
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    x: { grid: { display: false }, ticks: { color: isDark ? '#848e9c' : '#888', maxTicksLimit: 7 } },
                    y: { position: 'right', grid: { color: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)' }, ticks: { color: isDark ? '#848e9c' : '#888' } }
                }
            }
        });

        // แสดงข่าว
        newsList.innerHTML = (data.news && data.news.length > 0) ? 
            data.news.map(n => `
                <div class="news-card" style="padding: 10px; border-bottom: 1px solid var(--border-color);">
                    <a href="${n.link}" target="_blank" style="font-weight: 600; text-decoration: none; color: var(--accent-color); font-size: 14px; display: block;">${n.title}</a>
                    <div style="font-size: 11px; color: #888; margin-top: 5px;">${n.publisher} • ${new Date(n.time * 1000).toLocaleDateString('th-TH')}</div>
                </div>
            `).join('') : '<p style="text-align:center; font-size: 12px; color: #888;">ไม่พบข่าวสาร</p>';

    } catch (e) {
        errBox.textContent = e.message;
        errBox.style.display = 'block';
    } finally {
        btn.textContent = 'วิเคราะห์';
        btn.disabled = false;
    }
}

// --- 4. ฟังก์ชันเสริมอื่นๆ ---
function quickLoad(s) { document.getElementById('symbol').value = s; loadStock(); }
function addToWatchlist() {
    const s = document.getElementById('symbol').value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
    if (s && !watchlist.includes(s)) { watchlist.push(s); saveWatch(); }
}
function removeFromWatchlist(s) { watchlist = watchlist.filter(i => i !== s); saveWatch(); }
function saveWatch() { localStorage.setItem('my_watchlist', JSON.stringify(watchlist)); renderWatchlist(); }

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    loadStock();
}

// ฟังก์ชันสั่งดาวน์โหลดข้อมูลหุ้นเป็นไฟล์ CSV
function downloadCSV() {
    const symbolInput = document.getElementById('symbol');
    if (!symbolInput) return;

    let symbol = symbolInput.value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "");
    
    // ดักจับแปลงค่ากรณีเป็นบิตคอยน์
    if (symbol === "BTC") {
        symbol = "BTC-USD";
    }
    
    const period = document.getElementById('period').value;
    const downloadUrl = `/stock/${symbol}/download?period=${period}`;
    window.location.href = downloadUrl;
}

// --- 5. เริ่มทำงานเมื่อหน้าโหลดเสร็จ ---
document.addEventListener('DOMContentLoaded', () => {
    if(localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');
    setupAutoComplete();
    renderWatchlist();
    renderFeatured(); 
    loadStock();
    document.getElementById('symbol').addEventListener('keydown', e => { if (e.key === 'Enter') loadStock(); });
});