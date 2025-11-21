import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  isLoading, 
  icon,
  className = '',
  ...props 
}) => {
  
  const baseStyles = "relative overflow-hidden font-mono font-bold tracking-wider uppercase transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-neonBlue text-black hover:bg-white hover:shadow-[0_0_15px_rgba(0,243,255,0.5)] border border-transparent",
    secondary: "bg-transparent border border-white/20 text-white hover:bg-white/10 hover:border-white/40 backdrop-blur-sm",
    ghost: "bg-transparent text-gray-400 hover:text-white hover:bg-white/5",
    danger: "bg-red-500/20 border border-red-500/50 text-red-200 hover:bg-red-500/40"
  };

  const sizes = {
    sm: "text-xs px-3 py-1.5 rounded-sm",
    md: "text-sm px-6 py-3 rounded-md",
    lg: "text-base px-8 py-4 rounded-lg",
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && (
        <svg className="animate-spin -ml-1 mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      )}
      {!isLoading && icon}
      <span className="z-10">{children}</span>
    </button>
  );
};