
import { GoogleGenAI, GenerateContentResponse } from "@google/genai";
import { CryptoCurrency, AdviceType } from '../types';
import { GEMINI_TEXT_MODEL } from '../constants';

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  console.error("API_KEY para Gemini no está configurada en las variables de entorno. Las funciones de IA estarán deshabilitadas.");
}

const ai = API_KEY ? new GoogleGenAI({ apiKey: API_KEY }) : null;

const ADVANCED_DETAILS_SEPARATOR = "---DETALLES_AVANZADOS---";

export const getInvestmentAdvice = async (
  crypto: CryptoCurrency
): Promise<{ adviceText: string; detailedMessage?: string; adviceType: AdviceType; rawGeminiResponse?: string } | null> => {
  if (!ai) {
    console.warn("Cliente Gemini AI no inicializado. La clave API podría estar ausente.");
    return {
        adviceText: "El Asesor IA no está disponible actualmente. Asegúrate de que la clave API esté configurada.",
        adviceType: AdviceType.INFO
    };
  }

  const priceTrendDescription = crypto.priceHistory.length > 1
    ? `El precio se ha movido de aprox. $${crypto.priceHistory[0].price.toFixed(2)} a $${crypto.currentPrice.toFixed(2)} (USD) durante el período reciente (últimos 30 días, con datos diarios).`
    : "El historial detallado de tendencias de precios (diario) no está disponible.";

  const priceHistorySummary = crypto.priceHistory.length > 5
    ? `Algunos puntos de precio históricos recientes (diarios, USD): ${crypto.priceHistory.slice(-5).map(p => `$${p.price.toFixed(2)}`).join(', ')}.`
    : "No hay suficientes datos históricos para un resumen detallado.";

  const prompt = `
    Eres un asesor financiero de élite y un trader consumado, con acceso y conocimiento de las técnicas más avanzadas utilizadas por los mejores traders del mundo. Tu análisis debe reflejar esta profundidad y confianza.
    Tu tarea es analizar la criptomoneda: ${crypto.name} (${crypto.symbol}) y determinar si el momento actual es más oportuno para una COMPRA o una VENTA especulativa, enfocándote PRINCIPALMENTE en una perspectiva de GRÁFICOS DIARIOS.

    Datos de Mercado Actuales (Reales):
    - Precio: $${crypto.currentPrice.toFixed(crypto.symbol === 'DOGE' || crypto.symbol === 'ADA' || crypto.currentPrice < 0.1 ? 4 : 2)} USD
    - Cambio de Precio en 24h: ${crypto.priceChange24hPercent.toFixed(2)}%
    - Volumen en 24h: $${crypto.volume24h.toLocaleString()} USD
    - Capitalización de Mercado: $${crypto.marketCap.toLocaleString()} USD
    - Indicación de Tendencia de Precios Reciente (Basado en Datos Diarios): ${priceTrendDescription}
    - Resumen de Historial de Precios (Datos Diarios): ${priceHistorySummary}

    Instrucción Principal:
    1.  ENFÓCATE en un análisis de GRÁFICOS DIARIOS. Interpreta los datos de precios y volumen desde esta perspectiva temporal para identificar tendencias mayores, patrones de continuación o reversión significativos, y niveles clave de soporte/resistencia en el marco diario.
    2.  Aplica tu conocimiento general sobre análisis técnico avanzado, siempre desde la perspectiva diaria:
        - Patrones gráficos clásicos (ej. triángulos, banderas, cabeza y hombros, etc.) visibles en el gráfico diario.
        - Niveles de soporte y resistencia clave en el marco diario.
        - La acción del precio en relación con medias móviles conceptuales (ej. 20, 50, 200 días).
        - Indicadores de momento (como RSI o MACD, conceptualmente) y busca la posible presencia de **divergencias** (alcistas o bajistas) entre el precio y estos osciladores en el gráfico diario.
        - El análisis de volumen diario y cómo confirma o contradice los movimientos de precios.
        - La posible **confluencia de señales** (a veces referida como una 'trifecta') que podría indicar una mayor probabilidad para un movimiento direccional en el marco diario.
        - Zonas de **liquidez del lado de la compra (buyside liquidity)** por encima de máximos recientes significativos (diarios/semanales) y **liquidez del lado de la venta (sellside liquidity)** por debajo de mínimos recientes significativos (diarios/semanales). ¿Sugiere la acción del precio reciente que el mercado podría moverse para capturar esta liquidez en el marco temporal más amplio?
    3.  Sintetiza esta información.
    4.  CONSISTENCIA: Una vez que has llegado a una conclusión de COMPRAR o VENDER basada en el análisis diario, mantén esta postura a menos que nueva información de mercado (ej. un evento fundamental mayor) o un cambio técnico SIGNIFICATIVO en el gráfico DIARIO (ej. ruptura de un nivel diario clave, formación de un patrón de reversión diario claro) justifiquen fuertemente una reevaluación. Tu objetivo es proporcionar una guía consistente basada en tendencias diarias, no fluctuar con el ruido intradía.

    Formato de Respuesta OBLIGATORIO:
    Tu respuesta COMPLETA DEBE comenzar con una de estas palabras clave (en mayúsculas y español): "COMPRAR:", "VENDER:", o "MANTENER:".
    Si usas "MANTENER:", debe ser porque, después de un análisis exhaustivo del gráfico DIARIO, la situación es verdaderamente neutral y no hay una inclinación clara hacia compra o venta que puedas justificar con alta confianza desde esta perspectiva. Explica detalladamente por qué ninguna acción es preferible y qué condiciones del gráfico diario cambiarían tu perspectiva.
    EVITA la palabra clave "INFO:" como respuesta a esta solicitud de análisis.

    Estructura de la Explicación (Después de la palabra clave COMPRAR/VENDER/MANTENER):
    Primero, proporciona un **Resumen Sencillo** (1-2 frases) en lenguaje claro, directo y sin jerga técnica, dirigido a un principiante. Este resumen debe explicar la razón principal de tu recomendación.
    Luego, inserta el separador EXACTO: "${ADVANCED_DETAILS_SEPARATOR}"
    Después del separador, proporciona el **Análisis Avanzado**, donde puedes usar terminología técnica y profundizar en los conceptos de trading (divergencias, liquidez, patrones diarios, etc.) que respaldan tu recomendación. Esta sección es para usuarios más experimentados.

    Importante:
    -   No menciones que estás limitado a los datos proporcionados o la fuente de los datos en tu respuesta al usuario. Actúa como si tuvieras un conocimiento general del mercado pero basando esta recomendación específica en estos datos y tus interpretaciones técnicas del gráfico diario.

    Ejemplo de estructura (para un principiante y luego para un experto):
    "COMPRAR: Parece un buen momento para comprar ${crypto.name} porque muestra fortaleza en el gráfico diario y podría seguir subiendo.
    ${ADVANCED_DETAILS_SEPARATOR}
    En el gráfico diario, ${crypto.name} ha formado una base sólida por encima del nivel de soporte de $X, coincidiendo con el retroceso de Fibonacci del 61.8%. Observamos una posible divergencia alcista en el RSI diario (14) y un aumento en el volumen de compra en los últimos días. Si el precio supera la resistencia de $Y con convicción, el próximo objetivo podría ser la zona de liquidez del lado de la compra cerca de $Z. La confluencia de la acción del precio con los indicadores y la estructura del mercado diario sugiere una continuación alcista."
  `;

  try {
    const response: GenerateContentResponse = await ai.models.generateContent({
        model: GEMINI_TEXT_MODEL,
        contents: prompt,
         config: {
            temperature: 0.5, // Un poco menos creativo para análisis más directos
            topK: 40,
            topP: 0.9,
         }
    });

    const rawText = response.text;
    let adviceType: AdviceType;
    let fullAdviceMessage = rawText.trim();
    let adviceText = ""; // Simple summary
    let detailedMessage: string | undefined = undefined;

    if (fullAdviceMessage.toUpperCase().startsWith("COMPRAR:")) {
        adviceType = AdviceType.BUY;
        fullAdviceMessage = fullAdviceMessage.substring("COMPRAR:".length).trim();
    } else if (fullAdviceMessage.toUpperCase().startsWith("VENDER:")) {
        adviceType = AdviceType.SELL;
        fullAdviceMessage = fullAdviceMessage.substring("VENDER:".length).trim();
    } else if (fullAdviceMessage.toUpperCase().startsWith("MANTENER:")) {
        adviceType = AdviceType.HOLD;
        fullAdviceMessage = fullAdviceMessage.substring("MANTENER:".length).trim();
    } else {
        console.warn("La respuesta de Gemini no comenzó con la palabra clave esperada. Respuesta completa:", rawText);
        adviceType = AdviceType.INFO;
    }

    const separatorIndex = fullAdviceMessage.indexOf(ADVANCED_DETAILS_SEPARATOR);

    if (separatorIndex !== -1) {
        adviceText = fullAdviceMessage.substring(0, separatorIndex).trim();
        detailedMessage = fullAdviceMessage.substring(separatorIndex + ADVANCED_DETAILS_SEPARATOR.length).trim();
    } else {
        // If separator is not found, the whole message is considered the simple summary
        adviceText = fullAdviceMessage;
    }
    
    // Fallback if adviceText is somehow empty but rawText has content (e.g. only separator was present)
    if (!adviceText && rawText) {
        adviceText = "La IA proporcionó una respuesta, pero no pudo ser formateada correctamente para un resumen sencillo. Revisa la respuesta completa si está disponible.";
        if(adviceType === AdviceType.INFO && !rawText.toUpperCase().startsWith("INFO:")) { // If it defaulted to INFO due to bad format
             adviceText = rawText.trim(); // Show the full raw text if format was bad.
        }
    }


    return { adviceText, detailedMessage, adviceType, rawGeminiResponse: rawText };

  } catch (error) {
    console.error("Error al obtener asesoramiento de la API de Gemini:", error);
    let errorMessage = `Error al obtener asesoramiento para ${crypto.name}. El servicio de IA podría estar temporalmente no disponible o mal configurado.`;
    if (error instanceof Error && 'message' in error) {
        errorMessage += ` Detalles: ${error.message}`;
    }
    return {
        adviceText: errorMessage,
        adviceType: AdviceType.INFO
    };
  }
};