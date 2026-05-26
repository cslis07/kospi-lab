const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Referer': 'https://finance.naver.com',
  'Accept': 'application/json',
};

export async function fetchStockBasic(ticker: string) {
  const res = await fetch(
    `https://m.stock.naver.com/api/stock/${ticker}/basic`,
    { headers: HEADERS, next: { revalidate: 0 } }
  );
  if (!res.ok) throw new Error(`Stock fetch failed: ${ticker}`);
  return res.json();
}

export async function fetchMarketIndex(market: string) {
  const res = await fetch(
    `https://m.stock.naver.com/api/index/${market}/basic`,
    { headers: HEADERS, next: { revalidate: 0 } }
  );
  if (!res.ok) throw new Error(`Index fetch failed: ${market}`);
  return res.json();
}

export async function searchStocks(query: string) {
  const url = `https://ac.finance.naver.com/ac?q=${encodeURIComponent(query)}&q_enc=UTF-8&st=0&r_format=json&t_period=D&r_count=10&v=2`;
  const res = await fetch(url, { headers: HEADERS, next: { revalidate: 0 } });
  if (!res.ok) throw new Error('Search failed');
  return res.json();
}
