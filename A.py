from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
import yfinance as yf
import os
import pandas as pd
from fastapi.staticfiles import StaticFiles

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

@app.get("/stock/{symbol}")
async def get_stock(symbol: str, period: str = "3mo"):
    try:
        ticker = yf.Ticker(symbol)
        hist = ticker.history(period=period)
        
        if hist.empty:
            raise HTTPException(status_code=404, detail=f"ไม่พบข้อมูลหุ้น {symbol}")

        # 2. นำข้อมูลมาทำเป็น DataFrame เพื่อคำนวณ Indicators
        df = hist.copy()

   
        fi = ticker.fast_info
        news_data = []
        for n in ticker.news:
            news_data.append({
                "title": n.get("title"),
                "publisher": n.get("publisher"),
                "link": n.get("link"),
                "time": n.get("providerPublishTime") # เวลาเป็น timestamp
            })
        
        # 4. ส่งข้อมูลกลับ (จัดการค่า NaN ให้เป็น None เพื่อให้ JSON เข้าใจ)
        return {
            "news": news_data, # ส่งข่าวสารกลับไป
            "currentPrice": round(fi.last_price, 2),
            "previousClose": round(fi.previous_close, 2),
            "name": symbol,
            "dates": hist.index.strftime("%d %b").tolist(),
            "prices": [round(p, 2) for p in df["Close"].tolist()],
            "volumes": [int(v) for v in hist["Volume"].tolist()],
            "currentPrice": round(fi.last_price, 2),
            "previousClose": round(fi.previous_close, 2),
            "marketCap": fi.market_cap,
            "high52w": fi.year_high,
            "low52w": fi.year_low,
            "peRatio": ticker.info.get('trailingPE', None), # ลองดึง P/E จริงจาก info
            "avgVolume": fi.three_month_average_volume,
        }
    except Exception as e:
        print(f"Error logic: {e}") 
        raise HTTPException(status_code=500, detail=str(e))