import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'

export default function BingParticlesBackground() {
    const canvasRef = useRef<HTMLCanvasElement>(null)

    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        let width = (canvas.width = window.innerWidth)
        let height = (canvas.height = window.innerHeight)

        const particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number }[] = []
        const particleCount = 100

        for (let i = 0; i < particleCount; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.5,
                vy: (Math.random() - 0.5) * 0.5,
                size: Math.random() * 2 + 1,
                alpha: Math.random() * 0.5 + 0.1
            })
        }

        const draw = () => {
            ctx.clearRect(0, 0, width, height)

            // Update and draw particles
            ctx.fillStyle = 'white'
            particles.forEach(p => {
                p.x += p.vx
                p.y += p.vy

                if (p.x < 0) p.x = width
                if (p.x > width) p.x = 0
                if (p.y < 0) p.y = height
                if (p.y > height) p.y = 0

                ctx.globalAlpha = p.alpha
                ctx.beginPath()
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
                ctx.fill()
            })

            requestAnimationFrame(draw)
        }

        const handleResize = () => {
            width = canvas.width = window.innerWidth
            height = canvas.height = window.innerHeight
        }

        window.addEventListener('resize', handleResize)
        const animationId = requestAnimationFrame(draw)

        return () => {
            window.removeEventListener('resize', handleResize)
            cancelAnimationFrame(animationId)
        }
    }, [])

    return (
        <div className='fixed inset-0 z-0 overflow-hidden'>
            <div
                className='absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000'
                style={{
                    backgroundImage: 'url(https://api.dujin.org/bing/1920.php)',
                    filter: 'brightness(0.7)' // Darken background slightly for better text contrast
                }}
            />
            <motion.canvas
                ref={canvasRef}
                className='absolute inset-0 pointer-events-none'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.5 }}
            />
        </div>
    )
}
