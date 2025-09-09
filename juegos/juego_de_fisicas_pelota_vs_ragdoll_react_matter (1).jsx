// path: src/App.jsx
import React, { useEffect, useRef, useState } from "react";
import Matter from "matter-js";

// Matter
const { Engine, Render, Runner, Events, Constraint, MouseConstraint, Mouse, Body, Composite, Bodies } = Matter;

/**
 * APP (React, no TSX tooling requerido)
 * Soluciona el error "Unexpected token (/index.tsx)" migrando el HTML a un componente React
 * sin depender de un archivo .tsx. Mantiene el juego 100% funcional.
 */
export default function App() {
  // ---- Refs DOM ----
  const hostRef = useRef(null);
  const bgCanvasRef = useRef(null); // usado sólo si no carga imagen

  // ---- Estado UI ----
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(60);
  const [isRunning, setIsRunning] = useState(false);
  const [showGoal, setShowGoal] = useState(false);
  const [goalTyping, setGoalTyping] = useState("");
  const [showBoard, setShowBoard] = useState(false);
  const [leaderboard, setLeaderboard] = useState(() => loadLB());
  const [bgSrc, setBgSrc] = useState(null);

  // ---- Refs lógicas ----
  const scoreRef = useRef(0);
  const timerIdRef = useRef(null);
  const goalLockedRef = useRef(false);
  const DEBUG = useRef(false);

  // ---- Constantes de escena ----
  const WIDTH = Math.min(1000, typeof window !== "undefined" ? window.innerWidth : 1000);
  const HEIGHT = Math.min(700, typeof window !== "undefined" ? window.innerHeight : 700);
  const FIELD_TOP = "70%"; // altura de timer/botón

  // Geometría U cóncava
  const U_W = 72, U_H = 48, U_T = 8;
  const SPHERE_RADIUS = 20;
  const SENSOR_POS = 0.5; // 0=base del hueco, 1=techo
  const INSIDE_FRAMES_N = 8;

  // ---- Leaderboard helpers ----
  const LB_KEY = "sl_leaderboard_v1";
  function loadLB() { try { return JSON.parse(localStorage.getItem(LB_KEY) || "[]"); } catch { return []; } }
  function saveLB(items) { try { localStorage.setItem(LB_KEY, JSON.stringify(items)); } catch {} }

  // ---- Fondo: intentar cargar tu imagen (boca.jpg). Fallback a capas previas ----
  useEffect(() => {
    const candidates = [
      "/boca.jpg",
      "/boca.png",
      "/boca.jpeg",
    ];
    let cancelled = false;
    const tryNext = (i) => {
      if (i >= candidates.length) { if (!cancelled) setBgSrc(null); return; }
      const img = new Image();
      img.onload = () => { if (!cancelled) setBgSrc(candidates[i]); };
      img.onerror = () => tryNext(i + 1);
      img.src = candidates[i];
    };
    tryNext(0);
    return () => { cancelled = true; };
  }, []);

  // ---- Timer ----
  useEffect(() => {
    if (!isRunning) return;
    clearInterval(timerIdRef.current);
    timerIdRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerIdRef.current);
          endGame();
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(timerIdRef.current);
  }, [isRunning]);

  function startGame() {
    setShowBoard(false);
    setShowGoal(false);
    setScore(0); scoreRef.current = 0;
    setTimeLeft(60);
    goalLockedRef.current = false;
    setIsRunning(true);
  }

  function endGame() {
    setIsRunning(false);
    const name = (window.prompt("Tu nombre para la tabla:", "Anónimo") || "Anónimo").slice(0, 24);
    const entry = { name, score: scoreRef.current, date: new Date().toISOString() };
    const next = [...loadLB(), entry].sort((a,b)=> b.score - a.score || a.date.localeCompare(b.date)).slice(0, 10);
    saveLB(next); setLeaderboard(next); setShowBoard(true);
  }

  // ---- Motor Matter ----
  useEffect(() => {
    if (!hostRef.current) return;

    const engine = Engine.create();
    const render = Render.create({ element: hostRef.current, engine, options: { width: WIDTH, height: HEIGHT, wireframes: false, background: "transparent" } });
    const runner = Runner.create();
    Render.run(render); Runner.run(runner, engine);
    const world = engine.world;

    // Piso invisible
    const ground = Bodies.rectangle(WIDTH/2, HEIGHT, WIDTH*4, 66, { isStatic: true, render: { visible: false }, label: "ground" });

    // Pelota estática
    const targetSphere = Bodies.circle(610, 250, SPHERE_RADIUS, { isStatic: true, label: "target_sphere", render: { fillStyle: "#ffffff" } });

    // U cóncava + superficie de arrastre invisible
    const rockOptions = { density: 0.004, friction: 0.02, restitution: 0.1, label: "u_projectile" };
    const anchor = { x: 170, y: 450 };

    function createUProjectile(cx, cy, w=U_W, h=U_H, t=U_T, opts=rockOptions) {
      const top  = Bodies.rectangle(cx, cy - h/2 + t/2, w, t, { ...opts, label: "u_top",  render: { fillStyle: "#e2e8f0" } });
      const left = Bodies.rectangle(cx - w/2 + t/2, cy, t, h, { ...opts, label: "u_left", render: { fillStyle: "#e2e8f0" } });
      const right= Bodies.rectangle(cx + w/2 - t/2, cy, t, h, { ...opts, label: "u_right",render: { fillStyle: "#e2e8f0" } });
      const compound = Body.create({ label: opts.label || "u_projectile" });
      Body.setParts(compound, [compound, top, left, right]);
      Body.setPosition(compound, { x: cx, y: cy });
      const dragSurface = Bodies.rectangle(cx, cy, w, h, { isSensor: true, label: "u_drag_surface", render: { visible: false } });
      Body.setParts(compound, [compound, top, left, right, dragSurface], true);
      return { body: compound, parts: { top, left, right } };
    }

    let { body: rock, parts: rockParts } = createUProjectile(anchor.x, anchor.y);

    const elastic = Constraint.create({ pointA: anchor, bodyB: rock, length: 0.01, damping: 0.01, stiffness: 0.05, render: { strokeStyle: "#94a3b8" } });

    Composite.add(world, [ground, targetSphere, rock, elastic]);

    // Mouse
    const mouse = Mouse.create(render.canvas);
    const mouseConstraint = MouseConstraint.create(engine, { mouse, constraint: { stiffness: 0.2, render: { visible: false } } });
    Composite.add(world, mouseConstraint); render.mouse = mouse;

    // Disolución de rects tras 3s
    const toDissolve = new Map();
    const TTL_MS = 3000, FADE_MS = 800;
    const isRectangular = (b) => !b.circleRadius && b.vertices?.length === 4;
    const scheduleDissolveFor = (b) => { if (b.isStatic || b.label === "ground" || b.label === "target_sphere") return; const parent = b.parent || b; if (toDissolve.has(parent.id)) return; const now = engine.timing.timestamp; toDissolve.set(parent.id, { body: parent, due: now + TTL_MS, fadeMs: FADE_MS }); };

    Events.on(engine, "collisionStart", (evt) => {
      evt.pairs.forEach(({ bodyA:A, bodyB:B }) => {
        if (A.label === "ground" && isRectangular(B)) scheduleDissolveFor(B);
        if (B.label === "ground" && isRectangular(A)) scheduleDissolveFor(A);
      });
    });
    Events.on(engine, "beforeUpdate", () => {
      const now = engine.timing.timestamp;
      for (const [key, info] of Array.from(toDissolve.entries())) {
        const tUntil = info.due - now;
        if (tUntil <= 0) { Composite.remove(world, info.body, true); toDissolve.delete(key); continue; }
        if (tUntil <= info.fadeMs) {
          const a = Math.max(0, tUntil / info.fadeMs);
          info.body.render.opacity = a;
          if (info.body.parts?.length > 1) info.body.parts.forEach(p => p.render.opacity = a);
        }
      }
    });

    // Gol robusto
    let insideFrames = 0; let lastLocal = null;
    function worldToLocal(b, wx, wy){ const dx = wx - b.position.x, dy = wy - b.position.y, ca = Math.cos(-b.angle), sa = Math.sin(-b.angle); return { x: dx*ca - dy*sa, y: dx*sa + dy*ca }; }
    function localToWorld(b, lx, ly){ const ca = Math.cos(b.angle), sa = Math.sin(b.angle); return { x: b.position.x + lx*ca - ly*sa, y: b.position.y + lx*sa + ly*ca }; }
    function getUInnerGeometry(body, parts){
      const ll = worldToLocal(body, parts.left.position.x, parts.left.position.y);
      const rl = worldToLocal(body, parts.right.position.x, parts.right.position.y);
      const tl = worldToLocal(body, parts.top.position.x, parts.top.position.y);
      const innerLeft  = { x: ll.x + U_T/2, y: ll.y + U_H/2 };
      const innerRight = { x: rl.x - U_T/2, y: rl.y + U_H/2 };
      const innerBottomY = (innerLeft.y + innerRight.y)/2;
      const innerTopY = tl.y + U_T/2;
      const innerHalfW = Math.abs(innerRight.x - innerLeft.x)/2;
      const innerCenterX = (innerRight.x + innerLeft.x)/2;
      return { innerBottomY, innerTopY, innerHalfW, innerCenterX, innerLeft, innerRight };
    }
    function pointSegDist(px,py,ax,ay,bx,by){ const abx=bx-ax, aby=by-ay, apx=px-ax, apy=py-ay, ab2=abx*abx+aby*aby || 1e-6; let t=(apx*abx+apy*aby)/ab2; t=Math.max(0,Math.min(1,t)); const cx=ax+abx*t, cy=ay+aby*t; return Math.hypot(px-cx, py-cy); }

    function triggerGoal(){ if (!isRunning || goalLockedRef.current) return; goalLockedRef.current = true;
      setScore((s)=>{ const n=s+1; scoreRef.current=n; return n; });
      setShowGoal(true); setGoalTyping("");
      const msg = "GOOOOOOOOOLLLLL"; let i=0; const id = setInterval(()=>{ i++; setGoalTyping(msg.slice(0,i)); if(i>=msg.length){ clearInterval(id); setTimeout(()=>setShowGoal(false),1600);} },45);
    }

    function checkGoal(){
      if (goalLockedRef.current) return;
      const carrierBody = rock; const carrierParts = rockParts; if (!carrierBody || !carrierParts) return;
      const geom = getUInnerGeometry(carrierBody, carrierParts);
      const innerH = Math.max(2, geom.innerBottomY - geom.innerTopY);
      const sensorY = geom.innerBottomY - innerH * SENSOR_POS;
      const Ls = localToWorld(carrierBody, geom.innerLeft.x, sensorY);
      const Rs = localToWorld(carrierBody, geom.innerRight.x, sensorY);
      const c = targetSphere.position; const cl = worldToLocal(carrierBody, c.x, c.y);
      const dist = pointSegDist(c.x, c.y, Ls.x, Ls.y, Rs.x, Rs.y);
      const near = dist <= SPHERE_RADIUS*1.05; if (!near) insideFrames = 0;
      const prev = lastLocal; lastLocal = { lx: cl.x, ly: cl.y };
      const alignedX = Math.abs(cl.x - geom.innerCenterX) <= (geom.innerHalfW - 2);
      const crossedUp = near && prev ? (prev.ly > sensorY && cl.y <= sensorY) : false;
      const insideNow = near && alignedX && cl.y <= sensorY - 1;
      insideFrames = insideNow ? insideFrames + 1 : 0;
      if ((prev && crossedUp && alignedX) || insideFrames >= INSIDE_FRAMES_N) triggerGoal();
    }

    // Limitar velocidad
    const clampSpeed = (b) => { const s = Math.hypot(b.velocity.x, b.velocity.y), MAX = 45; if (s > MAX) Body.setVelocity(b, { x: b.velocity.x*(MAX/s), y: b.velocity.y*(MAX/s) }); };

    // Bucle principal
    Events.on(engine, "afterUpdate", () => {
      if (isRunning) checkGoal();
      if (render && DEBUG.current) {
        render.options.hasBounds = false; // aseguramos vista completa
      }
      const mc = mouseConstraint; if (!mc) return;
      if (mc.mouse.button === -1 && (rock.position.x > 190 || rock.position.y < 430)) {
        clampSpeed(rock);
        const created = createUProjectile(anchor.x, anchor.y); rock = created.body; rockParts = created.parts; Composite.add(world, rock); elastic.bodyB = rock;
        lastLocal = null; insideFrames = 0; goalLockedRef.current = false;
      }
    });

    // Render "skin" de fútbol + debug del U (stroke, sin fill, no tapa)
    function polygonPath(ctx, sides, r, rot=0){ ctx.beginPath(); for(let i=0;i<sides;i++){ const a=rot + i*(2*Math.PI/sides) - Math.PI/2; const x=Math.cos(a)*r, y=Math.sin(a)*r; i?ctx.lineTo(x,y):ctx.moveTo(x,y);} ctx.closePath(); }
    Events.on(render, "afterRender", () => {
      const ctx = render.context;
      // Balón
      const x = targetSphere.position.x, y = targetSphere.position.y, r = SPHERE_RADIUS;
      ctx.save(); ctx.translate(x,y); ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.closePath(); ctx.clip();
      const g = ctx.createRadialGradient(-r*.3,-r*.3,r*.2, 0,0,r); g.addColorStop(0,"#fff"); g.addColorStop(1,"#e9e9e9"); ctx.fillStyle=g; ctx.fillRect(-r,-r,2*r,2*r);
      ctx.fillStyle="#111"; polygonPath(ctx,5,r*.42); ctx.fill();
      ctx.fillStyle="#fff"; for(let i=0;i<5;i++){ const ang=i*(2*Math.PI/5); ctx.save(); ctx.translate(Math.cos(ang)*r*.67, Math.sin(ang)*r*.67); polygonPath(ctx,6,r*.22, ang/2); ctx.fill(); ctx.restore(); }
      ctx.fillStyle="#111"; for(let i=0;i<5;i++){ const ang=(i+.5)*(2*Math.PI/5); ctx.save(); ctx.translate(Math.cos(ang)*r*.92, Math.sin(ang)*r*.92); polygonPath(ctx,5,r*.12, ang); ctx.fill(); ctx.restore(); }
      ctx.strokeStyle="#5f5f5f"; ctx.lineWidth=1; for(let i=0;i<12;i++){ const a0=i*(Math.PI/6); ctx.beginPath(); ctx.arc(0,0,r*.97,a0, a0+Math.PI/8); ctx.stroke(); }
      ctx.restore();

      // Debug del U
      if (DEBUG.current && rock) {
        const parts = rock.parts || [];
        const stroke = (b, color, dashed=false) => {
          if (!b?.vertices?.length) return;
          if (dashed) ctx.setLineDash([6,6]); else ctx.setLineDash([]);
          ctx.beginPath(); ctx.moveTo(b.vertices[0].x, b.vertices[0].y);
          for (let i=1;i<b.vertices.length;i++) ctx.lineTo(b.vertices[i].x, b.vertices[i].y);
          ctx.closePath(); ctx.lineWidth=2; ctx.strokeStyle=color; ctx.stroke();
        };
        const topP   = parts.find(p=>p.label==='u_top');
        const leftP  = parts.find(p=>p.label==='u_left');
        const rightP = parts.find(p=>p.label==='u_right');
        const drag   = parts.find(p=>p.label==='u_drag_surface');
        if (topP)  stroke(topP,  '#111827');
        if (leftP) stroke(leftP, '#111827');
        if (rightP)stroke(rightP,'#111827');
        if (drag)  stroke(drag,  '#ff00aa', true);
      }
    });

    // Teclas
    const onKey = (e) => { const k = e.key.toLowerCase(); if (k === 'd') DEBUG.current = !DEBUG.current; };
    window.addEventListener('keydown', onKey);

    // Ajustar viewport
    Render.lookAt(render, { min: { x: 0, y: 0 }, max: { x: WIDTH, y: HEIGHT } });

    // Limpieza
    return () => {
      window.removeEventListener('keydown', onKey);
      try { Render.stop(render); } catch {}
      try { Runner.stop(runner); } catch {}
      if (render.canvas?.parentNode) render.canvas.parentNode.removeChild(render.canvas);
      Engine.clear(engine);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Self-tests (min) ----
  useEffect(() => {
    console.assert(typeof Matter === 'object', '[TEST] matter-js cargado');
    console.assert(typeof document !== 'undefined', '[TEST] DOM disponible');
  }, []);

  // ---- Fallback tribuna (si no hay imagen, pinto puntitos en canvas) ----
  useEffect(() => {
    if (bgSrc || !bgCanvasRef.current) return;
    const cvs = bgCanvasRef.current; const W = WIDTH; const H = Math.floor(HEIGHT * 0.08);
    cvs.width = W; cvs.height = H; const ctx = cvs.getContext('2d'); if (!ctx) return;
    const dots = ["#6d4c41", "#8d6e63", "#a1887f", "#c7b7ae"]; const hairs = ["#f7e8a1", "#8d5524", "#0b0b0b", "#6a0dad", "#00bcd4"];
    const COUNT = Math.floor((W * H) / 18);
    ctx.clearRect(0,0,W,H);
    for (let i = 0; i < COUNT; i++) {
      const r = 6 + Math.random() * 2, x = Math.random() * W, y = Math.random() * H;
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fillStyle = dots[(Math.random()*dots.length)|0]; ctx.fill();
      const hairsN = 1 + ((Math.random()*3)|0);
      for (let h=0; h<hairsN; h++) {
        const ang = -Math.PI/2 + (Math.random()-0.5)*0.8, len = r*(1.1 + Math.random()*0.7);
        const hx0 = x + Math.cos(ang)*(r*0.5), hy0 = y + Math.sin(ang)*(r*0.5);
        const hx1 = hx0 + Math.cos(ang - 0.4 + Math.random()*0.8)*len, hy1 = hy0 + Math.sin(ang - 0.4 + Math.random()*0.8)*len;
        ctx.strokeStyle = hairs[(Math.random()*hairs.length)|0]; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx0, hy0); ctx.lineTo(hx1, hy1); ctx.stroke();
      }
    }
  }, [bgSrc, WIDTH, HEIGHT]);

  // ---- Render UI React ----
  return (
    <div style={{ position: "relative", width: "100%", height: "100vh", overflow: "hidden", background: "#000" }}>
      {/* Fondo */}
      <div style={{ position: "absolute", inset: 0, zIndex: 0, overflow: 'hidden' }}>
        {bgSrc ? (
          <>
            <img src={bgSrc} alt="tribuna" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.05)' }} />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.35), rgba(0,0,0,0.15) 40%, rgba(0,0,0,0))' }} />
          </>
        ) : (
          <>
            <div style={{ position: "absolute", left: 0, top: 0, right: 0, height: "62%", background: "#87CEEB" }} />
            <div style={{ position: "absolute", left: 0, top: "62%", right: 0, height: "8%", background: "#9aa0a6", overflow: "hidden" }}>
              <canvas ref={bgCanvasRef} style={{ width: "100%", height: "100%", display: "block", opacity: 0.95 }} />
            </div>
            <div style={{ position: "absolute", left: 0, bottom: 0, right: 0, height: "30%", background: "#2e7d32" }} />
          </>
        )}
      </div>

      {/* Lienzo de Matter */}
      <div ref={hostRef} style={{ position: "absolute", inset: 0, zIndex: 1 }} />

      {/* GOLES (izq., negro, chico) */}
      <div style={{ position: "absolute", top: 8, left: 8, zIndex: 10, color: "#000", fontWeight: 800, fontSize: "clamp(16px,3vw,28px)", userSelect: "none" }}>
        GOLES {score}
      </div>

      {/* Timer */}
      <div style={{ position: "absolute", top: FIELD_TOP, right: 8, transform: "translateY(-50%)", zIndex: 10 }}>
        <div style={{ background: "rgba(0,0,0,0.55)", color: "#fff", padding: "6px 10px", borderRadius: 10, fontWeight: 800, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}>
          {String(Math.floor(timeLeft/60)).padStart(2,'0')}:{String(timeLeft%60).padStart(2,'0')}
        </div>
      </div>

      {/* Iniciar */}
      {!isRunning && !showBoard && (
        <button onClick={startGame} style={{ position: "absolute", top: FIELD_TOP, left: "50%", transform: "translate(-50%, -50%)", zIndex: 12, background: '#16a34a', color: '#fff', border: 'none', padding: '16px 28px', borderRadius: 14, fontWeight: 900, fontSize: 24, cursor: 'pointer', boxShadow: '0 18px 48px rgba(0,0,0,0.45)' }}>
          Iniciar
        </button>
      )}

      {/* Overlay Gol */}
      {showGoal && (
        <div style={{ position: "absolute", inset: 0, zIndex: 5, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.2)", pointerEvents: "none" }}>
          <span style={{ fontSize: "min(16vw, 16vh)", fontWeight: 900, color: "#fff", WebkitTextStroke: "2px #111", textShadow: "0 8px 24px rgba(0,0,0,0.55)", letterSpacing: 2, animation: "pop 0.6s ease-out" }}>{goalTyping}</span>
        </div>
      )}

      {/* Leaderboard */}
      {showBoard && (
        <div style={{ position: "absolute", inset: 0, zIndex: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.45)' }}>
          <div style={{ background: '#111827', color: '#fff', padding: 20, borderRadius: 14, width: 'min(92vw, 520px)', boxShadow: '0 18px 48px rgba(0,0,0,0.55)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h2 style={{ margin: 0, fontSize: 22, letterSpacing: 1 }}>Tabla de posiciones</h2>
              <button onClick={() => setShowBoard(false)} style={{ background: 'transparent', color: '#fff', border: '1px solid #374151', borderRadius: 8, padding: '6px 10px', cursor: 'pointer' }}>Cerrar</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#9ca3af' }}>
                  <th style={{ padding: '6px 8px' }}>#</th>
                  <th style={{ padding: '6px 8px' }}>Jugador</th>
                  <th style={{ padding: '6px 8px' }}>Goles</th>
                  <th style={{ padding: '6px 8px' }}>Fecha</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r, i) => (
                  <tr key={`${r.name}-${r.date}`} style={{ background: i % 2 ? '#0b0b0b' : 'transparent' }}>
                    <td style={{ padding: '6px 8px', fontWeight: 800 }}>{i + 1}</td>
                    <td style={{ padding: '6px 8px' }}>{r.name}</td>
                    <td style={{ padding: '6px 8px', fontWeight: 800 }}>{r.score}</td>
                    <td style={{ padding: '6px 8px' }}>{new Date(r.date).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => { setShowBoard(false); startGame(); }} style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>Volver a jugar</button>
              <button onClick={() => { saveLB([]); setLeaderboard([]); }} style={{ background: 'transparent', color: '#fca5a5', border: '1px solid #4b5563', padding: '8px 12px', borderRadius: 10, fontWeight: 800, cursor: 'pointer' }}>Limpiar tabla</button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes pop { from { transform: scale(0.9); opacity: 0.6; } to { transform: scale(1); opacity: 1; } }`}</style>
    </div>
  );
}
