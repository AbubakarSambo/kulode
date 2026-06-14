import React from 'react';

interface LogoProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  variant?: 'default' | 'inverted';
}

export const Logo: React.FC<LogoProps> = ({
  variant = 'default',
  alt = 'Tari1 Logo',
  className = 'h-10 w-auto',
  ...props
}) => {
  const src = variant === 'inverted' ? '/logo-white.png' : '/logo.png';
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      {...props}
    />
  );
};
