
import React, { useState, useEffect } from 'react';
import { XCircleIcon, ShareIcon } from './icons';

interface ShareAppModalProps {
  isOpen: boolean;
  onClose: () => void;
  appUrl: string;
}

const ShareAppModal: React.FC<ShareAppModalProps> = ({ isOpen, onClose, appUrl }) => {
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    if (navigator.share) {
      setCanNativeShare(true);
    }
  }, []);

  const handleNativeShare = async () => {
    if (appUrl.startsWith('file:')) {
      alert(
        "Las URLs locales (file://) no se pueden compartir directamente a través de esta función. " +
        "Para compartir la aplicación con otros, primero súbela a un servidor web. " +
        "Para uso personal en este dispositivo, puedes usar las opciones de 'Instalar Aplicación'."
      );
      return;
    }

    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Asesor Cripto IA',
          text: 'Echa un vistazo a Asesor Cripto IA para análisis de criptomonedas con IA y alertas de precios.',
          url: appUrl,
        });
      } catch (error) {
        // Common error: AbortError if the user cancels the share dialog.
        if ((error as DOMException).name !== 'AbortError') {
          console.error('Error al usar Web Share API:', error);
          // The error message from the prompt "Failed to execute 'share' on 'Navigator': Invalid URL" would be caught here if not a file: URL.
          alert('No se pudo compartir directamente. Asegúrate de que la URL sea válida y accesible (ej. no un archivo local si el navegador lo restringe).');
        }
      }
    } else {
      alert('La función de compartir directamente no está disponible en este navegador.');
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-slate-900 bg-opacity-80 backdrop-blur-sm flex items-center justify-center p-4 z-[100] transition-opacity duration-300 ease-in-out"
      aria-labelledby="share-modal-title"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-slate-800 p-6 sm:p-8 rounded-2xl shadow-2xl w-full max-w-lg border border-slate-700 relative transform transition-all duration-300 ease-out scale-95 group-hover:scale-100 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors z-20"
          aria-label="Cerrar modal"
        >
          <XCircleIcon className="w-7 h-7" />
        </button>

        <h2 id="share-modal-title" className="text-2xl sm:text-3xl font-semibold mb-6 text-cyan-400 text-center">
          Compartir Asesor Cripto IA
        </h2>

        <div className="space-y-6 text-slate-300 text-sm sm:text-base">
          {canNativeShare && (
            <>
              <button
                onClick={handleNativeShare}
                className="w-full flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold py-3 px-4 rounded-lg transition-colors shadow-md hover:shadow-lg text-base"
              >
                <ShareIcon className="w-5 h-5" />
                Compartir App Directamente
              </button>
              <p className="text-xs text-center text-slate-400 -mt-3">
                Usa la opción de compartir nativa de tu dispositivo.
              </p>
            </>
          )}
          
          {(canNativeShare) && <hr className="my-6 border-slate-700/60" />}


          <div>
            <h3 className="font-semibold text-xl text-slate-100 mb-3">Instalar Aplicación / Acceso Rápido:</h3>
            <div className="space-y-3">
              <div>
                <h4 className="font-medium text-md text-slate-200 mb-1">En tu Móvil (iOS y Android):</h4>
                <p className="mb-1 text-xs sm:text-sm">1. Abre esta página en tu navegador (Safari en iOS, Chrome en Android) usando el enlace.</p>
                <p className="mb-1 text-xs sm:text-sm">2. Toca el botón de 'Compartir' <ShareIcon className="w-3 h-3 sm:w-4 sm:h-4 inline-block relative -top-0.5" /> (iOS) o el menú de tres puntos ⋮ (Android).</p>
                <p className="text-xs sm:text-sm">3. Selecciona 'Añadir a pantalla de inicio' o 'Instalar aplicación'.</p>
              </div>
              <div>
                <h4 className="font-medium text-md text-slate-200 mb-1">En tu PC (Windows, Mac, Linux):</h4>
                <p className="mb-1 text-xs sm:text-sm">1. Abre esta página en Chrome o Edge.</p>
                <p className="mb-1 text-xs sm:text-sm">2. Haz clic en el menú de tres puntos ⋮ (arriba a la derecha).</p>
                <p className="text-xs sm:text-sm">3. Selecciona 'Guardar e Compartir' &gt; 'Instalar [Nombre de la App]' o busca una opción similar como 'Instalar esta aplicación'.</p>
                <p className="text-xs text-slate-400 mt-1">Alternativamente, simplemente guarda esta página en tus marcadores/favoritos.</p>
              </div>
            </div>
          </div>
          
          {!canNativeShare && (
             <p className="text-sm text-slate-400 mt-4 p-3 bg-slate-850 border border-slate-700 rounded-lg">
                La opción de compartir directamente no está disponible en este navegador. Puedes usar las instrucciones de "Instalar Aplicación" para un acceso rápido, o compartir la URL manualmente desde la barra de direcciones de tu navegador.
            </p>
          )}


          <div className="pt-4 border-t border-slate-700/60">
            <p className="text-xs text-slate-500">
              Nota: Para que este enlace funcione para otros usuarios o en otros dispositivos de forma fiable, la aplicación idealmente debe estar alojada en un servidor web (online). Si estás ejecutando esto localmente (desde <code>file:///</code> o <code>http://localhost</code> sin configuración de red especial), el acceso desde otros dispositivos podría no funcionar y la función de compartir directamente podría tener limitaciones.
            </p>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-8 w-full px-5 py-3 rounded-lg bg-slate-600 hover:bg-slate-500 text-slate-100 transition-colors font-medium shadow-sm hover:shadow-md"
        >
          Cerrar
        </button>
      </div>
    </div>
  );
};

export default ShareAppModal;
