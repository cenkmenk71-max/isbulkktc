import { useMemo, useRef } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import type { Plan } from "../lib/plans";
import { lerp } from "../lib/time";
import { live, wipe } from "../lib/live";
import { unlockAudio } from "../lib/sfx";
import type { Labels } from "../lib/labels";

// A Japanese street vending machine, built from primitives. Units are metres; the base sits on y = 0, the glass faces +z.
const W = 1.9;
const H = 3.1;
const D = 1.0;
const FRONT_Z = D / 2;
// The glass window (left) and the control column (right)
const WIN = { x0: -0.84, x1: 0.3, y0: 1.0, y1: 2.8 };
const WIN_CX = (WIN.x0 + WIN.x1) / 2;
// Shelves are ordered from the first to the fourth employer package.
export const SHELF_Y = [2.46, 1.99, 1.52, 1.05];
const COLS = [WIN_CX - 0.37, WIN_CX, WIN_CX + 0.37]; // the middle column is the one that vends
const CAN_R = 0.085;
const BODY_H = 0.196; // the printed part; the metal ends add 0.03 below and 0.036 above
const CAN_H = 0.26;
const PITCH = 0.2; // one can
const FRONT = 0.16; // z of the front can
const PER_ROW = 4;
// The tray behind the flap at the bottom; the can falls behind the solid block and shows up here
const TRAY_BOX = { x0: -0.66, x1: 0.12, y0: 0.24, y1: 0.6 };
export const TRAY = { x: WIN_CX, y: TRAY_BOX.y0 + 0.1, z: FRONT + PITCH };
// Controls
const CTRL_X = 0.6;
const LED_Y = 2.6;
const COIN_Y = 2.32;
const BUTTON_Y = [2.08, 1.76, 1.44, 1.12];
const SLOT_Y = 0.72;
// Where the LED strips cross the glass (0 bottom … 1 top): the fog stays clear there
export const FOG_CLEAR = SHELF_Y.map((y) => (y - 0.055 - WIN.y0) / (WIN.y1 - WIN.y0));

const SHELL = "#eef1f4"; // glossy white front
const SIDE = "#194435"; // deep-green sides and header

// Rounded-edge box between two corners
function Box({ x0, x1, y0, y1, z0 = -D / 2, z1 = D / 2, color = SHELL, r = 0.02, metal = false }: { x0: number; x1: number; y0: number; y1: number; z0?: number; z1?: number; color?: string; r?: number; metal?: boolean }) {
  const geo = useMemo(() => {
    const w = x1 - x0, h = y1 - y0, d = z1 - z0;
    return new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
  }, [x0, x1, y0, y1, z0, z1, r]);
  return (
    <mesh geometry={geo} position={[(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]}>
      {metal ? (
        <meshStandardMaterial color="#d6dbe1" metalness={1} roughness={0.18} />
      ) : (
        <meshPhysicalMaterial color={color} roughness={0.35} clearcoat={1} clearcoatRoughness={0.12} />
      )}
    </mesh>
  );
}

// A chrome frame around a hole: a rounded rectangle with a rounded hole, extruded with a bevel
function Bezel({ x0, x1, y0, y1, pad = 0.035, z = FRONT_Z }: { x0: number; x1: number; y0: number; y1: number; pad?: number; z?: number }) {
  const geo = useMemo(() => {
    const rr = (s: THREE.Shape | THREE.Path, a: number, b: number, c: number, d: number, r: number) => {
      s.moveTo(a + r, b);
      s.lineTo(c - r, b);
      s.quadraticCurveTo(c, b, c, b + r);
      s.lineTo(c, d - r);
      s.quadraticCurveTo(c, d, c - r, d);
      s.lineTo(a + r, d);
      s.quadraticCurveTo(a, d, a, d - r);
      s.lineTo(a, b + r);
      s.quadraticCurveTo(a, b, a + r, b);
    };
    const shape = new THREE.Shape();
    rr(shape, x0 - pad, y0 - pad, x1 + pad, y1 + pad, 0.06);
    const hole = new THREE.Path();
    rr(hole, x0, y0, x1, y1, 0.035);
    shape.holes.push(hole);
    return new THREE.ExtrudeGeometry(shape, { depth: 0.01, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.01, bevelSegments: 3, curveSegments: 8 });
  }, [x0, x1, y0, y1, pad]);
  return (
    <mesh geometry={geo} position-z={z - 0.004}>
      <meshStandardMaterial color="#dfe4ea" metalness={1} roughness={0.15} />
    </mesh>
  );
}

// Shared geometry for every can: a printed body and two spun-aluminium ends
function useCanParts(labels: Labels) {
  return useMemo(() => {
    // Turned so the label's first name (u = 0.25) faces the glass
    const body = new THREE.CylinderGeometry(CAN_R, CAN_R, BODY_H, 48, 1, true).rotateY(-Math.PI / 2);
    const v = (r: number, y: number) => new THREE.Vector2(r, y);
    const top = new THREE.LatheGeometry([v(CAN_R, 0), v(CAN_R - 0.004, 0.01), v(0.066, 0.03), v(0.069, 0.034), v(0.064, 0.036), v(0.058, 0.031), v(0, 0.03)], 48);
    const bottom = new THREE.LatheGeometry([v(0, -0.022), v(0.052, -0.03), v(0.074, -0.024), v(CAN_R, -0.008), v(CAN_R, 0)], 48);
    const metal = new THREE.MeshStandardMaterial({ color: "#d9dde2", metalness: 1, roughness: 0.22, side: THREE.DoubleSide });
    const prints = labels.cans.map((map) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.3, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }));
    return { body, top, bottom, metal, prints };
  }, [labels]);
}
type CanParts = ReturnType<typeof useCanParts>;

// One can, centred on its origin
function Can({ parts, tier }: { parts: CanParts; tier: number }) {
  return (
    <>
      <mesh geometry={parts.body} material={parts.prints[tier]} />
      <mesh geometry={parts.top} material={parts.metal} position-y={BODY_H / 2} />
      <mesh geometry={parts.bottom} material={parts.metal} position-y={-BODY_H / 2} />
    </>
  );
}

type Props = {
  labels: Labels;
  plans: Plan[];
  onSelect: (index: number) => void;
  onCoin: () => void;
  onWipe: () => void;
};

export function Machine({
  labels,
  plans,
  onSelect,
  onCoin,
  onWipe,
}: Props) {
  const invalidate = useThree((state) => state.invalidate);
  const parts = useCanParts(labels);
  const bodies = useRef<Array<THREE.InstancedMesh | null>>([]);
  const tops = useRef<Array<THREE.InstancedMesh | null>>([]);
  const bottoms = useRef<Array<THREE.InstancedMesh | null>>([]);
  const drop = useRef<THREE.Group>(null!);
  const dropCans = useRef<THREE.Group[]>([]);
  const coin = useRef<THREE.Mesh>(null!);
  const buttons = useRef<THREE.Group[]>([]);
  const strips = useRef<THREE.Mesh[]>([]);
  const sign = useRef<THREE.MeshBasicMaterial>(null!);
  const instanceTransform = useMemo(() => new THREE.Object3D(), []);

  useFrame(() => {
    const f = live.frame;
    plans.forEach((_, i) => {
      const vending = f.tier === i;
      const body = bodies.current[i];
      const top = tops.current[i];
      const bottom = bottoms.current[i];
      if (body && top && bottom) {
        let instance = 0;
        for (let column = 0; column < COLS.length; column += 1) {
          for (let can = 0; can < PER_ROW; can += 1) {
            const z =
              FRONT -
              (can + 1) * PITCH +
              (column === 1 && vending ? PITCH * f.spin : PITCH);
            instanceTransform.position.set(
              COLS[column],
              SHELF_Y[i] + CAN_H / 2 - 0.004,
              z,
            );
            instanceTransform.updateMatrix();
            body.setMatrixAt(instance, instanceTransform.matrix);
            instanceTransform.position.y += BODY_H / 2;
            instanceTransform.updateMatrix();
            top.setMatrixAt(instance, instanceTransform.matrix);
            instanceTransform.position.y -= BODY_H;
            instanceTransform.updateMatrix();
            bottom.setMatrixAt(instance, instanceTransform.matrix);
            instance += 1;
          }
        }
        body.instanceMatrix.needsUpdate = true;
        top.instanceMatrix.needsUpdate = true;
        bottom.instanceMatrix.needsUpdate = true;
      }
      buttons.current[i].position.z = FRONT_Z + 0.02 - (vending ? f.press * 0.02 : 0);
      strips.current[i].scale.y = vending && f.stopped < 4 ? 1.08 : 1;
    });
    const c = f.can;
    drop.current.visible = c.visible && f.tier >= 0;
    if (drop.current.visible) {
      dropCans.current.forEach((g, i) => (g.visible = i === f.tier));
      const y0 = SHELF_Y[f.tier] + CAN_H / 2;
      const fall = c.fall * c.fall; // gravity: slow at first
      drop.current.position.set(TRAY.x, lerp(y0, TRAY.y, fall) + c.bounce * 0.04, FRONT + PITCH * c.z + c.out * 0.5);
      drop.current.rotation.z = c.fall * (Math.PI / 2); // lands on its side, label to the glass
      drop.current.scale.setScalar(1 - c.out);
    }
    coin.current.visible = f.coin >= 0;
    if (coin.current.visible) {
      coin.current.position.set(
        CTRL_X - 0.1,
        COIN_Y + 0.12 * (1 - f.coin),
        FRONT_Z + 0.03 + 0.06 * (1 - f.coin),
      );
      coin.current.rotation.y = f.coin * Math.PI * 4;
    }
    sign.current.color.setScalar(f.flicker * 1.3);
  });

  const click = (fn: () => void) => ({
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      unlockAudio();
      fn();
      invalidate();
    },
    onPointerOver: () => (document.body.style.cursor = "pointer"),
    onPointerOut: () => (document.body.style.cursor = ""),
  });

  return (
    <group>
      {/* Shell: navy back and sides, a navy header for the sign, a white front around the window, tray and controls */}
      <Box x0={-W / 2} x1={W / 2} y0={0.08} y1={H} z0={-D / 2} z1={-D / 2 + 0.06} color={SIDE} r={0.03} />
      <Box x0={-W / 2} x1={-W / 2 + 0.07} y0={0.08} y1={H} color={SIDE} r={0.03} />
      <Box x0={W / 2 - 0.07} x1={W / 2} y0={0.08} y1={H} color={SIDE} r={0.03} />
      <Box x0={-W / 2 + 0.06} x1={W / 2 - 0.06} y0={WIN.y1 + 0.04} y1={H} z1={FRONT_Z - 0.01} color={SIDE} r={0.03} />
      <Box x0={-W / 2 + 0.06} x1={WIN.x0} y0={0.08} y1={WIN.y1 + 0.05} z1={FRONT_Z - 0.02} />
      <Box x0={WIN.x1} x1={W / 2 - 0.06} y0={0.08} y1={WIN.y1 + 0.05} z1={FRONT_Z - 0.02} />
      <Box x0={WIN.x0 - 0.01} x1={WIN.x1 + 0.01} y0={0.08} y1={TRAY_BOX.y0} z1={FRONT_Z - 0.02} />
      <Box x0={WIN.x0 - 0.01} x1={WIN.x1 + 0.01} y0={TRAY_BOX.y1} y1={WIN.y0} z1={FRONT_Z - 0.02} />
      <Box x0={WIN.x0 - 0.01} x1={TRAY_BOX.x0} y0={TRAY_BOX.y0 - 0.01} y1={TRAY_BOX.y1 + 0.01} z1={FRONT_Z - 0.02} />
      <Box x0={TRAY_BOX.x1} x1={WIN.x1 + 0.01} y0={TRAY_BOX.y0 - 0.01} y1={TRAY_BOX.y1 + 0.01} z1={FRONT_Z - 0.02} />
      {/* Plinth with a vent grille and a green pinstripe down the control column */}
      <Box x0={-W / 2 + 0.02} x1={W / 2 - 0.02} y0={0} y1={0.1} z0={-D / 2 + 0.02} z1={FRONT_Z - 0.03} color="#0d1119" r={0.015} />
      <mesh position={[-0.1, 0.17, FRONT_Z - 0.019]}>
        <planeGeometry args={[1.3, 0.07]} />
        <meshStandardMaterial map={labels.grille} roughness={0.6} />
      </mesh>
      <mesh position={[WIN.x1 + 0.045, (0.3 + WIN.y1) / 2, FRONT_Z - 0.018]}>
        <planeGeometry args={[0.012, WIN.y1 - 0.3]} />
        <meshBasicMaterial color="#326c54" toneMapped={false} />
      </mesh>

      {/* Chrome bezels round the window and the tray */}
      <Bezel {...WIN} z={FRONT_Z - 0.02} />
      <Bezel {...TRAY_BOX} pad={0.025} z={FRONT_Z - 0.02} />

      {/* Tray: a dark pocket and a smoked flap */}
      <Box x0={TRAY_BOX.x0} x1={TRAY_BOX.x1} y0={TRAY_BOX.y0} y1={TRAY_BOX.y0 + 0.02} z0={0} z1={FRONT_Z - 0.03} color="#12151c" r={0.005} />
      <Box x0={TRAY_BOX.x0} x1={TRAY_BOX.x1} y0={TRAY_BOX.y0} y1={TRAY_BOX.y1} z0={-0.03} z1={0} color="#12151c" r={0.005} />
      <mesh position={[(TRAY_BOX.x0 + TRAY_BOX.x1) / 2, TRAY_BOX.y1 - 0.08, FRONT_Z - 0.015]}>
        <planeGeometry args={[TRAY_BOX.x1 - TRAY_BOX.x0, 0.16]} />
        <meshPhysicalMaterial color="#171b22" transparent opacity={0.9} roughness={0.1} clearcoat={1} />
      </mesh>
      <pointLight position={[TRAY.x, TRAY_BOX.y1 - 0.06, 0.3]} color="#ffe2c4" intensity={1.2} distance={0.8} decay={1.5} />

      {/* Lit interior: a glowing back panel, a fluorescent tube behind the top of the bezel, a light that washes the cans */}
      <mesh position={[WIN_CX, (WIN.y0 + WIN.y1) / 2, -D / 2 + 0.061]}>
        <planeGeometry args={[WIN.x1 - WIN.x0 + 0.1, WIN.y1 - WIN.y0 + 0.1]} />
        <meshBasicMaterial map={labels.interior} toneMapped={false} />
      </mesh>
      <mesh position={[WIN_CX, WIN.y1 - 0.03, 0.3]} rotation-z={Math.PI / 2}>
        <cylinderGeometry args={[0.014, 0.014, WIN.x1 - WIN.x0 - 0.06, 12]} />
        <meshBasicMaterial color="#f4fbff" toneMapped={false} />
      </mesh>
      <pointLight position={[WIN_CX, WIN.y1 - 0.12, 0.35]} color="#e6f4ff" intensity={3.2} distance={3} decay={1.4} />
      {/* Side walls of the window pocket */}
      <Box x0={WIN.x0 - 0.02} x1={WIN.x0} y0={WIN.y0} y1={WIN.y1} z1={FRONT_Z - 0.04} color="#c9d3de" r={0.004} />
      <Box x0={WIN.x1} x1={WIN.x1 + 0.02} y0={WIN.y0} y1={WIN.y1} z1={FRONT_Z - 0.04} color="#c9d3de" r={0.004} />

      {plans.map((p, i) => (
        <group key={p.id}>
          {/* Shelf with a chrome lip and a package-scope strip. */}
          <Box x0={WIN.x0} x1={WIN.x1} y0={SHELF_Y[i] - 0.02} y1={SHELF_Y[i]} z0={-D / 2 + 0.06} z1={0.36} color="#aab3be" r={0.006} />
          <Box x0={WIN.x0} x1={WIN.x1} y0={SHELF_Y[i] - 0.11} y1={SHELF_Y[i]} z0={0.36} z1={0.38} r={0.006} metal />
          <mesh ref={(m) => void (strips.current[i] = m!)} position={[WIN_CX, SHELF_Y[i] - 0.055, 0.382]}>
            <planeGeometry args={[WIN.x1 - WIN.x0 - 0.08, 0.075]} />
            <meshBasicMaterial map={labels.strips[i]} toneMapped={false} />
          </mesh>
          <instancedMesh
            args={[parts.body, parts.prints[i], COLS.length * PER_ROW]}
            ref={(mesh) => {
              bodies.current[i] = mesh;
            }}
          />
          <instancedMesh
            args={[parts.top, parts.metal, COLS.length * PER_ROW]}
            ref={(mesh) => {
              tops.current[i] = mesh;
            }}
          />
          <instancedMesh
            args={[parts.bottom, parts.metal, COLS.length * PER_ROW]}
            ref={(mesh) => {
              bottoms.current[i] = mesh;
            }}
          />
          {/* Button: a lit cap in a chrome ring, and its legend; clicking either vends this plan */}
          <group ref={(g) => void (buttons.current[i] = g!)} position={[CTRL_X - 0.1, BUTTON_Y[i], FRONT_Z + 0.02]}>
            <mesh rotation-x={Math.PI / 2} {...click(() => onSelect(i))}>
              <cylinderGeometry args={[0.058, 0.062, 0.04, 40]} />
              <meshPhysicalMaterial color={p.color} emissive={p.color} emissiveIntensity={0.9} roughness={0.25} clearcoat={1} />
            </mesh>
          </group>
          <mesh position={[CTRL_X - 0.1, BUTTON_Y[i], FRONT_Z - 0.01]}>
            <torusGeometry args={[0.07, 0.012, 12, 40]} />
            <meshStandardMaterial color="#dfe4ea" metalness={1} roughness={0.15} />
          </mesh>
          <mesh position={[CTRL_X + 0.12, BUTTON_Y[i], FRONT_Z - 0.018]} {...click(() => onSelect(i))}>
            <planeGeometry args={[0.24, 0.09]} />
            <meshBasicMaterial map={labels.buttons[i]} toneMapped={false} />
          </mesh>
        </group>
      ))}
      {/* The can that vends, one per plan so each keeps its own label; hidden until a press */}
      <group ref={drop} visible={false}>
        {plans.map((p, i) => (
          <group key={p.id} ref={(g) => void (dropCans.current[i] = g!)}>
            <Can parts={parts} tier={i} />
          </group>
        ))}
      </group>

      {/* Fog just behind the glass: drag across it to wipe it clear */}
      <mesh
        position={[WIN_CX, (WIN.y0 + WIN.y1) / 2, FRONT_Z - 0.034]}
        onPointerDown={unlockAudio}
        onPointerMove={
          (e) => {
            if (!e.uv || e.buttons === 0) return;
            unlockAudio();
            wipe(e.uv.x, e.uv.y);
            onWipe();
            invalidate();
          }
        }
      >
        <planeGeometry args={[WIN.x1 - WIN.x0, WIN.y1 - WIN.y0]} />
        <meshBasicMaterial map={labels.fog} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      {/* Glass: barely there, with a faint diagonal sheen */}
      <mesh position={[WIN_CX, (WIN.y0 + WIN.y1) / 2, FRONT_Z - 0.03]}>
        <planeGeometry args={[WIN.x1 - WIN.x0, WIN.y1 - WIN.y0]} />
        <meshPhysicalMaterial map={labels.sheen} transparent opacity={0.5} roughness={0.02} metalness={0} clearcoat={1} depthWrite={false} />
      </mesh>

      {/* The package code display resolves as the selected package reaches the tray. */}
      <Box x0={TRAY.x - 0.24} x1={TRAY.x + 0.24} y0={SLOT_Y - 0.075} y1={SLOT_Y + 0.075} z0={FRONT_Z - 0.03} z1={FRONT_Z} color="#0b0e14" r={0.02} />
      <mesh position={[TRAY.x, SLOT_Y, FRONT_Z + 0.001]}>
        <planeGeometry args={[0.44, 0.11]} />
        <meshBasicMaterial map={labels.slot} toneMapped={false} />
      </mesh>

      {/* The coin slot changes the selected listing duration; it does not collect payment. */}
      <group {...click(onCoin)}>
        <Box x0={CTRL_X - 0.22} x1={CTRL_X + 0.22} y0={COIN_Y - 0.1} y1={COIN_Y + 0.1} z0={FRONT_Z - 0.03} z1={FRONT_Z + 0.01} r={0.02} metal />
        <Box x0={CTRL_X - 0.12} x1={CTRL_X - 0.08} y0={COIN_Y - 0.06} y1={COIN_Y + 0.06} z0={FRONT_Z} z1={FRONT_Z + 0.012} color="#05070a" r={0.008} />
        <Box x0={CTRL_X + 0.02} x1={CTRL_X + 0.16} y0={COIN_Y - 0.035} y1={COIN_Y + 0.035} z0={FRONT_Z} z1={FRONT_Z + 0.03} color="#b8bfc8" r={0.015} metal />
      </group>
      <mesh ref={coin} rotation-x={Math.PI / 2} visible={false}>
        <cylinderGeometry args={[0.045, 0.045, 0.008, 32]} />
        <meshStandardMaterial color="#e2bd62" metalness={0.8} roughness={0.3} emissive="#6b4a10" emissiveIntensity={0.6} />
      </mesh>

      {/* Duration prompt; the coin mechanism changes duration, not billing or payment. */}
      <Box x0={CTRL_X - 0.28} x1={CTRL_X + 0.28} y0={LED_Y - 0.11} y1={LED_Y + 0.11} z0={FRONT_Z - 0.03} z1={FRONT_Z} color="#0b0e14" r={0.02} />
      <mesh position={[CTRL_X, LED_Y, FRONT_Z + 0.001]}>
        <planeGeometry args={[0.5, 0.16]} />
        <meshBasicMaterial map={labels.selection} toneMapped={false} />
      </mesh>

      {/* Neon wordmark in the header, with a halo that spills onto the wall */}
      <mesh position={[0, H - 0.14, FRONT_Z + 0.001]}>
        <planeGeometry args={[W - 0.2, 0.2]} />
        <meshBasicMaterial ref={sign} map={labels.sign} toneMapped={false} />
      </mesh>
      <mesh position={[0, H * 0.55, -D / 2 - 0.3]}>
        <planeGeometry args={[W * 3.2, H * 1.6]} />
        <meshBasicMaterial map={labels.glow} color="#6a8cff" transparent opacity={0.55} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <pointLight position={[0, H + 0.1, 0.7]} color="#4b8066" intensity={2.5} distance={4} decay={1.5} />
    </group>
  );
}
