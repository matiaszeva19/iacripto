
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { CryptoCurrency, Advice, AdviceType, CryptoAlert, AlertConditionType } from './types';
// AVAILABLE_CRYPTOS is not used for initial selection anymore.
import AdviceCard from './components/AdviceCard';

import TradingViewWidget from './components/TradingViewWidget';
import SetAlertModal from './components/SetAlertModal';
import ShareAppModal from './components/ShareAppModal'; // Import ShareAppModal
import { getInvestmentAdvice } from './services/geminiService';
import { fetchCryptoDataWithDetails, searchCoinGecko, fetchCoinGeckoSuggestions, CoinGeckoSearchResult, RateLimitError } from './services/cryptoService';
import { SparklesIcon, InformationCircleIcon, BellIcon, XCircleIcon, TrashIcon, PlusCircleIcon, ShareIcon } from './components/icons'; // Import ShareIcon

// Simple Debounce Hook
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

const App: React.FC = () => {
  const [selectedCryptoIds, setSelectedCryptoIds] = useState<string[]>([]);
  const [cryptoData, setCryptoData] = useState<Record<string, CryptoCurrency>>({});
  const [advices, setAdvices] = useState<Advice[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<Record<string, boolean>>({});
  const [isLoadingAdvice, setIsLoadingAdvice] = useState<Record<string, boolean>>({});
  const [isAIServiceAvailable, setIsAIServiceAvailable] = useState<boolean>(!!process.env.API_KEY);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const debouncedSearchQuery = useDebounce(searchQuery, 700);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isLoadingSuggestions, setIsLoadingSuggestions] = useState<boolean>(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<CoinGeckoSearchResult[]>([]);
  const [showSuggestions, setShowSuggestions] = useState<boolean>(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // --- Alertas State ---
  const [alerts, setAlerts] = useState<CryptoAlert[]>([]);
  const [showSetAlertModalFor, setShowSetAlertModalFor] = useState<CryptoCurrency | null>(null);
  const [triggeredAlertsQueue, setTriggeredAlertsQueue] = useState<CryptoAlert[]>([]);
  const ALERTS_STORAGE_KEY = 'cryptoAdvisorAlerts';

  // --- Rate Limit Cooldown State ---
  const [isGloballyRateLimited, setIsGloballyRateLimited] = useState<boolean>(false);
  const [rateLimitCooldownEndTimestamp, setRateLimitCooldownEndTimestamp] = useState<number | null>(null);
  const [cooldownTimerDisplay, setCooldownTimerDisplay] = useState<string>('');
  const RATE_LIMIT_COOLDOWN_DURATION = 90 * 1000; // 90 seconds

  // --- Share Modal State ---
  const [showShareModal, setShowShareModal] = useState<boolean>(false);
  const [appUrl, setAppUrl] = useState('');

  useEffect(() => {
    // Set App URL once on component mount
    setAppUrl(window.location.href);
  }, []);


  const activateRateLimitCooldown = (errorMessage?: string) => {
    setIsGloballyRateLimited(true);
    const cooldownEnd = Date.now() + RATE_LIMIT_COOLDOWN_DURATION;
    setRateLimitCooldownEndTimestamp(cooldownEnd);
    const specificError = errorMessage || "Límite de peticiones API de CoinGecko alcanzado.";
    setGlobalError(`${specificError} La aplicación pausará las solicitudes a CoinGecko por un momento.`);
  };

  useEffect(() => {
    let intervalId: number | undefined;
    if (isGloballyRateLimited && rateLimitCooldownEndTimestamp) {
      intervalId = window.setInterval(() => {
        const timeLeft = Math.max(0, Math.ceil((rateLimitCooldownEndTimestamp - Date.now()) / 1000));
        setCooldownTimerDisplay(`Reintentando en ${timeLeft}s...`);
        if (timeLeft === 0) {
          setIsGloballyRateLimited(false);
          setRateLimitCooldownEndTimestamp(null);
          setCooldownTimerDisplay('');
          setGlobalError(null); // Clear global error once cooldown ends
          setSearchError(null); // Also clear search specific errors
        }
      }, 1000);
    } else {
        setCooldownTimerDisplay(''); // Clear if not rate limited
    }
    return () => {
      if (intervalId !== undefined) {
        window.clearInterval(intervalId);
      }
    };
  }, [isGloballyRateLimited, rateLimitCooldownEndTimestamp]);


  useEffect(() => {
    if (!process.env.API_KEY) {
      setGlobalError("La clave API de Gemini (API_KEY) no está configurada. Las funciones de IA están deshabilitadas. Los datos de mercado y alertas se mostrarán si busca una criptomoneda.");
      setIsAIServiceAvailable(false);
    } else {
      setIsAIServiceAvailable(true);
    }
    const storedAlerts = localStorage.getItem(ALERTS_STORAGE_KEY);
    if (storedAlerts) {
      try {
        setAlerts(JSON.parse(storedAlerts));
      } catch (e) {
        console.error("Error al cargar alertas de localStorage:", e);
        localStorage.removeItem(ALERTS_STORAGE_KEY);
      }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
  }, [alerts]);

  useEffect(() => {
    if (debouncedSearchQuery.trim().length > 1 && !isGloballyRateLimited) {
      setIsLoadingSuggestions(true);
      setShowSuggestions(true);
      setSearchError(null);
      fetchCoinGeckoSuggestions(debouncedSearchQuery)
        .then(results => {
          setSuggestions(results);
        })
        .catch(error => {
          if (error instanceof RateLimitError) {
            activateRateLimitCooldown(error.message.split(': ')[1]);
          } else {
            setSearchError("Error al cargar sugerencias.");
          }
          setSuggestions([]);
        })
        .finally(() => {
          setIsLoadingSuggestions(false);
        });
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsLoadingSuggestions(false);
      if (isGloballyRateLimited && debouncedSearchQuery.trim().length > 1) {
        setSearchError("Funcionalidad de sugerencias pausada debido al límite de peticiones.");
      }
    }
  }, [debouncedSearchQuery, isGloballyRateLimited, activateRateLimitCooldown]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [searchContainerRef]);

  const formatPrice = (price: number, symbol?: string): string => {
    if (!price && price !==0) return 'N/A';
    if (price < 0.000001 && price !== 0) return price.toFixed(8);
    if (price < 0.001 && price !== 0) return price.toFixed(6);
    if (symbol?.toUpperCase() === 'DOGE' || symbol?.toUpperCase() === 'ADA' || price < 1) return price.toFixed(4);
    return price.toFixed(2);
  };

  const checkAndTriggerAlerts = useCallback((updatedCrypto: CryptoCurrency) => {
    if (!updatedCrypto || typeof updatedCrypto.currentPrice !== 'number') return;
    const activeAlertsForCrypto = alerts.filter(alert => alert.cryptoId === updatedCrypto.id && alert.isActive);
    activeAlertsForCrypto.forEach(alert => {
      let triggered = false;
      if (alert.condition === AlertConditionType.PRICE_DROPS_TO && updatedCrypto.currentPrice <= alert.targetPrice) {
        triggered = true;
      } else if (alert.condition === AlertConditionType.PRICE_RISES_TO && updatedCrypto.currentPrice >= alert.targetPrice) {
        triggered = true;
      }
      if (triggered) {
        setAlerts(prevAlerts =>
          prevAlerts.map(a => a.id === alert.id ? { ...a, isActive: false, triggeredAt: Date.now() } : a)
        );
        setTriggeredAlertsQueue(prevQueue => {
            const newTriggeredAlert = { ...alert, isActive: false, triggeredAt: Date.now() };
            if (prevQueue.find(q => q.id === newTriggeredAlert.id)) return prevQueue;
            return [newTriggeredAlert, ...prevQueue].slice(0, 5);
        });
      }
    });
  }, [alerts]);

  const updateCryptoData = useCallback(async (id: string, initialSymbol?: string, initialName?: string): Promise<CryptoCurrency | null> => {
    if (isGloballyRateLimited) {
      console.warn("UpdateCryptoData skipped due to global rate limit.");
      setGlobalError("Actualización de datos pausada debido al límite de peticiones API.");
      return cryptoData[id] || null; // Return existing if available
    }
    setIsLoadingData(prev => ({ ...prev, [id]: true }));
    const baseCrypto: CryptoCurrency = cryptoData[id] || {
        id, name: initialName || id, symbol: initialSymbol || id.toUpperCase(),
        tradingViewSymbol: `${(initialSymbol || id).toUpperCase()}USD`,
        currentPrice: 0, priceChange24hPercent: 0, priceHistory: [],
        volume24h: 0, marketCap: 0
    };
    try {
        const updatedCrypto = await fetchCryptoDataWithDetails(baseCrypto);
        if (updatedCrypto.lastUpdated) {
            setCryptoData(prev => ({ ...prev, [id]: updatedCrypto }));
            checkAndTriggerAlerts(updatedCrypto);
            return updatedCrypto;
        } else {
            setCryptoData(prev => ({ ...prev, [id]: { ...baseCrypto, name: updatedCrypto.name, symbol: updatedCrypto.symbol } }));
            return null;
        }
    } catch (error) {
        if (error instanceof RateLimitError) {
            activateRateLimitCooldown(error.message.split(': ')[1]);
        }
        throw error;
    } finally {
        setIsLoadingData(prev => ({ ...prev, [id]: false }));
    }
  }, [cryptoData, checkAndTriggerAlerts, isGloballyRateLimited, activateRateLimitCooldown]);

  const fetchAdviceForCrypto = useCallback(async (crypto: CryptoCurrency, isManualRequest: boolean = false) => {
    if (!isAIServiceAvailable) {
        const newAdviceInfo: Advice = {
            id: crypto.id + Date.now() + "_aiservice_unavailable", crypto,
            type: AdviceType.INFO,
            message: "El Asesor IA está deshabilitado ya que la clave API no está configurada.",
            detailedMessage: "Por favor, asegúrate de que la variable de entorno API_KEY esté correctamente configurada para habilitar las funciones de análisis con IA.",
            timestamp: new Date(),
        };
        setAdvices([newAdviceInfo]);
        return;
    }
    if (!crypto.lastUpdated || !crypto.priceHistory || crypto.priceHistory.length === 0) {
        const noDataAdvice: Advice = {
            id: crypto.id + Date.now() + "_nodata", crypto,
            type: AdviceType.INFO,
            message: `No hay suficientes datos de mercado o históricos actualizados para ${crypto.name} para generar un consejo. Intenta de nuevo en unos momentos.`,
            timestamp: new Date(),
        };
        setAdvices([noDataAdvice]);
        return;
    }
    setIsLoadingAdvice(prev => ({ ...prev, [crypto.id]: true }));
    const adviceResult = await getInvestmentAdvice(crypto);
    if (adviceResult) {
      const newAdvice: Advice = {
        id: crypto.id + Date.now() + (adviceResult.rawGeminiResponse || Math.random().toString()),
        crypto, type: adviceResult.adviceType, message: adviceResult.adviceText,
        detailedMessage: adviceResult.detailedMessage, 
        timestamp: new Date(), rawGeminiResponse: adviceResult.rawGeminiResponse
      };
      setAdvices([newAdvice]);
    }
    setIsLoadingAdvice(prev => ({ ...prev, [crypto.id]: false }));
  }, [isAIServiceAvailable]);

  useEffect(() => {
    const dataUpdateInterval = 7 * 60 * 1000; 
    const adviceCheckInterval = 2 * 60 * 60 * 1000; 

    const dataIntervalId = window.setInterval(() => {
      if (isGloballyRateLimited) {
        console.log("Global rate limit active, skipping periodic data update cycle.");
        return;
      }
      selectedCryptoIds.forEach(id => {
        if (cryptoData[id] && !isLoadingData[id]) {
            updateCryptoData(id, cryptoData[id].symbol, cryptoData[id].name)
                .catch(error => { 
                    console.warn(`Error actualizando datos periódicamente para ${id}: ${error.message}`);
                    if (!(error instanceof RateLimitError)){
                       setGlobalError(`Error actualizando datos para ${cryptoData[id]?.name || id}.`);
                    }
                });
        }
      });
    }, dataUpdateInterval);

    const adviceIntervalId = window.setInterval(() => {
        selectedCryptoIds.forEach(id => {
            const currentCrypto = cryptoData[id];
            if (currentCrypto && !isLoadingAdvice[id] && isAIServiceAvailable && currentCrypto.lastUpdated) {
                const lastAdviceForCrypto = advices.find(a => a.crypto.id === id);
                let shouldFetchNewAdvice = !lastAdviceForCrypto;
                if (lastAdviceForCrypto && lastAdviceForCrypto.crypto) {
                    const priceAtLastAdvice = lastAdviceForCrypto.crypto.currentPrice;
                    const currentPriceVal = currentCrypto.currentPrice;
                    const priceChangeSinceLastAdvice = (typeof currentPriceVal === 'number' && typeof priceAtLastAdvice === 'number' && currentPriceVal > 0 && priceAtLastAdvice > 0)
                                                      ? Math.abs((currentPriceVal - priceAtLastAdvice) / priceAtLastAdvice) * 100
                                                      : 0;
                    const timeSinceLastAdvice = Date.now() - lastAdviceForCrypto.timestamp.getTime();
                    if (priceChangeSinceLastAdvice > 10 || timeSinceLastAdvice > (4 * 60 * 60 * 1000)) {
                        shouldFetchNewAdvice = true;
                    }
                }
                 if (shouldFetchNewAdvice) {
                    fetchAdviceForCrypto(currentCrypto);
                }
            }
        });
    }, adviceCheckInterval);

    return () => {
      window.clearInterval(dataIntervalId);
      window.clearInterval(adviceIntervalId);
    };
  }, [selectedCryptoIds, cryptoData, updateCryptoData, fetchAdviceForCrypto, isLoadingData, isLoadingAdvice, isAIServiceAvailable, advices, isGloballyRateLimited]);

  const getManualAdvice = (cryptoId: string) => {
    if (isGloballyRateLimited) {
        setSearchError("Función pausada debido al límite de peticiones API.");
        return;
    }
    const crypto = cryptoData[cryptoId];
    if (crypto && !isLoadingAdvice[cryptoId]) {
      if (!crypto.lastUpdated) {
          updateCryptoData(cryptoId, crypto.symbol, crypto.name)
            .then((freshCrypto) => {
              if(freshCrypto && freshCrypto.lastUpdated) fetchAdviceForCrypto(freshCrypto, true);
            })
            .catch(error => {
                let userErrorMessage = `Error al obtener datos para ${crypto.name} antes de generar consejo.`;
                if (error instanceof RateLimitError) { 
                    userErrorMessage = "Límite de peticiones API alcanzado.";
                }
                setSearchError(userErrorMessage);
            });
      } else {
        fetchAdviceForCrypto(crypto, true);
      }
    }
  };

  const performSearch = async (coinId: string, coinName: string, coinSymbol: string) => {
    if (isGloballyRateLimited) {
      setSearchError("Búsqueda pausada debido al límite de peticiones API.");
      setIsSearching(false);
      return;
    }
    setSearchError(null);
    setShowSuggestions(false);
    setSuggestions([]);
    setSelectedCryptoIds([coinId]);
    setCryptoData({
        [coinId]: cryptoData[coinId] || {
            id: coinId, name: coinName, symbol: coinSymbol,
            tradingViewSymbol: `${coinSymbol.toUpperCase()}USD`,
            currentPrice: 0, priceChange24hPercent: 0, priceHistory: [],
            volume24h: 0, marketCap: 0,
        }
    });
    setAdvices([]);
    try {
        const fetchedData = await updateCryptoData(coinId, coinSymbol, coinName);
        if (fetchedData && fetchedData.lastUpdated) {
            fetchAdviceForCrypto(fetchedData, true);
        } else if (!isGloballyRateLimited) { 
            setSearchError(`No se pudieron obtener datos completos para "${coinName}". El análisis de IA no estará disponible.`);
            const partialCrypto = cryptoData[coinId] || {id: coinId, name: coinName, symbol: coinSymbol, currentPrice:0, priceChange24hPercent:0, priceHistory:[], volume24h:0, marketCap:0, tradingViewSymbol: `${coinSymbol}USD`};
            setAdvices([{
                id: coinId + Date.now() + "_fetchfail_nodata", crypto: partialCrypto,
                type: AdviceType.INFO,
                message: `No se pudieron obtener datos de mercado completos para ${coinName}. Es posible que el historial de precios no esté disponible.`,
                timestamp: new Date(),
            }]);
        }
    } catch (error: any) {
        if (!(error instanceof RateLimitError)) { 
            let userErrorMessage = `Error crítico al obtener datos para "${coinName}". Intenta de nuevo.`;
            if (error.message) userErrorMessage = error.message;
            setSearchError(userErrorMessage);
            const partialCrypto = cryptoData[coinId] || {id: coinId, name: coinName, symbol: coinSymbol, currentPrice:0, priceChange24hPercent:0, priceHistory:[], volume24h:0, marketCap:0, tradingViewSymbol: `${coinSymbol}USD`};
            setAdvices([{
                id: coinId + Date.now() + "_fetchfail_exception", crypto: partialCrypto,
                type: AdviceType.INFO, message: userErrorMessage, timestamp: new Date(),
            }]);
        }
    } finally {
        setIsSearching(false);
        setSearchQuery('');
    }
  };

  const handleDirectSearch = async () => {
    if (isGloballyRateLimited) {
      setSearchError("Búsqueda pausada debido al límite de peticiones API.");
      return;
    }
    if (!searchQuery.trim()) {
        setSearchError("Por favor, ingresa un nombre o símbolo de criptomoneda.");
        return;
    }
    setIsSearching(true);
    setSearchError(null);
    setShowSuggestions(false);
    try {
        const searchResult = await searchCoinGecko(searchQuery);
        if (searchResult) {
            await performSearch(searchResult.id, searchResult.name, searchResult.symbol);
        } else if (!isGloballyRateLimited) {
            setIsSearching(false);
            setSearchError(`No se encontró la criptomoneda "${searchQuery}". Intenta con otro nombre o símbolo.`);
        }
    } catch (error: any) {
        setIsSearching(false);
        if (error instanceof RateLimitError) {
            activateRateLimitCooldown(error.message.split(': ')[1]);
        } else {
            let userErrorMessage = `Error durante la búsqueda de "${searchQuery}".`;
            if (error.message) userErrorMessage = error.message;
            setSearchError(userErrorMessage);
        }
    }
  };

  const handleSuggestionClick = (suggestion: CoinGeckoSearchResult) => {
    if (isGloballyRateLimited) {
      setSearchError("Funcionalidad pausada debido al límite de peticiones API.");
      return;
    }
    setSearchQuery(suggestion.name);
    setShowSuggestions(false);
    setSuggestions([]);
    setIsSearching(true);
    performSearch(suggestion.id, suggestion.name, suggestion.symbol);
  };

  const currentDisplayAdvice = useMemo(() => {
    if (selectedCryptoIds.length === 0 || advices.length === 0) return null;
    return advices[0] || null;
  }, [advices, selectedCryptoIds]);

  const formatLastUpdated = (timestamp?: number): string => {
    if (!timestamp) return 'N/A';
    return new Date(timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const handleAddAlertClick = (crypto: CryptoCurrency) => setShowSetAlertModalFor(crypto);
  const handleCloseAlertModal = () => setShowSetAlertModalFor(null);
  const handleSetAlert = (targetPrice: number, condition: AlertConditionType) => {
    if (!showSetAlertModalFor) return;
    const newAlert: CryptoAlert = {
      id: `alert-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      cryptoId: showSetAlertModalFor.id, cryptoName: showSetAlertModalFor.name, cryptoSymbol: showSetAlertModalFor.symbol,
      targetPrice, condition, createdAt: Date.now(), isActive: true,
    };
    setAlerts(prevAlerts => [...prevAlerts, newAlert]);
    handleCloseAlertModal();
  };
  const handleRemoveAlert = (alertId: string) => setAlerts(prevAlerts => prevAlerts.filter(alert => alert.id !== alertId));
  const handleDismissTriggeredAlert = (alertId: string) => setTriggeredAlertsQueue(prevQueue => prevQueue.filter(alert => alert.id !== alertId));

  const getActiveAlertsForCurrentCrypto = useMemo(() => {
    if (selectedCryptoIds.length === 0) return [];
    const currentCryptoId = selectedCryptoIds[0];
    return alerts.filter(alert => alert.cryptoId === currentCryptoId && alert.isActive);
  }, [alerts, selectedCryptoIds]);

  const currentAnalyzedCrypto = useMemo(() => {
    if (selectedCryptoIds.length === 0) return null;
    return cryptoData[selectedCryptoIds[0]] || null;
  }, [cryptoData, selectedCryptoIds]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 p-4 sm:p-6 md:p-8">
      <header className="text-center mb-8 md:mb-12 relative">
        <div className="flex items-center justify-center space-x-2 sm:space-x-3">
          <SparklesIcon className="w-8 h-8 sm:w-10 sm:h-10 text-cyan-400" />
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-cyan-400">
            Asesor Cripto IA
          </h1>
        </div>
         <button 
            onClick={() => setShowShareModal(true)} 
            className="p-2 rounded-full hover:bg-slate-800/70 transition-colors absolute right-0 top-0 sm:top-1/2 sm:-translate-y-1/2"
            title="Compartir / Obtener App"
            aria-label="Compartir o obtener la aplicación"
            >
            <ShareIcon className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400"/>
          </button>
        <p className="text-slate-400 mt-3 text-sm sm:text-base lg:text-lg max-w-2xl mx-auto">
          Perspectivas de IA para criptomonedas, utilizando datos de mercado, gráficos y análisis, con alertas de precio.
        </p>
        {(globalError || (isGloballyRateLimited && cooldownTimerDisplay)) && (
             <p className="text-rose-400 mt-4 text-sm sm:text-md bg-rose-950/60 p-3 rounded-xl max-w-xl mx-auto border border-rose-800">
                {globalError} {isGloballyRateLimited && cooldownTimerDisplay && ` ${cooldownTimerDisplay}`}
             </p>
        )}
      </header>

      {triggeredAlertsQueue.length > 0 && (
        <div className="fixed top-5 right-5 z-[100] w-11/12 max-w-sm space-y-3">
          {triggeredAlertsQueue.map(alert => (
            <div key={alert.id} className={`text-white p-4 rounded-xl shadow-2xl flex items-start justify-between ${alert.condition === AlertConditionType.PRICE_DROPS_TO ? 'bg-emerald-500' : 'bg-rose-500'}`}>
              <div>
                <div className="font-bold flex items-center">
                  <BellIcon className="w-5 h-5 mr-2"/>
                  {alert.condition === AlertConditionType.PRICE_DROPS_TO ? '¡ALERTA DE COMPRA!' : '¡ALERTA DE VENTA!'}
                </div>
                <p className="text-sm mt-1">
                  {alert.cryptoName} ({alert.cryptoSymbol}) ha alcanzado tu precio objetivo de ${formatPrice(alert.targetPrice, alert.cryptoSymbol)}.
                  <br />
                  Precio actual: ${formatPrice(cryptoData[alert.cryptoId]?.currentPrice, alert.cryptoSymbol)}.
                </p>
              </div>
              <button onClick={() => handleDismissTriggeredAlert(alert.id)} className={`ml-2 p-1 rounded-full ${alert.condition === AlertConditionType.PRICE_DROPS_TO ? 'hover:bg-emerald-600' : 'hover:bg-rose-600'}`}>
                <XCircleIcon className="w-5 h-5"/>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="mb-8 p-4 sm:p-6 bg-slate-900 rounded-xl shadow-2xl max-w-xl mx-auto" ref={searchContainerRef}>
        <h2 className="text-xl sm:text-2xl font-semibold mb-4 text-cyan-400 text-center sm:text-left">Analizar Criptomoneda</h2>
        <div className="flex flex-col sm:flex-row gap-3 relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => !isGloballyRateLimited && debouncedSearchQuery.trim().length > 1 && suggestions.length > 0 && setShowSuggestions(true)}
            placeholder="Ej: Bitcoin, BTC, shiba inu..."
            className="flex-grow p-3 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none placeholder-slate-500 transition-colors text-sm sm:text-base"
            onKeyPress={(e) => e.key === 'Enter' && !isSearching && !isGloballyRateLimited && handleDirectSearch()}
            aria-autocomplete="list"
            aria-expanded={showSuggestions && suggestions.length > 0}
            disabled={isGloballyRateLimited}
          />
          <button
            onClick={handleDirectSearch}
            disabled={isSearching || !searchQuery.trim() || isGloballyRateLimited}
            className="bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-3 px-4 sm:px-5 rounded-lg transition-colors flex items-center justify-center shadow-md hover:shadow-lg text-sm sm:text-base"
          >
            {isSearching && !isLoadingSuggestions ? (
              <svg className="animate-spin h-5 w-5 mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <SparklesIcon className="w-5 h-5 mr-2" />
            )}
            Buscar y Analizar
          </button>
          {showSuggestions && !isGloballyRateLimited && (suggestions.length > 0 || isLoadingSuggestions) && (
            <ul className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl z-10 max-h-60 sm:max-h-72 overflow-y-auto">
              {isLoadingSuggestions && <li className="px-4 py-3 text-slate-400 text-sm">Cargando sugerencias...</li>}
              {!isLoadingSuggestions && suggestions.length === 0 && debouncedSearchQuery.trim().length > 1 && (
                <li className="px-4 py-3 text-slate-400 text-sm">No se encontraron sugerencias.</li>
              )}
              {!isLoadingSuggestions && suggestions.map(s => (
                <li
                  key={s.id}
                  onClick={() => !isGloballyRateLimited && handleSuggestionClick(s)}
                  className={`px-4 py-3 hover:bg-cyan-600 hover:text-white flex items-center transition-colors duration-150 rounded-md mx-1 my-0.5 ${isGloballyRateLimited ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
                  role="option"
                  aria-selected="false"
                  aria-disabled={isGloballyRateLimited}
                >
                  {s.thumb && <img src={s.thumb} alt={s.name} className="w-5 h-5 sm:w-6 sm:h-6 mr-3 rounded-full"/>}
                  <span className="font-medium text-slate-100 text-sm sm:text-base">{s.name}</span>
                  <span className="ml-2 text-xs text-slate-400">({s.symbol})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        {searchError && <p className="text-rose-400 mt-3 text-sm text-center sm:text-left">{searchError}</p>}
         {isGloballyRateLimited && cooldownTimerDisplay && !globalError && (
            <p className="text-amber-400 mt-3 text-sm text-center sm:text-left">
                Límite de peticiones API temporalmente alcanzado. {cooldownTimerDisplay}
            </p>
        )}
      </div>

      <main className="mt-10 grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
        <section className="lg:col-span-2 space-y-6 md:space-y-8">
            {!currentAnalyzedCrypto && !isSearching && (
                 <div className="h-full flex flex-col items-center justify-center text-center text-slate-600 p-6 sm:p-8 bg-slate-900 rounded-2xl shadow-xl min-h-[300px]">
                    <InformationCircleIcon className="w-12 h-12 sm:w-16 sm:h-16 mx-auto mb-4" />
                    <p className="text-lg sm:text-xl">Ninguna criptomoneda analizada.</p>
                    <p className="text-sm sm:text-md">Utiliza el buscador para comenzar tu análisis.</p>
                 </div>
            )}
            {(isSearching && !currentAnalyzedCrypto) && ( // Skeleton for loading analyzed crypto
                 <div className="p-5 sm:p-6 bg-slate-900 rounded-2xl shadow-xl">
                    <div className="h-7 sm:h-8 bg-slate-800 rounded-lg w-3/4 mb-4 animate-pulse"></div>
                    <div className="h-5 sm:h-6 bg-slate-800 rounded-lg w-1/2 mb-6 animate-pulse"></div>
                    <div className="h-[350px] bg-slate-800 rounded-lg animate-pulse mb-6"></div>
                    <div className="space-y-3">
                        <div className="h-4 sm:h-5 bg-slate-800 rounded-lg w-full animate-pulse"></div>
                        <div className="h-4 sm:h-5 bg-slate-800 rounded-lg w-5/6 animate-pulse"></div>
                    </div>
                 </div>
            )}

            {currentAnalyzedCrypto && (
                <div className="p-5 sm:p-6 bg-slate-900 rounded-2xl shadow-2xl">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4">
                        <div className="mb-3 sm:mb-0">
                            <h2 className="font-bold text-xl sm:text-2xl lg:text-3xl text-slate-100 flex items-center">
                                {currentAnalyzedCrypto.name} 
                                <span className="text-slate-500 text-lg sm:text-xl ml-2">({currentAnalyzedCrypto.symbol})</span>
                            </h2>
                            {(!isLoadingData[currentAnalyzedCrypto.id] && !currentAnalyzedCrypto.lastUpdated && !isSearching) && (
                                <span className="text-xs text-amber-400 ml-1">(Datos pendientes o fallidos)</span>
                            )}
                        </div>
                        <button
                            onClick={() => getManualAdvice(currentAnalyzedCrypto.id)}
                            disabled={isLoadingAdvice[currentAnalyzedCrypto.id] || !isAIServiceAvailable || isLoadingData[currentAnalyzedCrypto.id] || !currentAnalyzedCrypto.lastUpdated || isGloballyRateLimited}
                            className="bg-cyan-500 hover:bg-cyan-600 disabled:bg-slate-700 disabled:text-slate-500 disabled:cursor-not-allowed text-white font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm flex items-center w-full sm:w-auto justify-center shadow-md hover:shadow-lg"
                            title={isGloballyRateLimited? "Funcionalidad pausada" : !isAIServiceAvailable ? "Servicio IA no disponible" : !currentAnalyzedCrypto.lastUpdated ? "Esperando datos..." : "Refrescar Consejo IA"}
                        >
                            {isLoadingAdvice[currentAnalyzedCrypto.id] ? (
                                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                            ) : ( <SparklesIcon className="w-4 h-4 mr-1.5" /> )}
                            Nuevo Análisis IA
                        </button>
                    </div>

                    {currentAnalyzedCrypto.lastUpdated && (
                        <div className="mb-4">
                            <span className={`text-2xl sm:text-3xl font-bold ${currentAnalyzedCrypto.priceChange24hPercent >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                ${formatPrice(currentAnalyzedCrypto.currentPrice, currentAnalyzedCrypto.symbol)}
                            </span>
                            <span className={`ml-2 text-lg ${currentAnalyzedCrypto.priceChange24hPercent >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                                ({currentAnalyzedCrypto.priceChange24hPercent ? currentAnalyzedCrypto.priceChange24hPercent.toFixed(2) : '0.00'}% 24h)
                            </span>
                        </div>
                    )}

                    <div className="mb-6 rounded-lg overflow-hidden" style={{ height: '350px' }}>
                       {currentAnalyzedCrypto.tradingViewSymbol ? (
                         <TradingViewWidget
                            symbol={currentAnalyzedCrypto.tradingViewSymbol}
                            height={350}
                            locale="es"
                            theme="dark"
                         />
                       ) : <div style={{height: '350px'}} className="flex items-center justify-center bg-slate-800 text-slate-500">Símbolo de TradingView no configurado.</div>}
                    </div>
                    
                    {(isLoadingData[currentAnalyzedCrypto.id] && !currentAnalyzedCrypto.lastUpdated) && 
                        <div className="py-6"><LoadingSpinner /> <p className="text-center text-slate-400">Cargando datos de mercado...</p> </div> 
                    }

                    {currentAnalyzedCrypto.lastUpdated ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm text-slate-400 mb-6">
                            <div>Cap. Mercado: <span className="font-medium text-slate-200">${currentAnalyzedCrypto.marketCap > 0 ? currentAnalyzedCrypto.marketCap.toLocaleString() : 'N/A'}</span></div>
                            <div>Volumen 24h: <span className="font-medium text-slate-200">${currentAnalyzedCrypto.volume24h > 0 ? currentAnalyzedCrypto.volume24h.toLocaleString() : 'N/A'}</span></div>
                            <div>Última act.: <span className="font-medium text-slate-200">{formatLastUpdated(currentAnalyzedCrypto.lastUpdated)}</span></div>
                        </div>
                    ) : (!isLoadingData[currentAnalyzedCrypto.id] && !isSearching) && <p className="text-xs text-amber-400 mb-4">No se pudieron cargar los datos de mercado detallados.</p>
                    }

                    <div className="mt-6 pt-6 border-t border-slate-700/70">
                        <h3 className="text-xl font-semibold mb-4 text-cyan-300 flex items-center">
                            <BellIcon className="w-6 h-6 mr-2" />
                            Alertas de Precio Activas
                        </h3>
                        {currentAnalyzedCrypto.lastUpdated && !isGloballyRateLimited ? (
                            <button
                                onClick={() => handleAddAlertClick(currentAnalyzedCrypto)}
                                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-colors text-sm flex items-center justify-center mb-4 shadow-md hover:shadow-lg"
                            >
                                <PlusCircleIcon className="w-5 h-5 mr-2" />
                                Crear Nueva Alerta
                            </button>
                        ) : (
                            <p className="text-sm text-slate-500 mb-4 p-3 bg-slate-800 rounded-lg">
                                {isGloballyRateLimited ? "Creación de alertas pausada." : "Carga los datos de la criptomoneda para poder crear alertas de precio."}
                            </p>
                        )}

                        {getActiveAlertsForCurrentCrypto.length > 0 ? (
                            <ul className="space-y-3">
                                {getActiveAlertsForCurrentCrypto.map(alert => (
                                    <li key={alert.id} className="bg-slate-800 p-3 sm:p-4 rounded-lg text-sm flex flex-col sm:flex-row justify-between items-start sm:items-center shadow">
                                        <div className="mb-2 sm:mb-0">
                                            <span className="font-medium text-slate-200">
                                                {alert.condition === AlertConditionType.PRICE_DROPS_TO ? 'Si el precio BAJA a: ' : 'Si el precio SUBE a: '}
                                            </span>
                                            <span className="text-cyan-400 font-bold text-md">${formatPrice(alert.targetPrice, alert.cryptoSymbol)}</span>
                                            <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${alert.condition === AlertConditionType.PRICE_DROPS_TO ? 'bg-emerald-900 text-emerald-300' : 'bg-rose-900 text-rose-300'}`}>
                                                {alert.condition === AlertConditionType.PRICE_DROPS_TO ? 'COMPRA' : 'VENTA'}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveAlert(alert.id)}
                                            className="text-rose-400 hover:text-rose-300 p-1.5 rounded-md hover:bg-rose-950/70 transition-colors self-end sm:self-center"
                                            title="Eliminar alerta"
                                        >
                                            <TrashIcon className="w-5 h-5" />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="text-sm text-slate-500 p-3 bg-slate-800 rounded-lg">No hay alertas activas para {currentAnalyzedCrypto.name}.</p>
                        )}
                    </div>
                </div>
            )}
        </section>

        <aside className="lg:col-span-1">
          <h2 className="text-2xl sm:text-3xl font-semibold mb-6 text-cyan-400">Perspectivas de IA</h2>
          {selectedCryptoIds.length === 0 && !isSearching && (
            <div className="text-center text-slate-600 text-lg py-10 bg-slate-900 rounded-xl shadow-xl h-full flex flex-col items-center justify-center">
              <InformationCircleIcon className="w-12 h-12 mx-auto mb-3" />
              El análisis de IA aparecerá aquí.
            </div>
          )}
          {isSearching && !currentDisplayAdvice && (
             <div className="p-6 bg-slate-900 rounded-xl shadow-xl"><LoadingSpinner /> <p className="text-center mt-2 text-slate-400">Cargando...</p> </div>
          )}

          {currentDisplayAdvice && (
            <AdviceCard advice={currentDisplayAdvice} />
          )}

           {selectedCryptoIds.length > 0 && !currentDisplayAdvice && !isSearching && (
             <div className="text-center text-slate-500 text-lg py-10 bg-slate-900 rounded-xl shadow-xl h-full flex flex-col items-center justify-center">
                <InformationCircleIcon className="w-12 h-12 mx-auto mb-3" />
                {isAIServiceAvailable ? "Esperando datos para generar consejo..." : "El servicio de IA no está disponible."}
             </div>
          )}
        </aside>
      </main>

      {showSetAlertModalFor && cryptoData[showSetAlertModalFor.id] && (
        <SetAlertModal
            isOpen={!!showSetAlertModalFor}
            onClose={handleCloseAlertModal}
            onSetAlert={handleSetAlert}
            currentPrice={cryptoData[showSetAlertModalFor.id].currentPrice}
            cryptoName={showSetAlertModalFor.name}
            cryptoSymbol={showSetAlertModalFor.symbol}
        />
      )}

      {showShareModal && (
        <ShareAppModal
          isOpen={showShareModal}
          onClose={() => setShowShareModal(false)}
          appUrl={appUrl}
        />
      )}

    </div>
  );
};

export default App;
