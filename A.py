from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
import yfinance as yf
import os
import pandas as pd
import io

app = FastAPI()

# ตรวจสอบว่ามีโฟลเดอร์ static ไหมก่อน mount เพื่อกัน error
if not os.path.exists("static"):
    os.makedirs("static")
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def index():
    if not os.path.exists('index.html'):
        return {"error": "หาไฟล์ index.html ไม่เจอ กรุณาตรวจสอบชื่อไฟล์"}
    return FileResponse('index.html')


# --- ENDPOINT 1: สำหรับดึงข้อมูลไปวาดกราฟและข่าวบนหน้าเว็บ (JSON) ---
@app.get("/stock/{symbol}")
async def get_stock(symbol: str, period: str = "3mo"):
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period)
        
        if hist.empty:
            raise HTTPException(status_code=404, detail=f"ไม่พบข้อมูลหุ้น {symbol}")

        df = hist.copy()
        fi = ticker.fast_info
        
        # ดึงข้อมูลข่าวสาร
        news_data = []
        try:
            if ticker.news:
                for n in ticker.news:
                    news_data.append({
                        "title": n.get("title"),
                        "publisher": n.get("publisher"),
                        "link": n.get("link"),
                        "time": n.get("providerPublishTime")
                    })
        except Exception:
            pass # กันระบบล่มถ้าข่าวของหุ้นบางตัวดึงไม่ได้

        # ส่งข้อมูลกลับให้ JavaScript นำไปคำนวณ Metrics ทั้ง 8 กล่อง และวาดกราฟ
        return {
            "news": news_data,
            "name": symbol,
            "dates": hist.index.strftime("%d %b").tolist(),
            "prices": [round(p, 2) for p in df["Close"].tolist()],
            "volumes": [int(v) for v in hist["Volume"].tolist()],
            "currentPrice": round(fi.last_price, 2) if fi.last_price else 0.0,
            "previousClose": round(fi.previous_close, 2) if fi.previous_close else 0.0,
            "marketCap": fi.market_cap if fi.market_cap else 0,
            "high52w": fi.year_high if fi.year_high else 0.0,
            "low52w": fi.year_low if fi.year_low else 0.0,
            "peRatio": ticker.info.get('trailingPE', None), 
            "avgVolume": fi.three_month_average_volume if fi.three_month_average_volume else 0,
        }
    except Exception as e:
        print(f"Error logic in JSON endpoint: {e}") 
        raise HTTPException(status_code=500, detail=str(e))


# --- ENDPOINT 2: สำหรับดาวน์โหลดไฟล์ CSV ไปเข้า Power BI ---
@app.get("/stock/{symbol}/download")
async def download_stock_csv(symbol: str, period: str = "3mo"):
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period)
        
        if hist.empty:
            raise HTTPException(status_code=404, detail=f"ไม่พบข้อมูลหุ้น {symbol}")
            
        df = hist.copy()
        
        # คำนวณค่าเทคนิคใส่เข้าไปในไฟล์ CSV
        df['SMA20'] = df['Close'].rolling(window=20).mean()
        
        delta = df['Close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        
        # ดักจับการหารด้วยศูนย์ (Division by Zero) ในระบบคำนวณ RSI
        loss = loss.replace(0, 0.00001)
        rs = gain / loss
        df['RSI'] = 100 - (100 / (1 + rs))
        
        # จัดรูปแบบตารางแปลงดัชนีวันที่มาเป็นคอลมนิ์
        df.index = df.index.strftime('%Y-%m-%d')
        df.index.name = 'Date'
        df = df.reset_index()
        
        # เลือกคอลัมน์สำคัญส่งให้ Power BI
        columns_to_keep = ['Date', 'Open', 'High', 'Low', 'Close', 'Volume', 'SMA20', 'RSI']
        df_final = df[columns_to_keep]
        
        # แปลง DataFrame เป็น CSV String ใน Memory
        stream = io.StringIO()
        df_final.to_csv(stream, index=False)
        
        response = StreamingResponse(iter([stream.getvalue()]), media_type="text/csv")
        response.headers["Content-Disposition"] = f"attachment; filename={symbol}_data.csv"
        return response

    except Exception as e:
        print(f"Error logic in CSV endpoint: {e}") 
        raise HTTPException(status_code=500, detail=str(e))