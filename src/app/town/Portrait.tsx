import { useEffect, useRef } from 'react';
import { drawPerson, type PersonLook } from '@/town/art';

/** 像素人物頭像：把 16×16 的人物放大 */
export function Portrait({ look }: { look: PersonLook }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current!.getContext('2d')!;
    ctx.clearRect(0, 0, 16, 16);
    drawPerson(ctx, 0, 0, 'down', 0, look);
  }, [look]);
  return <canvas ref={ref} width={16} height={16} className="portrait" aria-hidden="true" />;
}
