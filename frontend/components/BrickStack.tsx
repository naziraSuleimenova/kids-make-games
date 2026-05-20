// Bricks ordered top→bottom in DOM (flex-col), but pink appears first (delay 0),
// orange second, yellow last — giving the Lego "build up" effect.
const BRICKS = [
  { fill: '#FFB800', stud: '#E5A200', delay: '1.1s' }, // top — yellow, appears 3rd
  { fill: '#FF6B00', stud: '#E55A00', delay: '0.55s' }, // middle — orange, appears 2nd
  { fill: '#FF3D9A', stud: '#D42F82', delay: '0s'    }, // bottom — pink, appears 1st
];

export default function BrickStack() {
  return (
    <div className="flex flex-col items-center" style={{ gap: '2px' }}>
      {BRICKS.map(({ fill, stud, delay }, i) => (
        <div
          key={i}
          style={{
            opacity: 0,
            animation: `brickDrop 3.8s ease-out ${delay} infinite both`,
          }}
        >
          {/* Same proportions as logo bricks (18×14 ≈ 1.28:1), scaled up */}
          <svg viewBox="0 0 56 50" width="72" height="64" fill="none" xmlns="http://www.w3.org/2000/svg">
            {/* Studs at top edge of body */}
            <circle cx="16" cy="8" r="7" fill={stud} />
            <circle cx="40" cy="8" r="7" fill={stud} />
            {/* Brick body — 56×42, ratio 1.33:1 matching logo */}
            <rect x="0" y="8" width="56" height="42" rx="5" fill={fill} />
            {/* Sheen */}
            <rect x="4" y="12" width="48" height="6" rx="3" fill="white" opacity="0.18" />
          </svg>
        </div>
      ))}
    </div>
  );
}
