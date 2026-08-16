import './globals.css';
import { Archivo_Black, Inter } from 'next/font/google';
import Providers from './providers';
import ServiceWorkerRegister from './ServiceWorkerRegister';

const archivoBlack = Archivo_Black({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
});
const inter = Inter({ subsets: ['latin'], variable: '--font-body' });

export const metadata = {
  title: 'PasteExpress — Trie tes tournées de livraison',
  description: "Colle tes adresses, obtiens une tournée triée en quelques secondes.",
  manifest: '/manifest.json',
};

export const viewport = {
  themeColor: '#1B2A4A',
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={`${archivoBlack.variable} ${inter.variable}`}>
      <body>
        <Providers>{children}</Providers>
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
