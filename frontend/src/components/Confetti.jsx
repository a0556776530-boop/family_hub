import { useCallback, useRef } from 'react'

const COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#10b981', '#ef4444', '#ec4899', '#f97316']

function createParticle(container) {
  const el    = document.createElement('div')
  const color = COLORS[Math.floor(Math.random() * COLORS.length)]
  const size  = Math.random() * 8 + 5
  const isRect = Math.random() > 0.5

  Object.assign(el.style, {
    position:        'fixed',
    width:           `${size}px`,
    height:          isRect ? `${size * 0.4}px` : `${size}px`,
    background:      color,
    borderRadius:    isRect ? '2px' : '50%',
    left:            `${Math.random() * 100}vw`,
    top:             '-10px',
    zIndex:          9999,
    pointerEvents:   'none',
    transform:       `rotate(${Math.random() * 360}deg)`,
    opacity:         1,
  })

  container.appendChild(el)

  const duration = Math.random() * 2000 + 1500
  const endX     = (Math.random() - 0.5) * 300
  const rotation = (Math.random() - 0.5) * 720

  el.animate([
    { transform: `translateY(0) translateX(0) rotate(0deg)`, opacity: 1 },
    { transform: `translateY(100vh) translateX(${endX}px) rotate(${rotation}deg)`, opacity: 0 },
  ], { duration, easing: 'cubic-bezier(0.25,0.46,0.45,0.94)', fill: 'forwards' })
    .onfinish = () => el.remove()
}

export function useConfetti() {
  const containerRef = useRef(null)

  return useCallback(() => {
    if (!containerRef.current) {
      containerRef.current = document.createElement('div')
      document.body.appendChild(containerRef.current)
    }
    const count = 60
    for (let i = 0; i < count; i++) {
      setTimeout(() => createParticle(containerRef.current), i * 25)
    }
  }, [])
}
