"use client"
import { useRef, useEffect, useState } from "react"

interface AnimatedSectionProps {
  children: React.ReactNode
  className?: string
  animationClass?: string // e.g. 'animate-fade-in-up'
  delay?: number // ms
  threshold?: number // IntersectionObserver threshold
}

export default function AnimatedSection({
  children,
  className = "",
  animationClass = "animate-fade-in-up",
  delay = 0,
  threshold = 0.8,
}: AnimatedSectionProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const node = ref.current;
    if (!node) return;
    if (typeof window.IntersectionObserver !== 'function') return;
    const observer = new window.IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => setVisible(true), delay);
          observer.disconnect();
        }
      },
      { threshold }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [delay, threshold]);

  return (
    <div
      ref={ref}
      className={
        `${className} transition-opacity duration-1000 ${visible ? `${animationClass} opacity-100` : 'opacity-0 translate-y-8'}`
      }
    >
      {children}
    </div>
  )
}
