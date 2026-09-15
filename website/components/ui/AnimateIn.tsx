'use client';

import { motion, type Variants } from 'framer-motion';

type AnimateInProps = {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'none';
};

const variants: Variants = {
  hidden: { opacity: 0, y: 18 },
  visible: { opacity: 1, y: 0 },
};

const variantsNoMove: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

export function AnimateIn({ children, className, delay = 0, direction = 'up' }: AnimateInProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: '-80px' }}
      variants={direction === 'up' ? variants : variantsNoMove}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
