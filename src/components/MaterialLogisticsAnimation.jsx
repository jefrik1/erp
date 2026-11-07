import { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'motion/react';
import { Truck, Package, Layers, Sparkles } from 'lucide-react';

const MATERIALS = [
  {
    id: 'semen',
    name: 'Semen Portland 50kg',
    type: 'pallet',
    weight: '12.450 kg',
    color: '#10b981', // emerald
    label: 'Pallet Semen SNI',
    desc: '320 Sak Semen Gresik • Standar SNI 2049:2015',
  },
  {
    id: 'besi',
    name: 'Besi Beton Ulir SNI',
    type: 'steel',
    weight: '16.800 kg',
    color: '#38bdf8', // sky
    label: 'Bundel Baja Tulangan',
    desc: 'Besi D13 & D16 BjTS 420B • Toleransi ±3.5%',
  },
  {
    id: 'bata',
    name: 'Bata Ringan AAC Hebel',
    type: 'blocks',
    weight: '9.200 kg',
    color: '#a78bfa', // purple
    label: 'Pallet Bata Ringan',
    desc: 'Precision AAC Blocks 60x20x10 cm • 14.4 m³',
  },
];

export default function MaterialLogisticsAnimation() {
  const containerRef = useRef(null);
  const [activeMatIdx, setActiveMatIdx] = useState(0);
  const [loadCycle, setLoadCycle] = useState(0);
  const [isLanded, setIsLanded] = useState(false);
  const [truckBounce, setTruckBounce] = useState(false);

  // Mouse Parallax Effect (3D Depth tilt)
  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 120 };
  const smoothMouseX = useSpring(mouseX, springConfig);
  const smoothMouseY = useSpring(mouseY, springConfig);

  const tiltX = useTransform(smoothMouseY, [-0.5, 0.5], [6, -6]);
  const tiltY = useTransform(smoothMouseX, [-0.5, 0.5], [-8, 8]);
  const panX = useTransform(smoothMouseX, [-0.5, 0.5], [-12, 12]);
  const panY = useTransform(smoothMouseY, [-0.5, 0.5], [-8, 8]);

  const handleMouseMove = (e) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    mouseX.set(x);
    mouseY.set(y);
  };

  const handleMouseLeave = () => {
    mouseX.set(0);
    mouseY.set(0);
  };

  // Automated loading sequence loop
  useEffect(() => {
    const cycleTimer = setInterval(() => {
      setLoadCycle((c) => c + 1);
      // Trigger truck suspension bounce when cargo lands
      setTimeout(() => {
        setIsLanded(true);
        setTruckBounce(true);
        setTimeout(() => setTruckBounce(false), 600);
      }, 2600);

      // Reset for next material load
      setTimeout(() => {
        setIsLanded(false);
        setActiveMatIdx((prev) => (prev + 1) % MATERIALS.length);
      }, 5500);
    }, 6000);

    return () => clearInterval(cycleTimer);
  }, []);

  const currentMat = MATERIALS[activeMatIdx];

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className="absolute inset-0 overflow-hidden pointer-events-auto select-none"
      style={{ perspective: 1200 }}
    >
      {/* Ambient Industrial Fog & Light Beam */}
      <div className="absolute inset-0 bg-gradient-to-t from-navy via-navy/60 to-transparent z-10 pointer-events-none" />

      {/* Laser Alignment Guide Beam (Warehouse Docking Guidance) */}
      <motion.div
        className="absolute bottom-[92px] left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent"
        animate={{ opacity: [0.3, 0.8, 0.3], scaleY: [1, 2, 1] }}
        transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.div
        className="absolute bottom-[90px] left-[32%] w-[380px] h-[35px] bg-cyan-400/10 blur-[18px] pointer-events-none"
        animate={{ opacity: [0.2, 0.5, 0.2] }}
        transition={{ duration: 3, repeat: Infinity }}
      />

      {/* Floating Material Dust / Industrial Micro-particles */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-1 h-1 rounded-full bg-cyan-300/40 pointer-events-none"
          initial={{
            x: 80 + i * 70,
            y: 280 + (i % 3) * 40,
            opacity: 0.1,
          }}
          animate={{
            y: [280 + (i % 3) * 40, 220 + (i % 3) * 30, 280 + (i % 3) * 40],
            x: [80 + i * 70, 95 + i * 70, 80 + i * 70],
            opacity: [0.1, 0.6, 0.1],
          }}
          transition={{
            duration: 4 + i * 1.2,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: i * 0.7,
          }}
        />
      ))}

      {/* 3D Parallax Canvas Wrapper */}
      <motion.div
        className="absolute inset-0 flex flex-col justify-end pb-8 pl-6 pr-6"
        style={{
          rotateX: tiltX,
          rotateY: tiltY,
          x: panX,
          y: panY,
          transformStyle: 'preserve-3d',
        }}
      >
        {/* Telemetry HUD Badge: Dock Bay 04 & Material Payload */}
        <div className="relative z-20 mb-3 flex items-center justify-between max-w-[560px]">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.06] border border-white/10 backdrop-blur-md shadow-lg">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            <span className="w-2 h-2 rounded-full bg-emerald-400 -ml-3" />
            <span className="font-mono text-[10px] tracking-wider text-emerald-300 font-bold uppercase">
              Dock Bay 04 • Loading Otomatis
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {MATERIALS.map((m, idx) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setActiveMatIdx(idx);
                  setIsLanded(true);
                  setTruckBounce(true);
                  setTimeout(() => setTruckBounce(false), 500);
                }}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-mono font-semibold transition-all duration-300 ${
                  activeMatIdx === idx
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-400/50 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                    : 'bg-white/5 text-white/40 border border-white/10 hover:text-white/70 hover:bg-white/10'
                }`}
              >
                {m.id === 'semen' ? 'Semen' : m.id === 'besi' ? 'Besi Baja' : 'Bata Ringan'}
              </button>
            ))}
          </div>
        </div>

        {/* Main Vector Scene: Crane + Truck + Materials */}
        <div className="relative w-full max-w-[620px] h-[220px]">
          <svg
            viewBox="0 0 680 240"
            className="w-full h-full overflow-visible drop-shadow-[0_12px_24px_rgba(0,0,0,0.5)]"
          >
            <defs>
              {/* Neon Glow filters */}
              <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
              <filter id="glow-amber" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="2.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>

              {/* Steel Gradients */}
              <linearGradient id="truck-cab" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#334155" />
                <stop offset="50%" stopColor="#1e293b" />
                <stop offset="100%" stopColor="#0f172a" />
              </linearGradient>
              <linearGradient id="chassis-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#475569" />
                <stop offset="100%" stopColor="#1e293b" />
              </linearGradient>
              <linearGradient id="hazard-pattern" x1="0" y1="0" x2="20" y2="20" gradientUnits="userSpaceOnUse">
                <path d="M0,20 L20,0 M10,30 L30,10 M-10,10 L10,-10" stroke="#f59e0b" strokeWidth="4" />
                <path d="M0,20 L20,0 M10,30 L30,10 M-10,10 L10,-10" stroke="#000" strokeWidth="1" />
              </linearGradient>
              <linearGradient id="steel-rebar" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#64748b" />
                <stop offset="30%" stopColor="#94a3b8" />
                <stop offset="50%" stopColor="#e2e8f0" />
                <stop offset="70%" stopColor="#94a3b8" />
                <stop offset="100%" stopColor="#475569" />
              </linearGradient>
            </defs>

            {/* Warehouse Gantry Crane Structure Overhead */}
            <g id="gantry-rail" opacity="0.45">
              {/* Main horizontal beam */}
              <rect x="20" y="16" width="640" height="10" fill="#334155" rx="2" />
              <line x1="20" y1="21" x2="660" y2="21" stroke="#38bdf8" strokeWidth="1" strokeDasharray="6 4" opacity="0.6" />
              {/* Structural truss brackets */}
              <line x1="50" y1="16" x2="70" y2="26" stroke="#475569" strokeWidth="1.5" />
              <line x1="120" y1="16" x2="140" y2="26" stroke="#475569" strokeWidth="1.5" />
              <line x1="190" y1="16" x2="210" y2="26" stroke="#475569" strokeWidth="1.5" />
              <line x1="260" y1="16" x2="280" y2="26" stroke="#475569" strokeWidth="1.5" />
              <line x1="330" y1="16" x2="350" y2="26" stroke="#475569" strokeWidth="1.5" />
              <line x1="400" y1="16" x2="420" y2="26" stroke="#475569" strokeWidth="1.5" />
              <line x1="470" y1="16" x2="490" y2="26" stroke="#475569" strokeWidth="1.5" />
              <line x1="540" y1="16" x2="560" y2="26" stroke="#475569" strokeWidth="1.5" />
              <line x1="610" y1="16" x2="630" y2="26" stroke="#475569" strokeWidth="1.5" />
            </g>

            {/* Conveyor Belt on the Left (Material Staging Line) */}
            <g id="conveyor-staging">
              <rect x="35" y="152" width="165" height="12" fill="#1e293b" rx="3" stroke="#334155" strokeWidth="1" />
              {/* Conveyor rollers */}
              {[...Array(9)].map((_, i) => (
                <motion.circle
                  key={i}
                  cx={46 + i * 18}
                  cy="158"
                  r="4.5"
                  fill="#475569"
                  stroke="#94a3b8"
                  strokeWidth="1"
                  animate={{ rotate: 360 }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'linear' }}
                />
              ))}
              {/* Conveyor legs */}
              <line x1="55" y1="164" x2="55" y2="210" stroke="#334155" strokeWidth="3" />
              <line x1="175" y1="164" x2="175" y2="210" stroke="#334155" strokeWidth="3" />
              <line x1="45" y1="210" x2="185" y2="210" stroke="#1e293b" strokeWidth="2" />
            </g>

            {/* Warehouse Staging Pallet on the Conveyor */}
            <g id="staging-material-pack">
              <rect x="75" y="132" width="85" height="20" fill="#0f172a" rx="2" stroke="#334155" strokeWidth="1" />
              <rect x="79" y="135" width="77" height="14" fill={currentMat.color} opacity="0.3" rx="1.5" />
              <text x="117" y="146" textAnchor="middle" fill="#ffffff" fontSize="7" fontFamily="monospace" fontWeight="bold">
                QUEUE: READY
              </text>
            </g>

            {/* Automated Crane Hoist & Material Payload (Animated Loading Loop) */}
            <motion.g
              id="automated-crane-hoist"
              animate={{
                x: [0, 0, 220, 220, 0],
              }}
              transition={{
                duration: 6,
                times: [0, 0.25, 0.45, 0.85, 1],
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              {/* Crane Trolley / Carriage on Rail */}
              <rect x="95" y="14" width="46" height="14" fill="#0284c7" rx="2" stroke="#38bdf8" strokeWidth="1" />
              <circle cx="106" cy="14" r="3" fill="#94a3b8" />
              <circle cx="130" cy="14" r="3" fill="#94a3b8" />
              {/* Flashing yellow hoist beacon */}
              <circle cx="118" cy="11" r="2.5" fill="#f59e0b" filter="url(#glow-amber)" />

              {/* Steel Cable (Expands / Retracts dynamically) */}
              <motion.line
                x1="118"
                y1="28"
                x2="118"
                animate={{
                  y2: [126, 45, 45, 126, 126],
                }}
                transition={{
                  duration: 6,
                  times: [0, 0.25, 0.45, 0.85, 1],
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
                stroke="#94a3b8"
                strokeWidth="2"
                strokeDasharray="2 1"
              />

              {/* Crane Hook & Spreader Beam */}
              <motion.g
                animate={{
                  y: [86, 5, 5, 86, 86],
                }}
                transition={{
                  duration: 6,
                  times: [0, 0.25, 0.45, 0.85, 1],
                  repeat: Infinity,
                  ease: 'easeInOut',
                }}
              >
                {/* Spreader beam */}
                <rect x="80" y="40" width="76" height="6" fill="#f59e0b" rx="1.5" />
                <line x1="82" y1="46" x2="86" y2="52" stroke="#94a3b8" strokeWidth="1.5" />
                <line x1="154" y1="46" x2="150" y2="52" stroke="#94a3b8" strokeWidth="1.5" />

                {/* THE MOVING MATERIAL CARGO UNIT */}
                <g transform="translate(82, 48)">
                  {currentMat.type === 'pallet' && (
                    /* Stacked Cement Sacks */
                    <g id="cement-pallet-cargo">
                      {/* Wooden Euro Pallet */}
                      <rect x="0" y="24" width="72" height="6" fill="#854d0e" rx="1" />
                      <rect x="4" y="27" width="12" height="3" fill="#451a03" />
                      <rect x="30" y="27" width="12" height="3" fill="#451a03" />
                      <rect x="56" y="27" width="12" height="3" fill="#451a03" />
                      {/* Row 1 Sacks */}
                      <rect x="2" y="16" width="22" height="8" rx="2" fill="#047857" stroke="#065f46" strokeWidth="0.5" />
                      <rect x="25" y="16" width="22" height="8" rx="2" fill="#059669" stroke="#065f46" strokeWidth="0.5" />
                      <rect x="48" y="16" width="22" height="8" rx="2" fill="#047857" stroke="#065f46" strokeWidth="0.5" />
                      {/* Row 2 Sacks */}
                      <rect x="6" y="8" width="28" height="8" rx="2" fill="#10b981" stroke="#065f46" strokeWidth="0.5" />
                      <rect x="36" y="8" width="28" height="8" rx="2" fill="#10b981" stroke="#065f46" strokeWidth="0.5" />
                      {/* Row 3 Top Sack */}
                      <rect x="14" y="1" width="44" height="7" rx="2" fill="#34d399" stroke="#065f46" strokeWidth="0.5" />
                      {/* Strapping band */}
                      <line x1="20" y1="0" x2="20" y2="30" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 1" />
                      <line x1="52" y1="0" x2="52" y2="30" stroke="#f59e0b" strokeWidth="1" strokeDasharray="3 1" />
                    </g>
                  )}

                  {currentMat.type === 'steel' && (
                    /* Bundled Rebar Steel */
                    <g id="steel-rebar-cargo">
                      {/* Wooden Dunnage supports */}
                      <rect x="4" y="22" width="64" height="5" fill="#525252" rx="1" />
                      {/* Cylindrical steel bars */}
                      <rect x="0" y="14" width="72" height="8" fill="url(#steel-rebar)" rx="2" />
                      <rect x="4" y="7" width="64" height="8" fill="url(#steel-rebar)" rx="2" />
                      <rect x="10" y="0" width="52" height="8" fill="url(#steel-rebar)" rx="2" />
                      {/* High-visibility blue steel strapping */}
                      <rect x="14" y="-1" width="3" height="24" fill="#0284c7" />
                      <rect x="35" y="-1" width="3" height="24" fill="#0284c7" />
                      <rect x="55" y="-1" width="3" height="24" fill="#0284c7" />
                      {/* SNI tag */}
                      <rect x="24" y="5" width="10" height="6" fill="#f8fafc" rx="1" />
                      <text x="29" y="9.5" textAnchor="middle" fill="#0f172a" fontSize="3.5" fontWeight="bold">SNI</text>
                    </g>
                  )}

                  {currentMat.type === 'blocks' && (
                    /* Bata Ringan AAC Blocks */
                    <g id="blocks-cargo">
                      <rect x="2" y="24" width="68" height="5" fill="#78350f" rx="1" />
                      {/* Block grid */}
                      {[0, 1, 2].map((row) =>
                        [0, 1, 2, 3].map((col) => (
                          <rect
                            key={`${row}-${col}`}
                            x={4 + col * 16}
                            y={3 + row * 7}
                            width="15"
                            height="6.5"
                            fill="#e2e8f0"
                            stroke="#94a3b8"
                            strokeWidth="0.5"
                            rx="1"
                          />
                        ))
                      )}
                      {/* Shrinkwrap plastic shine */}
                      <rect x="3" y="2" width="66" height="22" fill="#c084fc" opacity="0.25" rx="1" />
                      <line x1="20" y1="2" x2="20" y2="28" stroke="#a855f7" strokeWidth="1" strokeDasharray="4 2" />
                      <line x1="52" y1="2" x2="52" y2="28" stroke="#a855f7" strokeWidth="1" strokeDasharray="4 2" />
                    </g>
                  )}
                </g>
              </motion.g>
            </motion.g>

            {/* IMPACT DUST / SPARK PARTICLES ON TRUCK BED */}
            {truckBounce && (
              <g id="landing-impact-particles" transform="translate(355, 160)">
                <circle cx="-15" cy="0" r="3" fill="#38bdf8" opacity="0.8">
                  <animate attributeName="r" values="1;6;0" dur="0.45s" repeatCount="1" />
                  <animate attributeName="opacity" values="0.8;0" dur="0.45s" repeatCount="1" />
                </circle>
                <circle cx="15" cy="0" r="3" fill="#34d399" opacity="0.8">
                  <animate attributeName="r" values="1;7;0" dur="0.45s" repeatCount="1" />
                  <animate attributeName="opacity" values="0.8;0" dur="0.45s" repeatCount="1" />
                </circle>
                <circle cx="0" cy="-4" r="4" fill="#facc15" opacity="0.9">
                  <animate attributeName="r" values="2;8;0" dur="0.4s" repeatCount="1" />
                  <animate attributeName="opacity" values="0.9;0" dur="0.4s" repeatCount="1" />
                </circle>
              </g>
            )}

            {/* THE HEAVY FLATBED CARGO TRUCK (TRUK EKSPEDISI MATERIAL) */}
            <motion.g
              id="logistics-truck"
              animate={
                truckBounce
                  ? { y: [0, 4.5, 1, 0] }
                  : { y: [0, -1.2, 0] }
              }
              transition={
                truckBounce
                  ? { duration: 0.55, ease: 'easeOut' }
                  : { duration: 2.5, repeat: Infinity, ease: 'easeInOut' }
              }
            >
              {/* Truck Headlight Beam casting onto warehouse floor */}
              <polygon
                points="580,180 670,165 670,225 580,195"
                fill="url(#beam-gradient)"
                opacity="0.35"
                filter="url(#glow-cyan)"
              />
              <linearGradient id="beam-gradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
              </linearGradient>

              {/* Truck Flatbed Platform with Hazard Warning Stripes */}
              <rect x="250" y="165" width="220" height="9" fill="#1e293b" rx="2" stroke="#334155" strokeWidth="1" />
              {/* Diamond-plate hazard stripe on trailer side */}
              <rect x="252" y="166" width="216" height="5" fill="#f59e0b" opacity="0.85" rx="1" />
              <line x1="265" y1="166" x2="272" y2="171" stroke="#0f172a" strokeWidth="2.5" />
              <line x1="285" y1="166" x2="292" y2="171" stroke="#0f172a" strokeWidth="2.5" />
              <line x1="305" y1="166" x2="312" y2="171" stroke="#0f172a" strokeWidth="2.5" />
              <line x1="325" y1="166" x2="332" y2="171" stroke="#0f172a" strokeWidth="2.5" />
              <line x1="345" y1="166" x2="352" y2="171" stroke="#0f172a" strokeWidth="2.5" />
              <line x1="365" y1="166" x2="372" y2="171" stroke="#0f172a" strokeWidth="2.5" />
              <line x1="385" y1="166" x2="392" y2="171" stroke="#0f172a" strokeWidth="2.5" />
              <line x1="405" y1="166" x2="412" y2="171" stroke="#0f172a" strokeWidth="2.5" />
              <line x1="425" y1="166" x2="432" y2="171" stroke="#0f172a" strokeWidth="2.5" />
              <line x1="445" y1="166" x2="452" y2="171" stroke="#0f172a" strokeWidth="2.5" />

              {/* Previously Loaded Cargo Stack on Rear Bed (Persistent Material Stack) */}
              <g id="preloaded-cargo-stack">
                {/* Cargo Pallet 1 (Rear) */}
                <rect x="260" y="142" width="65" height="23" fill="#0f172a" rx="2" stroke="#334155" strokeWidth="1" />
                <rect x="263" y="144" width="59" height="19" fill="#10b981" opacity="0.35" rx="1.5" />
                <text x="292" y="156" textAnchor="middle" fill="#34d399" fontSize="6.5" fontFamily="monospace" fontWeight="bold">
                  SEMEN 50KG
                </text>
                {/* Tie-down ratchet strap */}
                <line x1="275" y1="142" x2="275" y2="165" stroke="#f59e0b" strokeWidth="1.5" />
                <line x1="310" y1="142" x2="310" y2="165" stroke="#f59e0b" strokeWidth="1.5" />
              </g>

              {/* Newly Loaded Cargo Unit on Center Bed (Revealed on Landing) */}
              <motion.g
                id="active-loaded-cargo"
                initial={{ opacity: 0.6 }}
                animate={{
                  opacity: isLanded ? 1 : 0.4,
                  scale: isLanded ? [0.98, 1] : 0.95,
                }}
                transition={{ duration: 0.3 }}
              >
                <rect x="335" y="138" width="70" height="27" fill="#0f172a" rx="2" stroke={currentMat.color} strokeWidth="1" />
                <rect x="338" y="141" width="64" height="21" fill={currentMat.color} opacity="0.25" rx="1.5" />
                <text x="370" y="153" textAnchor="middle" fill="#ffffff" fontSize="6.5" fontFamily="monospace" fontWeight="bold">
                  {currentMat.id === 'semen' ? 'SEMEN SNI' : currentMat.id === 'besi' ? 'BESI D16' : 'HEBEL AAC'}
                </text>
                <text x="370" y="160" textAnchor="middle" fill={currentMat.color} fontSize="5" fontFamily="monospace">
                  {currentMat.weight}
                </text>
                {/* Steel Ratchet Tie-Down Straps */}
                <line x1="350" y1="138" x2="350" y2="165" stroke="#f59e0b" strokeWidth="1.5" />
                <line x1="390" y1="138" x2="390" y2="165" stroke="#f59e0b" strokeWidth="1.5" />
              </motion.g>

              {/* Truck Headboard / Cab Guard Steel Bulkhead */}
              <rect x="466" y="125" width="8" height="49" fill="#334155" rx="1.5" />
              <line x1="470" y1="128" x2="470" y2="170" stroke="#64748b" strokeWidth="1" />

              {/* Heavy Truck Cab (Cab-Over Design) */}
              <path
                d="M474,174 L474,120 Q474,112 482,112 L530,112 Q540,112 546,122 L568,150 Q572,156 572,164 L572,174 Z"
                fill="url(#truck-cab)"
                stroke="#475569"
                strokeWidth="1.5"
              />

              {/* Driver Cabin Windshield & Window with Amber Interior Glow */}
              <path
                d="M484,120 L526,120 Q534,120 538,127 L556,150 L484,150 Z"
                fill="#f59e0b"
                opacity="0.3"
                stroke="#64748b"
                strokeWidth="1"
              />
              {/* Window Reflection Streak */}
              <line x1="500" y1="122" x2="525" y2="148" stroke="#ffffff" strokeWidth="1.5" opacity="0.4" />

              {/* Side Mirror */}
              <rect x="548" y="132" width="5" height="15" fill="#1e293b" rx="1" stroke="#64748b" strokeWidth="1" />
              <line x1="544" y1="138" x2="548" y2="138" stroke="#475569" strokeWidth="1.5" />

              {/* Chrome Dual Exhaust Stack */}
              <rect x="478" y="94" width="5" height="28" fill="#94a3b8" rx="1" />
              <path d="M478,94 Q478,88 474,86 L471,86" stroke="#94a3b8" strokeWidth="3" fill="none" />
              {/* Exhaust Heat micro-particles */}
              <motion.circle
                cx="469"
                cy="85"
                r="1.5"
                fill="#64748b"
                animate={{ y: [-1, -12], x: [-1, -6], opacity: [0.6, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
              />

              {/* Front Chrome Bumper & Grille */}
              <rect x="562" y="162" width="14" height="15" fill="#64748b" rx="2" />
              <line x1="565" y1="166" x2="574" y2="166" stroke="#94a3b8" strokeWidth="1" />
              <line x1="565" y1="170" x2="574" y2="170" stroke="#94a3b8" strokeWidth="1" />

              {/* High-intensity Cyan LED Headlight */}
              <rect x="568" y="163" width="7" height="4" fill="#38bdf8" rx="1" filter="url(#glow-cyan)" />
              {/* Roof marker clearance lights */}
              <circle cx="490" cy="114" r="1.5" fill="#f59e0b" />
              <circle cx="510" cy="114" r="1.5" fill="#f59e0b" />
              <circle cx="530" cy="114" r="1.5" fill="#f59e0b" />

              {/* Under-chassis: Air tanks, fuel tank, and battery box */}
              <rect x="250" y="174" width="315" height="10" fill="url(#chassis-grad)" rx="1.5" />
              {/* Cylindrical Aluminum Fuel Tank */}
              <rect x="365" y="177" width="52" height="12" fill="#64748b" rx="4" stroke="#475569" strokeWidth="0.5" />
              <line x1="380" y1="177" x2="380" y2="189" stroke="#334155" strokeWidth="1.5" />
              <line x1="402" y1="177" x2="402" y2="189" stroke="#334155" strokeWidth="1.5" />
              {/* Air brake tanks */}
              <rect x="330" y="178" width="28" height="9" fill="#334155" rx="3" />

              {/* Mudguards */}
              <path d="M260,188 Q280,172 300,188" stroke="#334155" strokeWidth="3" fill="none" />
              <path d="M420,188 Q440,172 460,188" stroke="#334155" strokeWidth="3" fill="none" />
              <path d="M510,188 Q530,172 550,188" stroke="#334155" strokeWidth="3" fill="none" />

              {/* WHEELS & ROTATING RIMS */}
              {/* Rear Dual Wheels (Axle 1 & 2) */}
              <g id="wheel-rear-1" transform="translate(280, 192)">
                <circle cx="0" cy="0" r="14" fill="#0f172a" stroke="#334155" strokeWidth="2.5" />
                <circle cx="0" cy="0" r="9" fill="#1e293b" stroke="#64748b" strokeWidth="1.5" />
                <circle cx="0" cy="0" r="4" fill="#475569" />
                {/* Spoke bolt indicators */}
                <circle cx="0" cy="-6" r="1" fill="#94a3b8" />
                <circle cx="6" cy="0" r="1" fill="#94a3b8" />
                <circle cx="0" cy="6" r="1" fill="#94a3b8" />
                <circle cx="-6" cy="0" r="1" fill="#94a3b8" />
              </g>

              <g id="wheel-rear-2" transform="translate(315, 192)">
                <circle cx="0" cy="0" r="14" fill="#0f172a" stroke="#334155" strokeWidth="2.5" />
                <circle cx="0" cy="0" r="9" fill="#1e293b" stroke="#64748b" strokeWidth="1.5" />
                <circle cx="0" cy="0" r="4" fill="#475569" />
                <circle cx="0" cy="-6" r="1" fill="#94a3b8" />
                <circle cx="6" cy="0" r="1" fill="#94a3b8" />
                <circle cx="0" cy="6" r="1" fill="#94a3b8" />
                <circle cx="-6" cy="0" r="1" fill="#94a3b8" />
              </g>

              {/* Center Axle Wheel */}
              <g id="wheel-mid" transform="translate(440, 192)">
                <circle cx="0" cy="0" r="14" fill="#0f172a" stroke="#334155" strokeWidth="2.5" />
                <circle cx="0" cy="0" r="9" fill="#1e293b" stroke="#64748b" strokeWidth="1.5" />
                <circle cx="0" cy="0" r="4" fill="#475569" />
                <circle cx="0" cy="-6" r="1" fill="#94a3b8" />
                <circle cx="6" cy="0" r="1" fill="#94a3b8" />
                <circle cx="0" cy="6" r="1" fill="#94a3b8" />
                <circle cx="-6" cy="0" r="1" fill="#94a3b8" />
              </g>

              {/* Front Steer Wheel */}
              <g id="wheel-front" transform="translate(530, 192)">
                <circle cx="0" cy="0" r="14" fill="#0f172a" stroke="#334155" strokeWidth="2.5" />
                <circle cx="0" cy="0" r="9" fill="#1e293b" stroke="#64748b" strokeWidth="1.5" />
                <circle cx="0" cy="0" r="4" fill="#475569" />
                <circle cx="0" cy="-6" r="1" fill="#94a3b8" />
                <circle cx="6" cy="0" r="1" fill="#94a3b8" />
                <circle cx="0" cy="6" r="1" fill="#94a3b8" />
                <circle cx="-6" cy="0" r="1" fill="#94a3b8" />
              </g>

              {/* Ground Shadow underneath truck */}
              <ellipse cx="400" cy="207" rx="160" ry="5" fill="#000000" opacity="0.65" />
            </motion.g>

            {/* Warehouse Tarmac Road Line */}
            <line x1="10" y1="208" x2="670" y2="208" stroke="#334155" strokeWidth="2" />
            <line x1="240" y1="208" x2="580" y2="208" stroke="#38bdf8" strokeWidth="2" strokeDasharray="8 6" opacity="0.4" />
          </svg>
        </div>

        {/* Live Loading Telemetry Bar */}
        <div className="relative z-20 mt-2 flex flex-wrap items-center justify-between gap-2 max-w-[560px] px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 backdrop-blur-md text-[11px]">
          <div className="flex items-center gap-2">
            <Truck size={14} className="text-cyan-400" />
            <span className="text-white/60">Armada:</span>
            <span className="font-mono font-bold text-white">Truk Tronton (B 9842 SMJ)</span>
          </div>

          <div className="flex items-center gap-3 font-mono">
            <div>
              <span className="text-white/45">Timbangan: </span>
              <span className="font-bold text-emerald-400">14.850 kg</span>
            </div>
            <div className="text-white/30">•</div>
            <div>
              <span className="text-white/45">Toleransi: </span>
              <span className="text-cyan-300">SNI ±3.5%</span>
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
