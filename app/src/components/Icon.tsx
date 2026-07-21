import React from 'react';
import Svg, { Circle, Path } from 'react-native-svg';

export type IconName =
  | 'heart'
  | 'heartFilled'
  | 'comment'
  | 'send'
  | 'search'
  | 'plus'
  | 'home'
  | 'homeFilled'
  | 'profile'
  | 'chevronLeft'
  | 'moreDots'
  | 'checkBadge'
  | 'barChart'
  | 'star'
  | 'mail'
  | 'volumeOn'
  | 'volumeOff'
  | 'play'
  | 'arrowRight'
  | 'bell'
  | 'lightning'
  | 'bookmark'
  | 'bookmarkFilled'
  | 'trophy';

interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
}

export function Icon({ name, size = 22, color = '#000000', strokeWidth = 1.8 }: IconProps) {
  switch (name) {
    case 'heart':
      return (
        <Svg width={size} height={(size * 22) / 24} viewBox="0 0 24 22">
          <Path
            d="M12 20S2 14 2 7.5C2 4 4.5 2 7.5 2c2 0 3.5 1 4.5 2.5C13 3 14.5 2 16.5 2 19.5 2 22 4 22 7.5 22 14 12 20 12 20Z"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'heartFilled':
      return (
        <Svg width={size} height={(size * 22) / 24} viewBox="0 0 24 22">
          <Path d="M12 20S2 14 2 7.5C2 4 4.5 2 7.5 2c2 0 3.5 1 4.5 2.5C13 3 14.5 2 16.5 2 19.5 2 22 4 22 7.5 22 14 12 20 12 20Z" fill={color} />
        </Svg>
      );
    case 'comment':
      return (
        <Svg width={size} height={(size * 22) / 24} viewBox="0 0 24 22">
          <Path d="M2 3h20v13H8l-6 5V3Z" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </Svg>
      );
    case 'send':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 12 20 4l-5 18-3-8-8-2Z" fill={color} />
        </Svg>
      );
    case 'search':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="11" cy="11" r="7" fill="none" stroke={color} strokeWidth={strokeWidth} />
          <Path d="M16.2 16.2 21 21" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );
    case 'plus':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 4v16M4 12h16" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
        </Svg>
      );
    case 'home':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 11 12 4l8 7v9h-6v-6h-4v6H4v-9Z" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </Svg>
      );
    case 'homeFilled':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 11 12 4l8 7v9h-6v-6h-4v6H4v-9Z" fill={color} />
        </Svg>
      );
    case 'profile':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="8" r="4" fill="none" stroke={color} strokeWidth={strokeWidth} />
          <Path d="M4 20c1.5-4 4.5-6 8-6s6.5 2 8 6" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );
    case 'chevronLeft':
      return (
        <Svg width={size} height={(size * 20) / 12} viewBox="0 0 12 20">
          <Path d="M10 2 2 10l8 8" stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'moreDots':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Circle cx="12" cy="5" r="1.8" fill={color} />
          <Circle cx="12" cy="12" r="1.8" fill={color} />
          <Circle cx="12" cy="19" r="1.8" fill={color} />
        </Svg>
      );
    case 'checkBadge':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M12 2l2.6 1.5 3-.3 1.2 2.8 2.8 1.2-.3 3L23 12l-1.7 2.6.3 3-2.8 1.2-1.2 2.8-3-.3L12 23l-2.6-1.7-3 .3-1.2-2.8-2.8-1.2.3-3L1 12l1.7-2.6-.3-3 2.8-1.2 1.2-2.8 3 .3L12 2Z"
            fill={color}
          />
          <Path d="M8.5 12.2l2.4 2.4 4.6-5.2" stroke="#fff" strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'barChart':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 20V10M12 20V4M20 20v-7" stroke={color} strokeWidth={2.2} strokeLinecap="round" />
        </Svg>
      );
    case 'star':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M12 2 14.5 9H21l-5.2 4.3L17.8 21 12 16.8 6.2 21l2-7.7L3 9h6.5L12 2Z" fill={color} />
        </Svg>
      );
    case 'mail':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 4h13l3 3v13H4V4Z" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
          <Path d="M8 9h8M8 13h5" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );
    case 'volumeOn':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 9v6h4l5 5V4L8 9H4Z" fill={color} />
          <Path d="M16.5 9a3.5 3.5 0 0 1 0 6" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />
          <Path d="M19 6.5a7 7 0 0 1 0 11" stroke={color} strokeWidth={1.8} fill="none" strokeLinecap="round" />
        </Svg>
      );
    case 'volumeOff':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M4 9v6h4l5 5V4L8 9H4Z" fill={color} />
          <Path d="M16 9.5 21 14.5M21 9.5 16 14.5" stroke={color} strokeWidth={1.8} strokeLinecap="round" />
        </Svg>
      );
    case 'play':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M6 4v16l14-8L6 4Z" fill={color} />
        </Svg>
      );
    case 'arrowRight':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      );
    case 'bell':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M6 10a6 6 0 0 1 12 0v4l1.5 3h-15L6 14v-4Z"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <Path d="M10 20a2 2 0 0 0 4 0" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
        </Svg>
      );
    case 'lightning':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" fill={color} />
        </Svg>
      );
    case 'bookmark':
      return (
        <Svg width={size} height={(size * 20) / 17} viewBox="0 0 17 20">
          <Path d="M1.5 1.5h14v17l-7-4.5-7 4.5v-17Z" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </Svg>
      );
    case 'bookmarkFilled':
      return (
        <Svg width={size} height={(size * 20) / 17} viewBox="0 0 17 20">
          <Path d="M1.5 1.5h14v17l-7-4.5-7 4.5v-17Z" fill={color} />
        </Svg>
      );
    case 'trophy':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path
            d="M7 3h10v5a5 5 0 0 1-5 5 5 5 0 0 1-5-5V3Z"
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinejoin="round"
          />
          <Path d="M7 4H4v2a4 4 0 0 0 3.5 4M17 4h3v2a4 4 0 0 1-3.5 4" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
          <Path d="M12 13v3M9 20h6M10 17h4l1 3H9l1-3Z" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
        </Svg>
      );
    default:
      return null;
  }
}
