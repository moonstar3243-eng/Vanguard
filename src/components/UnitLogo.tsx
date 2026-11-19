import React from 'react';
import { UnitType } from '../types/game';

interface UnitLogoProps {
  type: UnitType;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  faction?: 'neutral' | 'player' | 'enemy';
  className?: string;
}

interface UnitPalette {
  bg: string;
  border: string;
  accent: string;
  ink: string;
  shape: 'shield' | 'hex' | 'naval' | 'aero';
}

export const UNIT_LOGO_PALETTES: Record<UnitType, UnitPalette> = {
  riflemen: {
    bg: '#0E1C2F',
    border: '#38BDF8',
    accent: '#7DD3FC',
    ink: '#F8FAFC',
    shape: 'shield',
  },
  anti_tank: {
    bg: '#0C241E',
    border: '#10B981',
    accent: '#6EE7B7',
    ink: '#ECFDF5',
    shape: 'shield',
  },
  mechanized: {
    bg: '#0D2229',
    border: '#06B6D4',
    accent: '#67E8F9',
    ink: '#ECFEFF',
    shape: 'hex',
  },
  mbt: {
    bg: '#261A0A',
    border: '#F59E0B',
    accent: '#FCD34D',
    ink: '#FFFBEB',
    shape: 'hex',
  },
  howitzer: {
    bg: '#291210',
    border: '#EF4444',
    accent: '#FCA5A5',
    ink: '#FEF2F2',
    shape: 'hex',
  },
  commandos: {
    bg: '#1F122B',
    border: '#A855F7',
    accent: '#D8B4FE',
    ink: '#FAF5FF',
    shape: 'shield',
  },
  frigate: {
    bg: '#0D1E36',
    border: '#3B82F6',
    accent: '#93C5FD',
    ink: '#EFF6FF',
    shape: 'naval',
  },
  destroyer: {
    bg: '#0A2239',
    border: '#0EA5E9',
    accent: '#7DD3FC',
    ink: '#F0F9FF',
    shape: 'naval',
  },
  carrier: {
    bg: '#161838',
    border: '#6366F1',
    accent: '#A5B4FC',
    ink: '#EEF2FF',
    shape: 'naval',
  },
  interceptor: {
    bg: '#0B2424',
    border: '#14B8A6',
    accent: '#5EEAD4',
    ink: '#F0FDFA',
    shape: 'aero',
  },
  gunship: {
    bg: '#142616',
    border: '#22C55E',
    accent: '#86EFAC',
    ink: '#F0FDF4',
    shape: 'aero',
  },
  bomber: {
    bg: '#24200E',
    border: '#EAB308',
    accent: '#FDE047',
    ink: '#FEFCE8',
    shape: 'aero',
  },
};

const SIZE_PX: Record<NonNullable<UnitLogoProps['size']>, number> = {
  xs: 18,
  sm: 24,
  md: 36,
  lg: 48,
};

/**
 * Pure vector glyph paths drawn inside a 0..24 coordinate box.
 * Shared between standalone HTML <UnitLogo /> badges and inline SVG World Map emblems.
 */
export const renderUnitInsigniaGlyph = (
  type: UnitType,
  ink: string,
  accent: string
): React.ReactNode => {
  switch (type) {
    case 'riflemen':
      return (
        <g>
          {/* Crossed tactical rifles + infantry chevron */}
          <path
            d="M6.5 17.5 L17.5 6.5 M17.5 17.5 L6.5 6.5"
            stroke={ink}
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path d="M5.5 18.5 L8.2 15.8 M18.5 18.5 L15.8 15.8" stroke={accent} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M8.5 6.5 L12 4.2 L15.5 6.5" fill="none" stroke={accent} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      );
    case 'anti_tank':
      return (
        <g>
          {/* Anti-tank rocket & armor-piercing chevron */}
          <path d="M5.5 16.5 L16 6" stroke={ink} strokeWidth="2.2" strokeLinecap="round" />
          <polygon points="18.8,4.2 14,5.4 17.6,9" fill={accent} />
          <path d="M6.5 12.5 L11.5 17.5" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M10 18.5 H18.5" stroke={ink} strokeWidth="1.6" strokeLinecap="round" strokeDasharray="2 1.5" />
        </g>
      );
    case 'mechanized':
      return (
        <g>
          {/* IFV chassis, turret & 4 road wheels */}
          <path d="M4.5 14 L6.5 10.5 H15.5 L19 14 Z" fill={ink} />
          <rect x="9" y="8" width="5.5" height="2.6" rx="0.6" fill={accent} />
          <path d="M14.5 9.2 H20.5" stroke={accent} strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="7" cy="16.2" r="1.4" fill={accent} />
          <circle cx="10.4" cy="16.2" r="1.4" fill={accent} />
          <circle cx="13.8" cy="16.2" r="1.4" fill={accent} />
          <circle cx="17.2" cy="16.2" r="1.4" fill={accent} />
        </g>
      );
    case 'mbt':
      return (
        <g>
          {/* Heavy Main Battle Tank silhouette */}
          <rect x="4" y="13.8" width="16" height="3.6" rx="1.8" fill={accent} />
          <path d="M5.5 13.8 L7.5 10.2 H15 L17.5 13.8 Z" fill={ink} />
          <path d="M8.8 10.2 L10 7.6 H14.8 L15.8 10.2 Z" fill={ink} />
          <path d="M15.4 8.8 H21.2" stroke={accent} strokeWidth="2" strokeLinecap="round" />
        </g>
      );
    case 'howitzer':
      return (
        <g>
          {/* Elevated 155mm artillery piece & trajectory arc */}
          <path d="M5 17.5 H18.5" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="11" cy="15.5" r="2.3" fill="none" stroke={ink} strokeWidth="1.8" />
          <path d="M11 14 L18.8 6.5" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
          <path d="M6.2 17.5 L10 14.8" stroke={ink} strokeWidth="1.8" strokeLinecap="round" />
          <path d="M14.5 5 Q17.5 4 19.5 5.2" fill="none" stroke={accent} strokeWidth="1.3" strokeDasharray="1.5 1.5" />
        </g>
      );
    case 'commandos':
      return (
        <g>
          {/* Special Ops dagger + winged lightning */}
          <polygon points="12,3.8 14,13.5 10,13.5" fill={ink} />
          <path d="M8.2 13.8 H15.8 M12 13.8 V19.5" stroke={accent} strokeWidth="2" strokeLinecap="round" />
          <path d="M5 10.5 L8.5 8.5 M19 10.5 L15.5 8.5" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
        </g>
      );
    case 'frigate':
      return (
        <g>
          {/* Guided-missile frigate profile */}
          <path d="M4 15 H19.5 L17.2 18 H6.2 Z" fill={ink} />
          <path d="M8.5 15 V11 H13.5 V15" fill={accent} />
          <path d="M11 11 V6.8 M9.2 8.6 H12.8" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M15.2 14.8 L17.6 12.2" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
        </g>
      );
    case 'destroyer':
      return (
        <g>
          {/* Aegis guided destroyer hull + twin radar + mast */}
          <path d="M3.5 15 H20.5 L18 18.2 H5.5 Z" fill={ink} />
          <path d="M7.5 15 L8.8 10.4 H14.8 L15.6 15 Z" fill={accent} />
          <path d="M11.6 10.4 V5.8 M9.6 7.5 H13.6" stroke={ink} strokeWidth="1.5" strokeLinecap="round" />
          <path d="M5.5 14.5 L7.2 13 M16.8 14.5 L18.5 13" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
        </g>
      );
    case 'carrier':
      return (
        <g>
          {/* Aircraft carrier top-angled flight deck */}
          <polygon points="4.5,14.8 18.5,8 20.5,11.6 7,18.2" fill={ink} />
          <line x1="6.8" y1="15.8" x2="18.2" y2="10.2" stroke={accent} strokeWidth="1.3" strokeDasharray="2 1.4" />
          <rect x="13" y="6.8" width="3.2" height="2.6" rx="0.5" fill={accent} />
        </g>
      );
    case 'interceptor':
      return (
        <g>
          {/* Swept stealth fighter jet */}
          <polygon points="12,4 14,10 20,14.5 14,15 14.5,18.8 12,17.2 9.5,18.8 10,15 4,14.5 10,10" fill={ink} />
          <line x1="12" y1="6.5" x2="12" y2="15" stroke={accent} strokeWidth="1.4" strokeLinecap="round" />
        </g>
      );
    case 'gunship':
      return (
        <g>
          {/* Attack helicopter with twin rotor arc & fuselage */}
          <line x1="4.5" y1="7" x2="19.5" y2="7" stroke={accent} strokeWidth="1.8" strokeLinecap="round" />
          <line x1="12" y1="7" x2="12" y2="10.2" stroke={ink} strokeWidth="1.6" />
          <path d="M7 12.2 C7 10.2 13.5 10 16.5 12.2 L19.5 11.4 V13.8 L15.5 14.5 H8 Z" fill={ink} />
          <path d="M8 16.5 H14.5 M9.5 14.5 L9 16.5 M13 14.5 L13.5 16.5" stroke={accent} strokeWidth="1.4" strokeLinecap="round" />
        </g>
      );
    case 'bomber':
      return (
        <g>
          {/* Heavy strategic flying-wing / swept bomber */}
          <polygon points="12,4.5 21,14.5 15.5,14.8 14,18.5 12,16.8 10,18.5 8.5,14.8 3,14.5" fill={ink} />
          <path d="M7.5 13 L12 9.2 L16.5 13" fill="none" stroke={accent} strokeWidth="1.5" strokeLinejoin="round" />
        </g>
      );
  }
};

export const renderLogoFrame = (
  shape: UnitPalette['shape'],
  bg: string,
  border: string
): React.ReactNode => {
  switch (shape) {
    case 'hex':
      return (
        <polygon
          points="12,1.5 21,6.5 21,17.5 12,22.5 3,17.5 3,6.5"
          fill={bg}
          stroke={border}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      );
    case 'naval':
      return (
        <path
          d="M4,3 H20 V13.5 C20,18 12,22 12,22 C12,22 4,18 4,13.5 Z"
          fill={bg}
          stroke={border}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      );
    case 'aero':
      return (
        <polygon
          points="12,1.5 22,12 12,22.5 2,12"
          fill={bg}
          stroke={border}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      );
    case 'shield':
    default:
      return (
        <path
          d="M4,2.8 H20 V12.5 C20,17.5 12,21.8 12,21.8 C12,21.8 4,17.5 4,12.5 Z"
          fill={bg}
          stroke={border}
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      );
  }
};

export const UnitLogo: React.FC<UnitLogoProps> = ({
  type,
  size = 'sm',
  faction = 'neutral',
  className = '',
}) => {
  const pal = UNIT_LOGO_PALETTES[type];
  const px = SIZE_PX[size];
  const bg =
    faction === 'player'
      ? '#3B0D12'
      : faction === 'enemy'
      ? '#0E1F3A'
      : pal.bg;
  const border =
    faction === 'player'
      ? '#F87171'
      : faction === 'enemy'
      ? '#60A5FA'
      : pal.border;

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      {renderLogoFrame(pal.shape, bg, border)}
      {renderUnitInsigniaGlyph(type, pal.ink, pal.accent)}
    </svg>
  );
};
