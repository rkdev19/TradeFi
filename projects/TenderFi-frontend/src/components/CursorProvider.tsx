import { useState, useEffect } from 'react';

export function CursorProvider({ children }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e) => {
      setMousePos({ x: e.clientX, y: e.clientY });
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  return (
    <>
      {children}
      <div 
        className="fixed w-2 h-2 bg-violet-400 rounded-full pointer-events-none z-50 mix-blend-difference transition-all duration-100"
        style={{ left: mousePos.x - 4, top: mousePos.y - 4 }}
      />
    </>
  );
}