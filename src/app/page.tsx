import { LandingPage } from './landing/LandingPage';

/*
 * The landing's <title> leads with the brand and its category.
 * "Kingfisher Chess" disambiguates the bare brand name — see
 * docs/operations/search-console.md for why this matters. The
 * description is the marketing two-liner, not the SEO description;
 * both are kept in sync here.
 */
export const metadata = {
  title: 'Kingfisher Chess — chess research workspace',
  description:
    'Kingfisher Chess is a local-first chess analysis and repertoire workstation for serious players. Stockfish 18 in the browser, native chess engines on macOS, opening explorer, large personal chess database, repertoire and review. No account. No cookies.',
};

export default function Home() {
  return <LandingPage />;
}
