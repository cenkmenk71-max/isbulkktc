import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { DROPS, RAIN_COUNT, dropY } from "../lib/timeline";
import { clock } from "../lib/live";
import type { Labels } from "../lib/labels";

const RAIN_TOP = 7;

// Rain streaks: one instanced mesh, every drop placed from dropY(t), so it loops with the tour
function Rain() {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const m = useMemo(() => new THREE.Matrix4(), []);
  useFrame(() => {
    DROPS.forEach((d, i) => {
      m.makeTranslation(d.x, dropY(d, clock.time) * RAIN_TOP, d.z);
      mesh.current.setMatrixAt(i, m);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, RAIN_COUNT]} frustumCulled={false}>
      <boxGeometry args={[0.006, 0.3, 0.006]} />
      <meshBasicMaterial color="#b9e8da" transparent opacity={0.52} depthWrite={false} />
    </instancedMesh>
  );
}

// The wall behind the machine with two neon signs.
export function Backdrop({ labels }: { labels: Labels }) {
  return (
    <group>
      <mesh position={[0, 4, -2.2]}>
        <planeGeometry args={[30, 8]} />
        <meshStandardMaterial color="#101d18" roughness={0.94} />
      </mesh>
      <mesh position={[2.7, 1.5, -2.19]}>
        <planeGeometry args={[1.8, 0.45]} />
        <meshBasicMaterial map={labels.open} transparent blending={THREE.AdditiveBlending} toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh position={[1.7, 3.95, -2.19]}>
        <planeGeometry args={[2.2, 0.55]} />
        <meshBasicMaterial map={labels.cold} transparent blending={THREE.AdditiveBlending} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

// The wet street: a subtle puddle mask keeps the floor textured without competing with the machine.
export function Ground({ labels }: { labels: Labels }) {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.001}>
        <planeGeometry args={[40, 40]} />
        <meshStandardMaterial color="#0a1511" roughness={0.3} metalness={0.16} transparent opacity={0.82} alphaMap={labels.puddles} depthWrite={false} />
      </mesh>
      <Rain />
    </group>
  );
}
