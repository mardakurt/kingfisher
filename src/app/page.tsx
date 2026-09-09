import { LandingPage } from './landing/LandingPage';

export const metadata = {
  title: 'Kingfisher — chess research, in one place',
  description:
    'Kingfisher is a local-first chess workstation for serious players. Opening research, engines, databases, repertoire and review. Web and macOS.',
};

export default function Home() {
  return <LandingPage />;
}
