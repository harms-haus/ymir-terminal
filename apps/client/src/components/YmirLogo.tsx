import React from 'react';

interface YmirLogoProps {
  size?: number;
}

export function YmirLogo({ size = 120 }: YmirLogoProps) {
  return (
    <svg
      data-testid="ymir-logo"
      width={size}
      height={size}
      viewBox="0 0 264.80392 264.80399"
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect width="264.80392" height="264.80399" rx="52.960785" fill="#000000" />
      <path
        d="m 131.80788,165.98852 -36.097221,62.51487 H 59.768327 L 114.75687,133.31379 62.641067,43.194595 H 98.927586 L 131.80788,100.35733 164.68817,43.194595 h 36.28652 L 148.85889,133.31379 205.03559,228.50339 H 169.09332 Z"
        fill="#ffffff"
      />
    </svg>
  );
}
