import React from "react";

// Artistic Vector Illustration 1: Night Barbecue Stall under Warm Lanterns
export function PolaroidBarbecueArt() {
  return (
    <svg viewBox="0 0 300 200" width="100%" height="100%" style={{ borderRadius: "6px" }}>
      <defs>
        <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f172a" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </linearGradient>
        <radialGradient id="lanternGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#fef08a" stopOpacity="0.9" />
          <stop offset="50%" stopColor="#f59e0b" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="grillGlow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="50%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>

      {/* Night Sky Background */}
      <rect width="300" height="200" fill="url(#skyGrad)" />

      {/* Background City Silhouette */}
      <path d="M 0 160 L 30 140 L 60 145 L 90 120 L 130 130 L 160 110 L 210 135 L 250 125 L 300 150 L 300 200 L 0 200 Z" fill="#020617" opacity="0.6" />

      {/* Lantern 1 & Light Glow */}
      <circle cx="70" cy="50" r="35" fill="url(#lanternGlow)" />
      <rect x="60" y="35" width="20" height="28" rx="4" fill="#dc2626" />
      <rect x="63" y="32" width="14" height="4" fill="#fbbf24" />
      <rect x="63" y="62" width="14" height="4" fill="#fbbf24" />
      <text x="70" y="53" fontSize="11" fill="#fef08a" textAnchor="middle" fontWeight="bold">串</text>

      {/* Lantern 2 */}
      <circle cx="230" cy="50" r="35" fill="url(#lanternGlow)" />
      <rect x="220" y="35" width="20" height="28" rx="4" fill="#dc2626" />
      <rect x="223" y="32" width="14" height="4" fill="#fbbf24" />
      <rect x="223" y="62" width="14" height="4" fill="#fbbf24" />
      <text x="230" y="53" fontSize="11" fill="#fef08a" textAnchor="middle" fontWeight="bold">鲜</text>

      {/* Barbecue Cart */}
      <rect x="40" y="120" width="220" height="60" rx="6" fill="#334155" stroke="#475569" strokeWidth="2" />
      <rect x="50" y="110" width="200" height="12" fill="url(#grillGlow)" />

      {/* Skewers on Grill */}
      <line x1="60" y1="100" x2="60" y2="118" stroke="#cbd5e1" strokeWidth="2" />
      <circle cx="60" cy="104" r="3" fill="#881337" />
      <circle cx="60" cy="110" r="3" fill="#b91c1c" />

      <line x1="75" y1="100" x2="75" y2="118" stroke="#cbd5e1" strokeWidth="2" />
      <circle cx="75" cy="104" r="3" fill="#881337" />
      <circle cx="75" cy="110" r="3" fill="#b91c1c" />

      <line x1="90" y1="100" x2="90" y2="118" stroke="#cbd5e1" strokeWidth="2" />
      <circle cx="90" cy="104" r="3" fill="#881337" />
      <circle cx="90" cy="110" r="3" fill="#b91c1c" />

      {/* Rising Smoke Particles */}
      <path d="M 70 105 Q 60 80 80 60 T 70 30" fill="none" stroke="#f8fafc" strokeWidth="2" opacity="0.3" strokeDasharray="4 4" />
      <path d="M 85 105 Q 100 80 85 60 T 95 30" fill="none" stroke="#f8fafc" strokeWidth="2" opacity="0.25" strokeDasharray="3 3" />
      <path d="M 200 105 Q 190 80 210 60 T 200 30" fill="none" stroke="#f8fafc" strokeWidth="2" opacity="0.3" strokeDasharray="4 4" />

      {/* Street Ground */}
      <rect x="0" y="175" width="300" height="25" fill="#0f172a" />
      <line x1="0" y1="175" x2="300" y2="175" stroke="#334155" strokeWidth="2" />
    </svg>
  );
}

// Artistic Vector Illustration 2: Old Bookshop with Vintage Novels
export function PolaroidBookstoreArt() {
  return (
    <svg viewBox="0 0 300 200" width="100%" height="100%" style={{ borderRadius: "6px" }}>
      <defs>
        <linearGradient id="warmBg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#451a03" />
          <stop offset="100%" stopColor="#1e1b4b" />
        </linearGradient>
        <radialGradient id="lampGlow" cx="30%" cy="30%" r="60%">
          <stop offset="0%" stopColor="#fef08a" stopOpacity="0.8" />
          <stop offset="60%" stopColor="#d97706" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#451a03" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect width="300" height="200" fill="url(#warmBg)" />
      <circle cx="90" cy="70" r="80" fill="url(#lampGlow)" />

      {/* Wooden Bookshelf Lines */}
      <rect x="20" y="30" width="260" height="8" fill="#78350f" />
      <rect x="20" y="110" width="260" height="8" fill="#78350f" />

      {/* Books on Shelves */}
      <rect x="30" y="40" width="14" height="70" fill="#991b1b" />
      <rect x="46" y="45" width="12" height="65" fill="#1e3a8a" />
      <rect x="60" y="38" width="18" height="72" fill="#065f46" />
      <rect x="80" y="48" width="16" height="62" fill="#92400e" />

      {/* Stack of Vintage Books on Desk */}
      <rect x="140" y="165" width="110" height="15" rx="2" fill="#854d0e" stroke="#ca8a04" strokeWidth="1" />
      <rect x="145" y="152" width="100" height="13" rx="2" fill="#1e40af" stroke="#60a5fa" strokeWidth="1" />
      <rect x="150" y="140" width="90" height="12" rx="2" fill="#991b1b" stroke="#f87171" strokeWidth="1" />

      {/* Open Fantasy Novel with Floating Text Page */}
      <path d="M 160 140 Q 190 135 220 140 L 220 120 Q 190 115 160 120 Z" fill="#fef3c7" />
      <path d="M 100 140 Q 130 135 160 140 L 160 120 Q 130 115 100 120 Z" fill="#fffbeb" />
      <line x1="110" y1="126" x2="150" y2="126" stroke="#78350f" strokeWidth="1.5" strokeDasharray="2 2" />
      <line x1="110" y1="131" x2="145" y2="131" stroke="#78350f" strokeWidth="1.5" strokeDasharray="2 2" />
      <line x1="170" y1="126" x2="210" y2="126" stroke="#78350f" strokeWidth="1.5" strokeDasharray="2 2" />

      {/* Desk Surface */}
      <rect x="0" y="178" width="300" height="22" fill="#292524" />
    </svg>
  );
}

// Artistic Vector Illustration 3: 24h Convenience Store Window in Rain
export function PolaroidConvenienceArt() {
  return (
    <svg viewBox="0 0 300 200" width="100%" height="100%" style={{ borderRadius: "6px" }}>
      <defs>
        <linearGradient id="rainBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#020617" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <linearGradient id="neonWindow" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.4" />
          <stop offset="50%" stopColor="#a855f7" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#34d399" stopOpacity="0.4" />
        </linearGradient>
      </defs>

      <rect width="300" height="200" fill="url(#rainBg)" />

      {/* Store Window Light */}
      <rect x="20" y="20" width="260" height="150" rx="8" fill="url(#neonWindow)" stroke="#38bdf8" strokeWidth="2" />
      <rect x="30" y="10" width="120" height="18" rx="3" fill="#10b981" />
      <text x="90" y="23" fontSize="10" fill="#ffffff" textAnchor="middle" fontWeight="bold">24H OPEN</text>

      {/* Rain Streaks on Window */}
      <line x1="40" y1="30" x2="35" y2="80" stroke="#ffffff" strokeWidth="1.5" opacity="0.4" strokeDasharray="10 5" />
      <line x1="80" y1="40" x2="75" y2="120" stroke="#ffffff" strokeWidth="1.5" opacity="0.3" strokeDasharray="15 8" />
      <line x1="140" y1="25" x2="135" y2="90" stroke="#ffffff" strokeWidth="1.5" opacity="0.5" strokeDasharray="8 6" />
      <line x1="210" y1="35" x2="205" y2="110" stroke="#ffffff" strokeWidth="1.5" opacity="0.4" strokeDasharray="12 6" />
      <line x1="250" y1="50" x2="245" y2="140" stroke="#ffffff" strokeWidth="1.5" opacity="0.3" strokeDasharray="10 5" />

      {/* Window Counter & Coffee Cup */}
      <rect x="20" y="135" width="260" height="35" fill="#1e293b" opacity="0.8" />
      <rect x="120" y="120" width="16" height="20" rx="3" fill="#ffffff" stroke="#cbd5e1" />
      <path d="M 128 115 Q 125 105 130 95" stroke="#f8fafc" strokeWidth="1.5" fill="none" opacity="0.6" />

      {/* Wet Road Reflection */}
      <rect x="0" y="170" width="300" height="30" fill="#020617" />
      <ellipse cx="150" cy="185" rx="100" ry="8" fill="#38bdf8" opacity="0.15" />
    </svg>
  );
}

// Authentic High-Detail Publisher Stamp / Red Wax Seal
export function AuthenticPublisherSeal({ status }: { status: "read" | "rejected" }) {
  const isRead = status === "read";
  return (
    <svg viewBox="0 0 140 140" width="110" height="110" style={{ transform: "rotate(-12deg)", filter: "drop-shadow(0 4px 10px rgba(185, 28, 28, 0.4))" }}>
      <defs>
        <radialGradient id="stampInkGrad" cx="40%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ef4444" />
          <stop offset="70%" stopColor="#b91c1c" />
          <stop offset="100%" stopColor="#7f1d1d" />
        </radialGradient>
        <filter id="noiseFilter">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="3" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>

      {/* Outer Double Stamp Ring with Weathered Filter */}
      <circle cx="70" cy="70" r="62" fill="none" stroke="#b91c1c" strokeWidth="4" filter="url(#noiseFilter)" />
      <circle cx="70" cy="70" r="54" fill="none" stroke="#b91c1c" strokeWidth="2" strokeDasharray="8 3" />

      {/* Center Wax Seal Solid Circle */}
      <circle cx="70" cy="70" r="46" fill="url(#stampInkGrad)" opacity="0.15" />

      {/* Star / Crest Ornament */}
      <polygon points="70,36 73,44 81,44 75,49 77,57 70,52 63,57 65,49 59,44 67,44" fill="#b91c1c" />

      {/* Calligraphy Seal Text */}
      <text x="70" y="78" fill="#b91c1c" fontSize="24" fontFamily="'Kaiti', 'STKaiti', serif" fontWeight="900" textAnchor="middle">
        {isRead ? "已 阅" : "退 稿"}
      </text>

      <text x="70" y="96" fill="#991b1b" fontSize="8" fontFamily="sans-serif" letterSpacing="2" textAnchor="middle" fontWeight="bold">
        FIRST PUBLISHER
      </text>
    </svg>
  );
}
