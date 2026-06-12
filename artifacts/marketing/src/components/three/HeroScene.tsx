import React, { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl2") || canvas.getContext("webgl"))
    );
  } catch {
    return false;
  }
}

function Particles({ count = 1800 }: { count?: number }) {
  const pointsRef = useRef<THREE.Points>(null!);
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const r = 2.4 + Math.random() * 2.6;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      arr[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      arr[i * 3 + 2] = r * Math.cos(phi);
    }
    return arr;
  }, [count]);

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.04;
      pointsRef.current.rotation.x += delta * 0.015;
    }
  });

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        color="#0040FF"
        size={0.022}
        sizeAttenuation
        transparent
        opacity={0.7}
      />
    </points>
  );
}

function WireframeKnot() {
  const meshRef = useRef<THREE.Mesh>(null!);
  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.x += delta * 0.12;
      meshRef.current.rotation.y += delta * 0.18;
    }
  });
  return (
    <mesh ref={meshRef} scale={1.1}>
      <icosahedronGeometry args={[1.6, 1]} />
      <meshBasicMaterial color="#0040FF" wireframe transparent opacity={0.35} />
    </mesh>
  );
}

export default function HeroScene() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    setEnabled(hasWebGL());
  }, []);

  if (!enabled) {
    return (
      <div
        className="w-full h-full"
        style={{
          backgroundImage:
            "radial-gradient(circle at 75% 35%, rgba(0,64,255,0.18) 0%, transparent 45%), radial-gradient(circle at 20% 70%, rgba(0,64,255,0.10) 0%, transparent 50%)",
        }}
      />
    );
  }

  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0, 6.5], fov: 50 }}
      style={{ width: "100%", height: "100%" }}
      gl={{ antialias: true, alpha: true, failIfMajorPerformanceCaveat: false }}
      onCreated={({ gl }) => {
        gl.domElement.addEventListener("webglcontextlost", (e) => {
          e.preventDefault();
        });
      }}
    >
      <ambientLight intensity={0.4} />
      <WireframeKnot />
      <Particles />
    </Canvas>
  );
}
