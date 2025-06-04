
import { CryptoCurrency, PriceDataPoint } from '../types';

const COINGECKO_API_BASE = 'https://api.coingecko.com/api/v3';

export interface CoinGeckoSearchResult {
    id: string;
    name: string;
    symbol: string;
    // Potentially add 'thumb' for thumbnail image in suggestions
    thumb?: string; 
}

export class RateLimitError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RateLimitError";
    }
}

export const fetchCoinGeckoSuggestions = async (query: string): Promise<CoinGeckoSearchResult[]> => {
  if (!query.trim() || query.trim().length < 2) return []; // Minimum 2 chars for suggestions
  try {
    const response = await fetch(`${COINGECKO_API_BASE}/search?query=${encodeURIComponent(query)}`);
    if (!response.ok) {
      if (response.status === 429) {
        console.warn(`Rate limit hit fetching suggestions for "${query}"`);
        throw new RateLimitError(`RATE_LIMIT_SUGGESTIONS: Límite de peticiones API de CoinGecko alcanzado. Por favor, espera un momento y vuelve a intentarlo.`);
      }
      console.error(`Error fetching suggestions from CoinGecko for "${query}": ${response.statusText}`);
      return [];
    }
    const data = await response.json();
    if (data.coins && data.coins.length > 0) {
      return data.coins.slice(0, 7).map((coin: any) => ({ // Return top 7 suggestions
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol.toUpperCase(),
        thumb: coin.thumb,
      }));
    }
    return [];
  } catch (error) {
    if (error instanceof RateLimitError) throw error; // Re-throw specific error
    console.error(`Exception during CoinGecko suggestion fetch for "${query}":`, error);
    return [];
  }
};


export const searchCoinGecko = async (query: string): Promise<CoinGeckoSearchResult | null> => {
  if (!query.trim()) return null;
  try {
    const suggestions = await fetchCoinGeckoSuggestions(query); // This can throw RateLimitError
    if (suggestions.length > 0) {
        const exactSymbolMatch = suggestions.find(s => s.symbol.toLowerCase() === query.toLowerCase());
        if (exactSymbolMatch) return exactSymbolMatch;
        const exactNameMatch = suggestions.find(s => s.name.toLowerCase() === query.toLowerCase());
        if (exactNameMatch) return exactNameMatch;
        return suggestions[0];
    }
    return null;
  } catch (error) {
    if (error instanceof RateLimitError) throw error; // Re-throw specific error
    console.error(`Exception during CoinGecko search for "${query}":`, error);
    return null;
  }
};


export const fetchCryptoDataWithDetails = async (cryptoToUpdate: CryptoCurrency): Promise<CryptoCurrency> => {
  let successfullyUpdatedMarketData = false;
  const updatedData: CryptoCurrency = { 
    ...cryptoToUpdate, 
    priceHistory: cryptoToUpdate.priceHistory ? [...cryptoToUpdate.priceHistory] : [] 
  };

  try {
    const coinDataResponse = await fetch(`${COINGECKO_API_BASE}/coins/${cryptoToUpdate.id}?localization=false&tickers=false&market_data=true&community_data=false&developer_data=false&sparkline=false`);
    
    if (!coinDataResponse.ok) {
      if (coinDataResponse.status === 429) {
        const cryptoNameForError = cryptoToUpdate.name || cryptoToUpdate.id;
        console.warn(`Rate limit hit fetching main market data for ${cryptoNameForError}`);
        throw new RateLimitError(`RATE_LIMIT_DETAILS: Límite de peticiones API de CoinGecko alcanzado al obtener datos para ${cryptoNameForError}. Por favor, espera un momento.`);
      }
      console.error(`Error fetching main market data for ${cryptoToUpdate.name || cryptoToUpdate.id} from CoinGecko: ${coinDataResponse.statusText} (status: ${coinDataResponse.status})`);
      return cryptoToUpdate; // Return original data on non-rate-limit errors
    }
    
    const coinData = await coinDataResponse.json();
    const marketData = coinData.market_data;

    if (marketData && typeof marketData.current_price?.usd === 'number') {
        updatedData.currentPrice = marketData.current_price.usd;
        updatedData.priceChange24hPercent = marketData.price_change_percentage_24h ?? updatedData.priceChange24hPercent;
        updatedData.marketCap = marketData.market_cap?.usd ?? updatedData.marketCap;
        updatedData.volume24h = marketData.total_volume?.usd ?? updatedData.volume24h;
        successfullyUpdatedMarketData = true; 
    } else {
        console.error(`Market data or current_price.usd missing or invalid for ${cryptoToUpdate.name || cryptoToUpdate.id}. API Response:`, marketData);
        return cryptoToUpdate; // Return original if essential data is missing
    }

    // Reset price history before attempting to fetch new data
    updatedData.priceHistory = [];
    try {
        const historyResponse = await fetch(`${COINGECKO_API_BASE}/coins/${cryptoToUpdate.id}/market_chart?vs_currency=usd&days=30&interval=daily`);
        if (historyResponse.ok) {
          const historyData = await historyResponse.json();
          if (historyData.prices && historyData.prices.length > 0) {
            updatedData.priceHistory = historyData.prices.map((p: [number, number]) => ({
              timestamp: Math.floor(p[0] / 1000), 
              price: p[1],
            }));
          } else {
             // API returned OK but no prices, treat as history fetch failure for consistency
             console.warn(`Price history fetch for ${cryptoToUpdate.name || cryptoToUpdate.id} returned OK but no price data.`);
          }
        } else {
            if (historyResponse.status === 429) {
                 console.warn(`Rate limit hit fetching price history for ${cryptoToUpdate.name || cryptoToUpdate.id}. Main data may still be used if successfully fetched.`);
                 // Don't throw here, history is secondary, but priceHistory remains empty.
            } else {
                console.warn(`Error fetching price history for ${cryptoToUpdate.name || cryptoToUpdate.id}: ${historyResponse.statusText}. Main market data may still be used.`);
            }
        }
    } catch (historyError) {
        console.warn(`Exception fetching price history for ${cryptoToUpdate.name || cryptoToUpdate.id}:`, historyError);
    }
    
    if (successfullyUpdatedMarketData) {
      updatedData.lastUpdated = Date.now();
    }
    return updatedData;

  } catch (error) {
    if (error instanceof RateLimitError) throw error; // Re-throw specific error
    console.error(`Exception during fetchCryptoDataWithDetails for ${cryptoToUpdate.name || cryptoToUpdate.id}:`, error);
    return cryptoToUpdate; // Return original on other exceptions
  }
};
