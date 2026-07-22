"use client";

import React, { useRef, useMemo, useCallback, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { cn } from "@/lib/utils";
import * as THREE from "three";

export interface RubberFluidProps {
  /** Container width */
  width?: string | number;
  /** Container height */
  height?: string | number;
  /** Additional CSS classes */
  className?: string;
  /** Content rendered above the effect */
  children?: React.ReactNode;
  /** Animation speed multiplier */
  speed?: number;
  /** Zoom level of the pattern field */
  zoom?: number;
  /** Number of warp iterations */
  iterations?: number;
  /** Step size between iterations */
  iterationStep?: number;
  /** Fractional seed factor per iteration */
  seedFactor?: number;
  /** Warp distortion strength exponent */
  warpPower?: number;
  /** Color offset channel 1 */
  channelOffset1?: number;
  /** Color offset channel 2 */
  channelOffset2?: number;
  /** Color offset channel 3 */
  channelOffset3?: number;
  /** Translation per iteration */
  drift?: number;
  /** Rotation multiplier per iteration */
  rotationRate?: number;
  /** Compression curve applied before shading */
  compression?: number;
  /** Brightness threshold subtracted before power curve */
  threshold?: number;
  /** Contrast exponent for final shading */
  contrast?: number;
  /** Pre-shade brightness multiplier */
  preBrightness?: number;
  /** Pre-shade offset */
  preOffset?: number;
  /** Tint color R (0–1) */
  tintR?: number;
  /** Tint color G (0–1) */
  tintG?: number;
  /** Tint color B (0–1) */
  tintB?: number;
  /** Radial glow intensity from center */
  glowIntensity?: number;
  /** Background color in hex */
  backgroundColor?: string;
  /** Master opacity (0–1) */
  opacity?: number;
  /** Enable cursor interaction to intensify warp distortion near pointer */
  cursorInteraction?: boolean;
  /** Cursor effect strength multiplier (0–3) */
  cursorIntensity?: number;
}

const VERTEX_SHADER = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;

uniform float uTime;
uniform vec2 uRes;
uniform float uSpeed;
uniform float uZoom;
uniform float uIter;
uniform float uStep;
uniform float uSeed;
uniform float uWarpPow;
uniform float uCh1;
uniform float uCh2;
uniform float uCh3;
uniform float uDrift;
uniform float uSpin;
uniform float uCompress;
uniform float uThresh;
uniform float uContrast;
uniform float uPreBright;
uniform float uPreOff;
uniform vec3 uTint;
uniform float uGlow;
uniform vec3 uBg;
uniform float uAlpha;
uniform vec2 uPointer;
uniform float uCursorActive;
uniform float uCursorIntensity;

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, s, -s, c);
}

void main() {
  vec2 st = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  vec2 p = st * uZoom;
  float t = uTime * uSpeed;

  vec2 pointerUv = (uPointer - 0.5) * vec2(uRes.x / uRes.y, 1.0) * uZoom;
  float cursorDist = length(p - pointerUv);
  float cursorInfluence = smoothstep(5.0, 0.0, cursorDist) * uCursorActive * uCursorIntensity;

  float localWarpPow = uWarpPow - cursorInfluence * 0.25;
  float localDrift = uDrift + cursorInfluence * 0.5;
  float localSpin = uSpin + cursorInfluence * 0.3;

  vec3 acc = vec3(length(p) * uGlow);

  for (float i = 0.3; i < 20.0; i += 1.0) {
    if (i >= uIter) break;
    float fi = i * uStep;

    float k = cos(fi * 0.05);
    k = fract(k * tanh(fi) * uSeed);
    p += atan(sin(p.yx * k + t * k)) / pow(k + 0.001, localWarpPow);
    acc += cos(p.x + vec3(uCh1, uCh2, uCh3) + p.y);
    p *= rot(fi * localSpin);
    p += vec2(localDrift);
  }

  acc = tanh(acc * acc * uCompress);
  acc = pow(abs(acc * uPreBright - uPreOff), vec3(uContrast));

  vec3 col = vec3((acc.r + acc.g + acc.b) / 3.0);
  col = pow(max(col * uPreBright - uThresh, 0.0), vec3(uContrast)) * uTint;

  col += cursorInfluence * 0.07 * uTint;

  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  vec3 out_col = mix(uBg, col, clamp(lum * 8.0, 0.0, 1.0));
  gl_FragColor = vec4(out_col, uAlpha);
}
`;

function parseHexColor(hex: string): [number, number, number] {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return [0, 0, 0];
  // Non-null assertions: this repo runs `noUncheckedIndexedAccess`, which types
  // capture groups as possibly-undefined. The regex matched, so all three exist.
  const [, r, g, b] = match;
  return [parseInt(r!, 16) / 255, parseInt(g!, 16) / 255, parseInt(b!, 16) / 255];
}

interface FluidSceneProps {
  speed: number;
  zoom: number;
  iterations: number;
  iterationStep: number;
  seedFactor: number;
  warpPower: number;
  channelOffset1: number;
  channelOffset2: number;
  channelOffset3: number;
  drift: number;
  rotationRate: number;
  compression: number;
  threshold: number;
  contrast: number;
  preBrightness: number;
  preOffset: number;
  tintR: number;
  tintG: number;
  tintB: number;
  glowIntensity: number;
  bgRgb: [number, number, number];
  opacity: number;
  pointer: [number, number];
  cursorInteraction: boolean;
  cursorIntensity: number;
}

const FluidScene: React.FC<FluidSceneProps> = ({
  speed,
  zoom,
  iterations,
  iterationStep,
  seedFactor,
  warpPower,
  channelOffset1,
  channelOffset2,
  channelOffset3,
  drift,
  rotationRate,
  compression,
  threshold,
  contrast,
  preBrightness,
  preOffset,
  tintR,
  tintG,
  tintB,
  glowIntensity,
  bgRgb,
  opacity,
  pointer,
  cursorInteraction,
  cursorIntensity,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const { size, viewport } = useThree();
  const smoothPointer = useRef(new THREE.Vector2(0.5, 0.5));

  const shaderUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uRes: { value: new THREE.Vector2(1, 1) },
      uSpeed: { value: speed },
      uZoom: { value: zoom },
      uIter: { value: iterations },
      uStep: { value: iterationStep },
      uSeed: { value: seedFactor },
      uWarpPow: { value: warpPower },
      uCh1: { value: channelOffset1 },
      uCh2: { value: channelOffset2 },
      uCh3: { value: channelOffset3 },
      uDrift: { value: drift },
      uSpin: { value: rotationRate },
      uCompress: { value: compression },
      uThresh: { value: threshold },
      uContrast: { value: contrast },
      uPreBright: { value: preBrightness },
      uPreOff: { value: preOffset },
      uTint: { value: new THREE.Vector3(tintR, tintG, tintB) },
      uGlow: { value: glowIntensity },
      uBg: { value: new THREE.Vector3(...bgRgb) },
      uAlpha: { value: opacity },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uCursorActive: { value: 0 },
      uCursorIntensity: { value: 1 },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useFrame((state, delta) => {
    // Mutating the MEMOISED uniforms object rather than reading them back off
    // `material.uniforms`. three holds this exact object by reference, so the
    // effect is identical — but `uniforms` is an index signature, and under this
    // repo's `noUncheckedIndexedAccess` every lookup through it is possibly
    // undefined. This keeps all 25 assignments precisely typed with no casts.

    shaderUniforms.uTime.value = state.clock.elapsedTime;
    shaderUniforms.uRes.value.set(size.width * viewport.dpr, size.height * viewport.dpr);
    shaderUniforms.uSpeed.value = speed;
    shaderUniforms.uZoom.value = zoom;
    shaderUniforms.uIter.value = iterations;
    shaderUniforms.uStep.value = iterationStep;
    shaderUniforms.uSeed.value = seedFactor;
    shaderUniforms.uWarpPow.value = warpPower;
    shaderUniforms.uCh1.value = channelOffset1;
    shaderUniforms.uCh2.value = channelOffset2;
    shaderUniforms.uCh3.value = channelOffset3;
    shaderUniforms.uDrift.value = drift;
    shaderUniforms.uSpin.value = rotationRate;
    shaderUniforms.uCompress.value = compression;
    shaderUniforms.uThresh.value = threshold;
    shaderUniforms.uContrast.value = contrast;
    shaderUniforms.uPreBright.value = preBrightness;
    shaderUniforms.uPreOff.value = preOffset;
    shaderUniforms.uTint.value.set(tintR, tintG, tintB);
    shaderUniforms.uGlow.value = glowIntensity;
    shaderUniforms.uBg.value.set(...bgRgb);
    shaderUniforms.uAlpha.value = opacity;
    shaderUniforms.uCursorActive.value = cursorInteraction ? 1 : 0;
    shaderUniforms.uCursorIntensity.value = cursorIntensity;

    const ease = 1 - Math.exp(-delta / 0.15);
    smoothPointer.current.x += (pointer[0] - smoothPointer.current.x) * ease;
    smoothPointer.current.y += (pointer[1] - smoothPointer.current.y) * ease;
    shaderUniforms.uPointer.value.set(smoothPointer.current.x, smoothPointer.current.y);
  });

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <shaderMaterial
        vertexShader={VERTEX_SHADER}
        fragmentShader={FRAGMENT_SHADER}
        uniforms={shaderUniforms}
        transparent
      />
    </mesh>
  );
};

const RubberFluid: React.FC<RubberFluidProps> = ({
  width = "100%",
  height = "100%",
  className,
  children,
  speed = 1,
  zoom = 7.5,
  iterations = 10,
  iterationStep = 0.77,
  seedFactor = 1,
  warpPower = 1.5,
  channelOffset1 = 3,
  channelOffset2 = 3,
  channelOffset3 = 2,
  drift = 3,
  rotationRate = 2,
  compression = 0.001,
  threshold = 0.3,
  contrast = 5,
  preBrightness = 2.1,
  preOffset = 0.9,
  tintR = 1,
  tintG = 0.07,
  tintB = 1,
  glowIntensity = 0.8,
  backgroundColor = "#000000",
  opacity = 1,
  cursorInteraction = false,
  cursorIntensity = 1,
}) => {
  const bgRgb = useMemo(() => parseHexColor(backgroundColor), [backgroundColor]);

  const containerRef = useRef<HTMLDivElement>(null);
  const [pointer, setPointer] = useState<[number, number]>([0.5, 0.5]);

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!cursorInteraction) return;
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const nx = (e.clientX - rect.left) / rect.width;
      const ny = 1 - (e.clientY - rect.top) / rect.height;
      setPointer([nx, ny]);
    },
    [cursorInteraction],
  );

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
      style={{ width, height, backgroundColor }}
      onPointerMove={handlePointerMove}
    >
      <Canvas
        className="absolute inset-0 h-full w-full"
        orthographic
        camera={{
          position: [0, 0, 1],
          zoom: 1,
          left: -1,
          right: 1,
          top: 1,
          bottom: -1,
        }}
        gl={{ antialias: true, alpha: true }}
      >
        <FluidScene
          speed={speed}
          zoom={zoom}
          iterations={iterations}
          iterationStep={iterationStep}
          seedFactor={seedFactor}
          warpPower={warpPower}
          channelOffset1={channelOffset1}
          channelOffset2={channelOffset2}
          channelOffset3={channelOffset3}
          drift={drift}
          rotationRate={rotationRate}
          compression={compression}
          threshold={threshold}
          contrast={contrast}
          preBrightness={preBrightness}
          preOffset={preOffset}
          tintR={tintR}
          tintG={tintG}
          tintB={tintB}
          glowIntensity={glowIntensity}
          bgRgb={bgRgb}
          opacity={opacity}
          pointer={pointer}
          cursorInteraction={cursorInteraction}
          cursorIntensity={cursorIntensity}
        />
      </Canvas>
      {children && <div className="pointer-events-none relative z-10">{children}</div>}
    </div>
  );
};

RubberFluid.displayName = "RubberFluid";

export default RubberFluid;
