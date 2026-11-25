import { Link } from 'react-router-dom';
import { Button } from '../../components/ui';

export default function NotFound() {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center px-5 py-32 text-center">
      <p className="font-display text-7xl font-semibold text-gold-gradient">404</p>
      <h1 className="mt-4 font-display text-2xl font-semibold text-white">Page not found</h1>
      <p className="mt-2 text-slate-400">The page you’re looking for doesn’t exist or is no longer published.</p>
      <Link to="/" className="mt-8">
        <Button variant="gold">Back to home</Button>
      </Link>
    </div>
  );
}
