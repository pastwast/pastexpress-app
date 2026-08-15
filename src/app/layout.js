import './globals.css';
import { Archivo_Black, Inter } from 'next/font/google';
import Providers from './providers';

const archivoBlack = Archivo_Black({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
});
const inter = Inter({ subsets: ['latin'], variable: '--font-body' });

export const metadata = {
  title: 'PasteExpress — Trie tes tournées de livraison',
  description: "Colle tes adresses, obtiens une tournée triée en quelques secondes.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr" className={`${archivoBlack.variable} ${inter.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
