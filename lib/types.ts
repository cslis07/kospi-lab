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
  type: string;
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

export interface NewsItem {
  title: string;
  link: string;
  pubDate?: string;
  summary?: string;
  source: string;
  category: 'domestic' | 'international';
}
