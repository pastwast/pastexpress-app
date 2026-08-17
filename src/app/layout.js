import './globals.css';
import { Anton, Archivo, IBM_Plex_Mono } from 'next/font/google';
import Providers from './providers';
import ServiceWorkerRegister from './ServiceWorkerRegister';

// Anton pour l'affichage : la lettre du panneau routier, lue à distance.
const anton = Anton({ weight: '400', subsets: ['latin'], variable: '--font-display' });
// Archivo pour le texte courant : neutre, très lisible en petit corps.
const archivo = Archivo({ subsets: ['latin'], variable: '--font-body' });
// Mono pour les données : adresses, kilomètres, durées.
const plexMono = IBM_Plex_Mono({
  weight: ['400', '600'],
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata = {
  title: 'PasteExpress — Trie tes tournées de livraison',
  description: 'Colle tes adresses, obtiens une tournée triée en quelques secondes.',
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#1B1E24',
};

export default function RootLayout({ children }) {
  return (
    <html
      lang="fr"
      className={`${anton.variable} ${archivo.variable} ${plexMono.variable}`}
    >
      <body>
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
