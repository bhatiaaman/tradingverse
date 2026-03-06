'use client';

import React from 'react';

export default function Card({ title, right, children, className = '' }) {
  return (
    <div
      className={`rounded-2xl border border-white/10 
                  bg-slate-900/60 backdrop-blur
                  shadow-sm hover:shadow-md transition
                  ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <h3 className="text-sm font-semibold text-slate-200">
            {title}
          </h3>
          {right}
        </div>
      )}
      <div className="p-4 text-sm text-slate-300">
        {children}
      </div>
    </div>
  );
}