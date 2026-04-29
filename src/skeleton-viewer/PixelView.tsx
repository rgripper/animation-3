import { useEffect, useRef } from "react";
import * as THREE from "three";
import { SPRITE_DIRS, LOOK_TARGET } from "./spriteExport";

interface Props {
  sceneRef: React.RefObject<THREE.Scene | null>;
  directionIndex: number;
  frameSize?: number;
}

export function PixelView({ sceneRef, directionIndex, frameSize = 64 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dirIndexRef = useRef(directionIndex);

  // Keep dirIndexRef in sync without recreating the renderer
  useEffect(() => {
    dirIndexRef.current = directionIndex;
  }, [directionIndex]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true });
    renderer.setSize(frameSize, frameSize);
    renderer.setClearColor(0x000000, 0);

    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    const gl = renderer.getContext();
    const raw = new Uint8Array(frameSize * frameSize * 4);

    let rafId: number;
    const loop = () => {
      rafId = requestAnimationFrame(loop);
      const scene = sceneRef.current;
      if (!scene) return;

      const dir = SPRITE_DIRS[dirIndexRef.current];
      if (!dir) return;
      camera.position.set(dir.pos[0], dir.pos[1], dir.pos[2]);
      camera.lookAt(LOOK_TARGET);

      renderer.render(scene, camera);

      gl.readPixels(0, 0, frameSize, frameSize, gl.RGBA, gl.UNSIGNED_BYTE, raw);

      // Flip Y (WebGL = bottom-up, canvas = top-down)
      const img = ctx.createImageData(frameSize, frameSize);
      for (let y = 0; y < frameSize; y++) {
        const src = (frameSize - 1 - y) * frameSize * 4;
        const dst = y * frameSize * 4;
        img.data.set(raw.subarray(src, src + frameSize * 4), dst);
      }
      ctx.putImageData(img, 0, 0);
    };
    loop();

    return () => {
      cancelAnimationFrame(rafId);
      renderer.dispose();
    };
  }, [sceneRef, frameSize]); // renderer created once; direction handled via ref

  const displaySize = frameSize * 3; // 192px at 64px native = crisp 3×

  return (
    <canvas
      ref={canvasRef}
      width={frameSize}
      height={frameSize}
      style={{
        width: displaySize,
        height: displaySize,
        imageRendering: "pixelated",
        display: "block",
        border: "1px solid #444",
      }}
    />
  );
}
