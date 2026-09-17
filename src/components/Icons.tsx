//
// AthenaPhone - Open Source SIP Softphone
//
// Copyright (C) 2026 Tom Cully <mail@tomcully.com>
// Licensed under the GNU GPLv3 - see <https://www.gnu.org/licenses/gpl-3.0.html>
//

import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from '../theme';

export interface IconProps {
  size?: number;
  color?: string;
}

/**
 * Hand-drawn 24-grid glyphs rather than an icon font, following
 * `macha-client-rn`: the set is small, it keeps a whole typeface out of the
 * bundle, and every glyph can be tuned to the same optical weight.
 */
function icon(path: string) {
  return function Icon({ size = 24, color = colors.text }: IconProps) {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
        <Path
          d={path}
          stroke={color}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    );
  };
}

// ------------------------------------------------------------ navigation

/** The dialpad, as its own three-by-four grid of keys. */
export function KeypadIcon({ size = 24, color = colors.text }: IconProps) {
  const columns = [6, 12, 18];
  const rows = [5, 11, 17];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {rows.map(cy =>
        columns.map(cx => (
          <Circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1.5} fill={color} />
        )),
      )}
      <Circle cx={12} cy={22} r={1.5} fill={color} />
    </Svg>
  );
}

export const ClockIcon = icon(
  'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3.5 2',
);
export const ContactsIcon = icon(
  'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0',
);
export const SettingsIcon = icon(
  'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
);

// ------------------------------------------------------------------ calls

/** The handset, tilted as it is on every phone since 1993. */
export const PhoneIcon = icon(
  'M6.6 3.5 4.2 6a2 2 0 0 0-.4 2.2c1 2.4 2.6 4.6 4.5 6.5s4.1 3.5 6.5 4.5a2 2 0 0 0 2.2-.4l2.5-2.4a1 1 0 0 0 0-1.4l-3-2.4a1 1 0 0 0-1.3 0l-1.5 1.2a14 14 0 0 1-5-5l1.2-1.5a1 1 0 0 0 0-1.3L8 3.5a1 1 0 0 0-1.4 0z',
);
/** The same handset, turned down. */
export const PhoneDownIcon = icon(
  'M3 14.5c5-4 13-4 18 0M8 12.8 6.4 15 3 14.5M16 12.8l1.6 2.2 3.4-.5M3 6l18 12',
);
export const MicIcon = icon(
  'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM5 12a7 7 0 0 0 14 0M12 19v2',
);
export const MicOffIcon = icon(
  'M3 3l18 18M9 9v3a3 3 0 0 0 4.6 2.5M15 11.5V6a3 3 0 0 0-5.8-1M5 12a7 7 0 0 0 10.3 6.2M19 12a7 7 0 0 1-.4 2.2M12 19v2',
);
export const SpeakerIcon = icon(
  'M4 9v6h3.5L12 19V5L7.5 9zM16 9.5a3.5 3.5 0 0 1 0 5M18.5 7a7 7 0 0 1 0 10',
);
export const EarpieceIcon = icon(
  'M4 9v6h3.5L12 19V5L7.5 9zM16 9.5a3.5 3.5 0 0 1 0 5',
);
export const PauseIcon = icon('M9 5v14M15 5v14');
export const TransferIcon = icon('M4 8h12M12 4l4 4-4 4M20 16H8M12 12l-4 4 4 4');
export const VideoIcon = icon('M4 7h11v10H4zM15 11l5-3v8l-5-3');
export const VideoOffIcon = icon('M3 3l18 18M4 7h8M15 11l5-3v8M15 17H4V9');
export const CameraFlipIcon = icon(
  'M20 17V9h-3.5L15 6.5h-6L7.5 9H4v8zM9.5 13a2.5 2.5 0 0 1 4.3-1.7M14.5 13a2.5 2.5 0 0 1-4.3 1.7M13.8 9.8V11.3h-1.5M10.2 16.2v-1.5h1.5',
);
export const PlusIcon = icon('M12 5v14M5 12h14');
export const SearchIcon = icon(
  'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
);
export const TrashIcon = icon(
  'M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13M10 11v6M14 11v6',
);
export const BackspaceIcon = icon('M9 5h11v14H9L3 12zM12 9.5l5 5M17 9.5l-5 5');
export const ChevronLeftIcon = icon('M15 5 8 12l7 7');
export const CloseIcon = icon('M6 6l12 12M18 6 6 18');
export const StarIcon = icon(
  'M12 4l2.4 5 5.6.8-4 3.9 1 5.5-5-2.6-5 2.6 1-5.5-4-3.9 5.6-.8z',
);
