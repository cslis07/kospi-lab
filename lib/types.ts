export interface StockData {
  ticker: string;
  name: string;
  price: number;
  change: number;
  changeRate: number;
  volume: string;
  marketCap: string;
  market: string;
  high52w?: number;
  low52w?: number;
  prevClose?: number;
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
