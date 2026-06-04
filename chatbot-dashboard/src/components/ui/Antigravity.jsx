/* eslint-disable react/no-unknown-property */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import "./Antigravity.css";

const IDLE_DELAY_MS = 1800;

function damp(current, target, smoothing, delta) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-smoothing * delta));
}

function AntigravityInner({
  pointerRef,
  count = 300,
  magnetRadius = 10,
  ringRadius = 10,
  waveSpeed = 0.4,
  waveAmplitude = 1,
  particleSize = 2,
  lerpSpeed = 0.1,
  color = "#FF9FFC",
  autoAnimate = false,
  particleVariance = 1,
  rotationSpeed = 0,
  depthFactor = 1,
  pulseSpeed = 3,
  particleShape = "capsule",
  fieldStrength = 10,
}) {
  const meshRef = useRef(null);
  const { viewport } = useThree();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const virtualTarget = useRef({ x: 0, y: 0 });
  const idleBlend = useRef(0);

  const particles = useMemo(() => {
    const width = viewport.width || 100;
    const height = viewport.height || 100;

    return Array.from({ length: count }, () => {
      const x = (Math.random() - 0.5) * width;
      const y = (Math.random() - 0.5) * height;
      const z = (Math.random() - 0.5) * 16;

      return {
        t: Math.random() * Math.PI * 2,
        speed: 0.72 + Math.random() * 0.68,
        phase: Math.random() * Math.PI * 2,
        mx: x,
        my: y,
        mz: z,
        cx: x,
        cy: y,
        cz: z,
        radiusOffset: (Math.random() - 0.5) * 2,
        size: 1 - particleVariance * 0.28 + Math.random() * particleVariance * 0.56,
      };
    });
  }, [count, particleVariance, viewport.height, viewport.width]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    const elapsed = state.clock.getElapsedTime();
    const pointer = pointerRef.current;
    const isIdle = autoAnimate && performance.now() - pointer.lastMoveTime > IDLE_DELAY_MS;
    const idleSmoothing = isIdle ? 0.9 : 3.6;

    idleBlend.current = damp(idleBlend.current, isIdle ? 1 : 0, idleSmoothing, delta);

    const cursorX = (pointer.x * viewport.width) / 2;
    const cursorY = (pointer.y * viewport.height) / 2;
    const idleX = Math.sin(elapsed * 0.46) * viewport.width * 0.22;
    const idleY = Math.sin(elapsed * 0.92) * viewport.height * 0.16;
    const targetBlend = THREE.MathUtils.smootherstep(idleBlend.current, 0, 1);
    const destinationX = THREE.MathUtils.lerp(cursorX, idleX, targetBlend);
    const destinationY = THREE.MathUtils.lerp(cursorY, idleY, targetBlend);

    virtualTarget.current.x = damp(virtualTarget.current.x, destinationX, 7.2, delta);
    virtualTarget.current.y = damp(virtualTarget.current.y, destinationY, 7.2, delta);

    const targetX = virtualTarget.current.x;
    const targetY = virtualTarget.current.y;
    const globalRotation = elapsed * rotationSpeed;
    const particleDamping = 1 - Math.exp(-lerpSpeed * 60 * delta);
    const influenceStart = magnetRadius * 0.68;
    const fieldExponent = THREE.MathUtils.clamp(1.3 - fieldStrength * 0.075, 0.58, 1.05);

    particles.forEach((particle, index) => {
      particle.t += delta * particle.speed;

      const projectionFactor = 1 - particle.cz / 60;
      const projectedTargetX = targetX * projectionFactor;
      const projectedTargetY = targetY * projectionFactor;
      const dx = particle.mx - projectedTargetX;
      const dy = particle.my - projectedTargetY;
      const dist = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx) + globalRotation;
      const softFalloff = 1 - THREE.MathUtils.smoothstep(dist, influenceStart, magnetRadius);
      const influence = Math.pow(Math.max(0, softFalloff), fieldExponent);
      const wave =
        Math.sin(particle.t * waveSpeed + angle * 2.4 + particle.phase) *
        waveAmplitude *
        0.5;
      const deviation = particle.radiusOffset * (4 / (fieldStrength + 0.1));
      const currentRingRadius = ringRadius + wave + deviation;
      const ringX = projectedTargetX + currentRingRadius * Math.cos(angle);
      const ringY = projectedTargetY + currentRingRadius * Math.sin(angle);
      const ringZ =
        particle.mz * depthFactor +
        Math.sin(particle.t * 0.85 + particle.phase) * waveAmplitude * depthFactor;

      const targetXForParticle = THREE.MathUtils.lerp(particle.mx, ringX, influence);
      const targetYForParticle = THREE.MathUtils.lerp(particle.my, ringY, influence);
      const targetZForParticle = THREE.MathUtils.lerp(particle.mz * depthFactor, ringZ, influence);

      particle.cx += (targetXForParticle - particle.cx) * particleDamping;
      particle.cy += (targetYForParticle - particle.cy) * particleDamping;
      particle.cz += (targetZForParticle - particle.cz) * particleDamping;

      dummy.position.set(particle.cx, particle.cy, particle.cz);
      dummy.lookAt(projectedTargetX, projectedTargetY, particle.cz);
      dummy.rotateX(Math.PI / 2);
      dummy.rotateY(Math.sin(particle.t * 0.45 + particle.phase) * 0.12);

      const pulse = 0.92 + Math.sin(particle.t * pulseSpeed + particle.phase) * 0.08;
      const visibilityScale = 0.22 + influence * 0.78;
      const finalScale = visibilityScale * pulse * particle.size * particleSize;

      dummy.scale.set(finalScale * 0.82, finalScale, finalScale * 0.82);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
    });

    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      {particleShape === "capsule" && <capsuleGeometry args={[0.12, 0.56, 4, 8]} />}
      {particleShape === "sphere" && <sphereGeometry args={[0.2, 12, 12]} />}
      {particleShape === "box" && <boxGeometry args={[0.3, 0.3, 0.3]} />}
      {particleShape === "tetrahedron" && <tetrahedronGeometry args={[0.3]} />}
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.95}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </instancedMesh>
  );
}

function useResponsiveParticleCount(desktopCount, mobileCount) {
  const [count, setCount] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(max-width: 767px)").matches
      ? mobileCount
      : desktopCount,
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const updateCount = () => setCount(media.matches ? mobileCount : desktopCount);

    updateCount();
    media.addEventListener("change", updateCount);
    return () => media.removeEventListener("change", updateCount);
  }, [desktopCount, mobileCount]);

  return count;
}

export function Antigravity({ className = "", count = 300, mobileCount = Math.round(count * 0.55), ...props }) {
  const containerRef = useRef(null);
  const pointerRef = useRef({
    x: 0,
    y: 0,
    lastMoveTime: performance.now(),
  });
  const responsiveCount = useResponsiveParticleCount(count, mobileCount);

  useEffect(() => {
    const updatePointer = (event) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect?.width || !rect?.height) return;

      pointerRef.current.x = THREE.MathUtils.clamp(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -1.15,
        1.15,
      );
      pointerRef.current.y = THREE.MathUtils.clamp(
        -(((event.clientY - rect.top) / rect.height) * 2 - 1),
        -1.15,
        1.15,
      );
      pointerRef.current.lastMoveTime = performance.now();
    };

    window.addEventListener("pointermove", updatePointer, { passive: true });
    return () => window.removeEventListener("pointermove", updatePointer);
  }, []);

  return (
    <div ref={containerRef} className={`antigravity ${className}`} aria-hidden="true">
      <Canvas
        camera={{ position: [0, 0, 50], fov: 35 }}
        dpr={[1, 1.5]}
        gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
      >
        <AntigravityInner pointerRef={pointerRef} count={responsiveCount} {...props} />
      </Canvas>
    </div>
  );
}

export default Antigravity;
