import Link from 'next/link';
import Image from 'next/image';
import type { Game } from '@/lib/api';

interface Props {
  game: Game;
}

export default function GameCard({ game }: Props) {
  return (
    <Link
      href={`/games/${game.id}`}
      className="group block rounded-3xl overflow-hidden bg-white border border-black/[0.07] hover:border-[#FF6B00]/30 hover:shadow-lg hover:shadow-[#FF6B00]/5 transition-all duration-200 hover:-translate-y-1"
    >
      <div className="relative w-full aspect-[4/3] bg-[#f5f5f7]">
        {game.thumbnail_url ? (
          <Image
            src={game.thumbnail_url}
            alt={game.title ?? 'Game thumbnail'}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-5xl">
            🎮
          </div>
        )}
      </div>

      <div className="p-5">
        <h3 className="font-bold text-[#1d1d1f] text-[15px] leading-tight truncate">
          {game.title ?? 'Untitled Game'}
        </h3>
        <div className="mt-3">
          <span className="text-xs font-bold text-[#FF6B00] group-hover:underline">
            Play →
          </span>
        </div>
      </div>
    </Link>
  );
}
