// --- 1. ตัวแปร Global ---
let chartInstance = null;
const popularStocks = ["AMD", "NVDA", "MSFT", "AMZN", "GOOGL", "AAPL", "TSLA", "PTT.BK", "CPALL.BK"];
let watchlist = JSON.parse(localStorage.getItem('my_watchlist') || '["AAPL", "NVDA"]');

// รายการหุ้นแนะนำ (Featured) สำหรับแสดงฝั่งขวา
const featuredStocks = [
    { symbol: 'NVDA', tag: 'AI Leader' },
    { symbol: 'TSLA', tag: 'EV Tech' },
    { symbol: 'AAPL', tag: 'Big Tech' },
    { symbol: 'MSFT', tag: 'Cloud' },
    { symbol: 'BTC-USD', tag: 'Crypto' }
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
        // ดึงโลโก้จาก Clearbit (ถ้าเป็นหุ้นไทย .BK จะถูกตัดออกเพื่อให้หาเจอง่ายขึ้น)
        const cleanSymbol = stock.symbol.split('.')[0].toLowerCase();
        const logoUrl = `https://logo.clearbit.com/${cleanSymbol}.com`;
        const fallbackUrl = `https://ui-avatars.com/api/?name=${stock.symbol}&background=random&color=fff`;

        return `
            <div class="featured-item" onclick="quickLoad('${stock.symbol}')" style="display: flex; align-items: center; gap: 12px; padding: 10px; border: 1px solid var(--border-color); border-radius: 12px; margin-bottom: 8px; cursor: pointer;">
                <img src="${logoUrl}" 
                     onerror="this.src='${fallbackUrl}'" 
                     style="width: 30px; height: 30px; border-radius: 50%; background: white; object-fit: contain; border: 1px solid var(--border-color);" 
                     alt="${stock.symbol}">
                <div style="flex-grow: 1;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight: 600; font-size: 14px;">${stock.symbol}</span>
                        <span style="font-size: 10px; background: var(--accent-color); color: white; padding: 2px 6px; border-radius: 4px;">${stock.tag}</span>
                    </div>
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

    const symbol = symbolInput.value.trim().toUpperCase().replace(/[^A-Z0-9.]/g, "");
    const period = document.getElementById('period').value;
    
    btn.textContent = 'กำลังโหลด...';
    btn.disabled = true;
    errBox.style.display = 'none';

    try {
        const res = await fetch(`/stock/${symbol}?period=${period}`);
        if (!res.ok) throw new Error("ไม่สามารถดึงข้อมูลได้");
        
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        // อัปเดตตัวเลข Metrics
        document.getElementById('m-price').textContent = '$' + (data.currentPrice || 0).toFixed(2);
        const pct = ((data.currentPrice - data.previousClose) / data.previousClose * 100);
        const chEl = document.getElementById('m-change');
        chEl.textContent = (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%';
        chEl.className = 'card-value ' + (pct >= 0 ? 'up' : 'down');
        document.getElementById('m-cap').textContent = (data.marketCap / 1e12).toFixed(2) + 'T';
        document.getElementById('m-pe').textContent = data.peRatio ? data.peRatio.toFixed(1) + 'x' : '—';

        // วาดกราฟ
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
    const s = document.getElementById('symbol').value.trim().toUpperCase().replace(/[^A-Z0-9.]/g, "");
    if (s && !watchlist.includes(s)) { watchlist.push(s); saveWatch(); }
}
function removeFromWatchlist(s) { watchlist = watchlist.filter(i => i !== s); saveWatch(); }
function saveWatch() { localStorage.setItem('my_watchlist', JSON.stringify(watchlist)); renderWatchlist(); }

function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', document.body.classList.contains('dark-mode') ? 'dark' : 'light');
    loadStock();
}

// --- 5. เริ่มทำงานเมื่อหน้าโหลดเสร็จ ---
document.addEventListener('DOMContentLoaded', () => {
    if(localStorage.getItem('theme') === 'dark') document.body.classList.add('dark-mode');
    setupAutoComplete();
    renderWatchlist();
    renderFeatured(); // เรียกแสดงหุ้นแนะนำพร้อมรูป
    loadStock();
    document.getElementById('symbol').addEventListener('keydown', e => { if (e.key === 'Enter') loadStock(); });
});