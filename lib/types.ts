export interface StockData {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changeRate: number;
  volume: string;
  tradingValue: string;
  marketCap: string;
  market: string;
  high52w?: number;
  low52w?: number;
  prevClose?: number;
}

export interface ChartPoint {
  date: string;
  price: number;
  open?: number;
  high?: number;
  low?: number;
  volume?: number;
}

export interface MarketIndex {
  name: string;
  value: number;
  change: number;
  changeRate: number;
  status: string;
}

export interface SearchResult {
  ticker: string;
  name: string;
  market: string;
  type?: string;
}

export interface WatchlistItem {
  ticker: string;
  name: string;
  market: string;
}

export interface PortfolioEntry {
  quantity: number;
  avgPrice: number;
}

export interface AlertEntry {
  above?: number;
  below?: number;
}

export interface OverseasStockData {
  symbol: string;
  name: string;
  price: number;        // USD
  change: number;       // USD
  changeRate: number;   // %
  volume: number;       // shares
  marketCap: number;    // USD raw
  exchange: string;     // 'NasdaqGS' | 'NYSE' …
  currency: string;
  prevClose?: number;
  high52w?: number;
  low52w?: number;
}

export interface OverseasWatchlistItem {
  symbol: string;
  name: string;
  exchange: string;
}

export interface FxRate {
  value: number;   // KRW per 1 unit (JPY: per 100엔)
  change: number;  // daily change in KRW
  changeRate: number; // daily change %
}

export interface NewsItem {
  title: string;
  link: string;
  pubDate?: string;
  summary?: string;
  source: string;
  category: 'domestic' | 'international';
}
