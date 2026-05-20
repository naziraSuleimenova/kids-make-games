import Link from 'next/link';
import GameCard from '@/components/GameCard';
import { api, type Game } from '@/lib/api';

export const revalidate = 30;

export default async function GalleryPage() {
  let games: Game[] = [];
  try {
    games = await api.listGames();
  } catch {
    // Show empty state if backend is unreachable
  }

  return (
    <div className="max-w-6xl mx-auto px-6 py-16">
      <div className="flex items-end justify-between mb-10">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight text-[#1d1d1f]">Game Gallery</h1>
          <p className="text-[#6e6e73] mt-1 text-[15px]">
            {games.length > 0
              ? `${games.length} games made by kids`
              : 'Be the first to publish a game!'}
          </p>
        </div>
        <Link
          href="/create"
          className="text-sm font-bold text-white px-5 py-2.5 rounded-xl bg-[#FF6B00] hover:bg-[#e55a00] active:scale-95 transition-all"
        >
          Create ✦
        </Link>
      </div>

      {games.length === 0 ? (
        <div className="text-center py-32">
          <div className="text-7xl mb-5">🎮</div>
          <h2 className="text-2xl font-bold text-[#1d1d1f] mb-2">No games yet</h2>
          <p className="text-[#6e6e73] mb-8">Be the first to create and publish a game.</p>
          <Link
            href="/create"
            className="inline-block font-bold text-white px-7 py-3 rounded-2xl bg-[#FF6B00] hover:bg-[#e55a00] transition-colors text-[15px]"
          >
            Make the First Game ✦
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {games.map(game => (
            <GameCard key={game.id} game={game} />
          ))}
        </div>
      )}
    </div>
  );
}
