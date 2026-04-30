import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader.js";
import { isBone, addVisuals, strip } from "./boneVisuals";
import { PixelView } from "./PixelView";
import { exportSpritesheet, SPRITE_DIRS } from "./spriteExport";

type Status = "loading" | "ready" | "error";

export function SkeletonViewer() {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const clipRef = useRef<THREE.AnimationClip | null>(null);

  const [status, setStatus] = useState<Status>("loading");
  const [showPixel, setShowPixel] = useState(false);
  const [pixelDir, setPixelDir] = useState(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    // ── Scene ──────────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x16161e);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(
      45,
      mount.clientWidth / mount.clientHeight,
      0.1,
      100,
    );
    camera.position.set(0, 1.1, 3.0);
    camera.lookAt(0, 0.9, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mount.clientWidth, mount.clientHeight);
    mount.appendChild(renderer.domElement);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.40));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(3, 6, 4);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8899ff, 0.35);
    fill.position.set(-3, 2, -3);
    scene.add(fill);

    scene.add(new THREE.GridHelper(6, 12, 0x2a2a3a, 0x1e1e2a));

    // ── Load FBX ──────────────────────────────────────────────────────────
    new FBXLoader().load(
      "/walking.fbx",
      (fbx) => {
        fbx.scale.setScalar(0.01); // Mixamo uses centimetres
        scene.add(fbx);
        fbx.updateMatrixWorld(true);

        // Collect bones before adding visuals so newly added meshes
        // are never mistaken for bone children during addVisuals()
        const bones: THREE.Object3D[] = [];
        fbx.traverse((obj) => { if (isBone(obj)) bones.push(obj); });

        // Use LeftArm/RightArm (actual shoulder joints, not clavicle bases)
        // so torso capsule diameter equals the real shoulder span.
        let torsoRadius: number | undefined;
        const lArm = bones.find(b => strip(b.name) === "LeftArm");
        const rArm = bones.find(b => strip(b.name) === "RightArm");
        if (lArm && rArm) {
          const lPos = new THREE.Vector3();
          const rPos = new THREE.Vector3();
          lArm.getWorldPosition(lPos);
          rArm.getWorldPosition(rPos);
          torsoRadius = lPos.distanceTo(rPos) / 2; // half shoulder span = capsule radius
        }

        bones.forEach(b => addVisuals(b, torsoRadius));

        if (fbx.animations.length > 0) {
          const clip = fbx.animations[0]!;
          // Remove Hips translation track — keeps the walk in-place
          clip.tracks = clip.tracks.filter(
            (t) => !(t.name.toLowerCase().includes("hips") && t.name.endsWith(".position")),
          );
          clipRef.current = clip;
          const mixer = new THREE.AnimationMixer(fbx);
          mixer.clipAction(clip).play();
          mixerRef.current = mixer;
        }

        setStatus("ready");
      },
      undefined,
      () => setStatus("error"),
    );

    // ── Render loop ────────────────────────────────────────────────────────
    const clock = new THREE.Clock();
    let rafId: number;
    const loop = () => {
      rafId = requestAnimationFrame(loop);
      mixerRef.current?.update(clock.getDelta());
      renderer.render(scene, camera);
    };
    loop();

    // ── Resize ────────────────────────────────────────────────────────────
    const onResize = () => {
      camera.aspect = mount.clientWidth / mount.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(mount.clientWidth, mount.clientHeight);
    };
    const ro = new ResizeObserver(onResize);
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      mount.removeChild(renderer.domElement);
      renderer.dispose();
      sceneRef.current = null;
    };
  }, []);

  function handleExport() {
    const scene = sceneRef.current;
    const mixer = mixerRef.current;
    const clip = clipRef.current;
    if (scene && mixer && clip) exportSpritesheet(scene, mixer, clip);
  }

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative", background: "#16161e" }}>
      <div ref={mountRef} style={{ width: "100%", height: "100%" }} />

      {status === "loading" && (
        <div style={overlayStyle}>Loading skeleton…</div>
      )}
      {status === "error" && (
        <div style={{ ...overlayStyle, color: "#ff6666" }}>Failed to load Walking.fbx</div>
      )}

      {/* ── Pixel preview panel (top-right) ─────────────────────────────── */}
      {showPixel && status === "ready" && (
        <div style={panelStyle}>
          <div style={panelLabelStyle}>Pixel Preview · 64×64</div>
          <PixelView sceneRef={sceneRef} directionIndex={pixelDir} />
          <div style={{ display: "flex", gap: 4, marginTop: 8 }}>
            {SPRITE_DIRS.map((d, i) => (
              <button
                key={d.label}
                onClick={() => setPixelDir(i)}
                style={dirBtnStyle(i === pixelDir)}
              >
                {d.label}
              </button>
            ))}
          </div>
          <button onClick={handleExport} style={exportBtnStyle}>
            Export Spritesheet
          </button>
        </div>
      )}

      {/* ── Controls (bottom-left) ──────────────────────────────────────── */}
      {status === "ready" && (
        <div style={controlsStyle}>
          <label style={checkboxLabelStyle}>
            <input
              type="checkbox"
              checked={showPixel}
              onChange={(e) => setShowPixel(e.target.checked)}
            />
            Pixel View
          </label>
        </div>
      )}
    </div>
  );
}

// ── Inline styles ────────────────────────────────────────────────────────────

const overlayStyle: React.CSSProperties = {
  position: "absolute", inset: 0,
  display: "flex", alignItems: "center", justifyContent: "center",
  color: "#aaaacc", fontSize: "1.1rem",
};

const panelStyle: React.CSSProperties = {
  position: "absolute", top: 16, right: 16,
  background: "rgba(10,10,20,0.85)",
  padding: 12, borderRadius: 8,
  border: "1px solid #2a2a4a",
  backdropFilter: "blur(4px)",
};

const panelLabelStyle: React.CSSProperties = {
  color: "#7788aa", fontSize: 11, marginBottom: 8, textAlign: "center",
};

const dirBtnStyle = (active: boolean): React.CSSProperties => ({
  flex: 1, fontSize: 10, padding: "3px 0",
  background: active ? "#0077cc" : "#223",
  color: active ? "white" : "#889",
  border: `1px solid ${active ? "#0077cc" : "#334"}`,
  borderRadius: 4, cursor: "pointer",
});

const exportBtnStyle: React.CSSProperties = {
  marginTop: 8, width: "100%", fontSize: 11, padding: "6px 0",
  background: "#114422", color: "#88ffbb",
  border: "1px solid #226633", borderRadius: 4, cursor: "pointer",
};

const controlsStyle: React.CSSProperties = {
  position: "absolute", bottom: 16, left: 16,
  background: "rgba(10,10,20,0.85)",
  padding: "8px 14px", borderRadius: 8,
  border: "1px solid #2a2a4a",
  backdropFilter: "blur(4px)",
};

const checkboxLabelStyle: React.CSSProperties = {
  display: "flex", alignItems: "center", gap: 8,
  fontSize: 13, color: "#ccd", cursor: "pointer",
};
