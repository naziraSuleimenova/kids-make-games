'use client';

import { useRef } from 'react';

interface Props {
  src: string;
  title?: string;
}

export default function GamePlayer({ src, title = 'Game' }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  function handleClick() {
    iframeRef.current?.focus();
    iframeRef.current?.contentWindow?.focus();
  }

  return (
    <div
      className="relative w-full cursor-pointer"
      style={{ aspectRatio: '800/600' }}
      onClick={handleClick}
    >
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        sandbox="allow-scripts allow-same-origin allow-pointer-lock"
        className="absolute inset-0 w-full h-full"
        style={{ background: '#1a1a2e', display: 'block' }}
        tabIndex={0}
        allowFullScreen
      />
    </div>
  );
}
