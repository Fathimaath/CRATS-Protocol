import React from 'react';
import { motion } from 'framer-motion';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function Card({ children, className = '', onClick }: CardProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={onClick ? { scale: 1.02 } : {}}
      onClick={onClick}
      className={`bg-white rounded-2xl shadow-card hover:shadow-hover border border-slate-100 p-6 ${onClick ? 'cursor-pointer' : ''} ${className}`}
    >
      {children}
    </motion.div>
  );
}

export function Button({ 
  children, 
  onClick, 
  variant = 'primary', 
  disabled = false,
  className = '',
  type = 'button'
}: { 
  type?: 'button' | 'submit' | 'reset',
  children: React.ReactNode, 
  onClick?: () => void, 
  variant?: 'primary' | 'secondary' | 'outline',
  disabled?: boolean,
  className?: string
}) {
  const baseStyle = "px-6 py-3 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2";
  
  const variants = {
    primary: "bg-slate-900 hover:bg-slate-800 text-white shadow-md disabled:bg-slate-300",
    secondary: "bg-indigo-50 hover:bg-indigo-100 text-indigo-700 disabled:opacity-50",
    outline: "border border-slate-200 hover:bg-slate-50 text-slate-800 disabled:opacity-50"
  };

  return (
    <button 
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
}
