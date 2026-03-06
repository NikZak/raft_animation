import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const STATES = {
  FOLLOWER: "Follower",
  CANDIDATE: "Candidate",
  LEADER: "Leader",
  DOWN: "Down",
};
const STATE_COLORS = {
  [STATES.FOLLOWER]: { bg: "bg-sky-600", ring: "ring-sky-400" },
  [STATES.CANDIDATE]: { bg: "bg-amber-500", ring: "ring-amber-300" },
  [STATES.LEADER]: { bg: "bg-emerald-500", ring: "ring-emerald-300" },
  [STATES.DOWN]: { bg: "bg-gray-700", ring: "ring-gray-600" },
};
const STATE_EMOJI = {
  [STATES.FOLLOWER]: "👤",
  [STATES.CANDIDATE]: "🗳️",
  [STATES.LEADER]: "👑",
  [STATES.DOWN]: "💀",
};

const UNCOMMITTED_STYLES = [
  "bg-purple-900 border-purple-500 text-purple-200",
  "bg-blue-900 border-blue-500 text-blue-200",
  "bg-pink-900 border-pink-500 text-pink-200",
  "bg-amber-900 border-amber-500 text-amber-200",
  "bg-cyan-900 border-cyan-500 text-cyan-200",
];

let msgUID = 0;
let logUID = 0;

const calcCommitIndex = (log) => {
  let ci = 0;
  for (const e of log) {
    if (e.committed) ci++;
    else break;
  }
  return ci;
};

const initNodes = () => [
  {
    id: 0,
    name: "S1",
    state: STATES.FOLLOWER,
    term: 0,
    votedFor: null,
    log: [],
    commitIndex: 0,
    votes: 0,
  },
  {
    id: 1,
    name: "S2",
    state: STATES.FOLLOWER,
    term: 0,
    votedFor: null,
    log: [],
    commitIndex: 0,
    votes: 0,
  },
  {
    id: 2,
    name: "S3",
    state: STATES.FOLLOWER,
    term: 0,
    votedFor: null,
    log: [],
    commitIndex: 0,
    votes: 0,
  },
  {
    id: 3,
    name: "S4",
    state: STATES.FOLLOWER,
    term: 0,
    votedFor: null,
    log: [],
    commitIndex: 0,
    votes: 0,
  },
  {
    id: 4,
    name: "S5",
    state: STATES.FOLLOWER,
    term: 0,
    votedFor: null,
    log: [],
    commitIndex: 0,
    votes: 0,
  },
];

function getPositions(count, w, h) {
  const cx = w / 2,
    cy = h / 2;
  const rx = Math.min(cx, cy) * 0.5;
  return Array.from({ length: count }, (_, i) => {
    const a = (2 * Math.PI * i) / count - Math.PI / 2;
    return { x: cx + rx * Math.cos(a), y: cy + rx * Math.sin(a) };
  });
}

export default function RaftViz() {
  const [nodes, setNodes] = useState(initNodes);
  const [flying, setFlying] = useState([]);
  const [events, setEvents] = useState([]);
  const [dims, setDims] = useState({ w: 620, h: 400 });
  const [electing, setElecting] = useState(false);
  const [inflight, setInflight] = useState(0);

  const containerRef = useRef(null);
  const nodesRef = useRef(nodes);
  const electingRef = useRef(false);
  const genRef = useRef(0);
  nodesRef.current = nodes;

  useEffect(() => {
    electingRef.current = electing;
  }, [electing]);

  useEffect(() => {
    const measure = () => {
      if (containerRef.current) {
        const r = containerRef.current.getBoundingClientRect();
        setDims({ w: r.width, h: r.height });
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  const pos = getPositions(5, dims.w, dims.h);

  const addEvent = useCallback((msg) => {
    setEvents((p) => [msg, ...p].slice(0, 100));
  }, []);

  const sendMsg = useCallback((from, to, type, color, dur = 500) => {
    const id = ++msgUID;
    const oy = (Math.random() - 0.5) * 20;
    const ox = (Math.random() - 0.5) * 10;
    setFlying((p) => [...p, { id, from, to, type, color, oy, ox }]);
    return new Promise((resolve) => {
      setTimeout(() => {
        setFlying((p) => p.filter((x) => x.id !== id));
        resolve();
      }, dur);
    });
  }, []);

  const delay = (ms) => new Promise((r) => setTimeout(r, ms));

  // ========== LEADER ELECTION (blocking) ==========
  const runElection = useCallback(
    async (candidateId) => {
      if (electingRef.current) return;
      const gen = genRef.current;
      setElecting(true);
      electingRef.current = true;

      const ns = nodesRef.current;
      if (ns[candidateId].state === STATES.DOWN) {
        setElecting(false);
        electingRef.current = false;
        return;
      }

      const newTerm = Math.max(...ns.map((n) => n.term)) + 1;
      const cName = ns[candidateId].name;

      setNodes((prev) => {
        const u = [...prev];
        u[candidateId] = {
          ...u[candidateId],
          term: newTerm,
          state: STATES.CANDIDATE,
          votedFor: candidateId,
          votes: 1,
        };
        return u;
      });
      addEvent(`📢 ${cName} starts election — Term ${newTerm}`);
      await delay(300);
      if (gen !== genRef.current) return;

      let votesGot = 1;
      const voters = ns.filter(
        (n) => n.id !== candidateId && n.state !== STATES.DOWN,
      );

      for (const v of voters) {
        if (gen !== genRef.current) return;
        await sendMsg(candidateId, v.id, "ReqVote", "bg-amber-400", 400);
        if (gen !== genRef.current) return;
        if (nodesRef.current[v.id].state === STATES.DOWN) continue;

        const vn = nodesRef.current[v.id];
        const grant =
          vn.term <= newTerm &&
          (vn.votedFor === null || vn.votedFor === candidateId);

        if (grant) {
          votesGot++;
          setNodes((prev) => {
            const u = [...prev];
            u[v.id] = { ...u[v.id], term: newTerm, votedFor: candidateId };
            u[candidateId] = { ...u[candidateId], votes: votesGot };
            return u;
          });
          await sendMsg(v.id, candidateId, "✓Vote", "bg-green-400", 300);
          addEvent(`✅ ${v.name} votes for ${cName} (${votesGot}/5)`);
        } else {
          await sendMsg(v.id, candidateId, "✗Deny", "bg-red-400", 300);
          addEvent(`❌ ${v.name} denies ${cName}`);
        }
        if (votesGot >= 3) break;
      }

      if (gen !== genRef.current) return;

      if (votesGot >= 3) {
        setNodes((prev) =>
          prev.map((n) => ({
            ...n,
            state:
              n.id === candidateId
                ? STATES.LEADER
                : n.state === STATES.DOWN
                  ? STATES.DOWN
                  : STATES.FOLLOWER,
            term: newTerm,
            votedFor: null,
            votes: 0,
          })),
        );
        addEvent(`👑 ${cName} is LEADER for Term ${newTerm}`);
        await delay(300);
        if (gen !== genRef.current) return;
        const alive = nodesRef.current.filter(
          (n) => n.id !== candidateId && n.state !== STATES.DOWN,
        );
        await Promise.all(
          alive.map((f) =>
            sendMsg(candidateId, f.id, "♥HB", "bg-emerald-400", 400),
          ),
        );
      } else {
        setNodes((prev) => {
          const u = [...prev];
          u[candidateId] = {
            ...u[candidateId],
            state: STATES.FOLLOWER,
            votes: 0,
            votedFor: null,
          };
          return u;
        });
        addEvent(`⚠️ ${cName} election failed`);
      }
      setElecting(false);
      electingRef.current = false;
    },
    [addEvent, sendMsg],
  );

  // ========== LOG REPLICATION (NON-BLOCKING, CONCURRENT) ==========
  const replicateLog = useCallback(async () => {
    if (electingRef.current) return;
    const gen = genRef.current;

    const leader = nodesRef.current.find((n) => n.state === STATES.LEADER);
    if (!leader) {
      addEvent("⚠️ No leader — elect one first!");
      return;
    }

    setInflight((p) => p + 1);

    const entryId = ++logUID;
    const colorIdx = (entryId - 1) % UNCOMMITTED_STYLES.length;
    const entry = {
      id: entryId,
      term: leader.term,
      cmd: `set-${entryId}`,
      committed: false,
      colorIdx,
    };
    const leaderId = leader.id;
    const leaderName = leader.name;

    // Step 1: Leader appends (uncommitted)
    setNodes((prev) => {
      const u = [...prev];
      u[leaderId] = { ...u[leaderId], log: [...u[leaderId].log, { ...entry }] };
      return u;
    });
    addEvent(`📝 Client → ${leaderName}: "${entry.cmd}" (uncommitted)`);
    await delay(200);
    if (gen !== genRef.current) {
      setInflight((p) => Math.max(0, p - 1));
      return;
    }

    // Step 2: AppendEntries to ALL followers in PARALLEL
    const followerIds = nodesRef.current
      .filter((n) => n.id !== leaderId && n.state !== STATES.DOWN)
      .map((n) => n.id);

    let acks = 1;
    let hasCommitted = false;
    const ackedIds = [];

    addEvent(
      `📦 ${leaderName} → AppendEntries("${entry.cmd}") to ${followerIds.length} followers`,
    );

    await Promise.all(
      followerIds.map(async (fid) => {
        await delay(Math.random() * 120);
        if (gen !== genRef.current) return;
        if (nodesRef.current[fid].state === STATES.DOWN) return;

        await sendMsg(
          leaderId,
          fid,
          "AE",
          "bg-purple-400",
          300 + Math.random() * 200,
        );
        if (gen !== genRef.current) return;
        if (nodesRef.current[fid].state === STATES.DOWN) return;

        // Follower appends (uncommitted), sorted by ID for correctness
        setNodes((prev) => {
          const u = [...prev];
          if (!u[fid].log.find((e) => e.id === entryId)) {
            const newLog = [...u[fid].log, { ...entry, committed: false }];
            newLog.sort((a, b) => a.id - b.id);
            u[fid] = { ...u[fid], log: newLog };
          }
          return u;
        });

        acks++;
        ackedIds.push(fid);

        await sendMsg(
          fid,
          leaderId,
          "ACK",
          "bg-green-400",
          200 + Math.random() * 150,
        );
        if (gen !== genRef.current) return;

        const fName = nodesRef.current[fid]?.name || `S${fid + 1}`;
        addEvent(`✅ ${fName} ACKs "${entry.cmd}" (${acks}/5 replicas)`);

        // Leader commits locally when majority reached
        if (acks >= 3 && !hasCommitted) {
          hasCommitted = true;
          setNodes((prev) => {
            const u = [...prev];
            const newLog = u[leaderId].log.map((e) =>
              e.id === entryId ? { ...e, committed: true } : e,
            );
            u[leaderId] = {
              ...u[leaderId],
              log: newLog,
              commitIndex: calcCommitIndex(newLog),
            };
            return u;
          });
          addEvent(
            `🎉 Majority! ${leaderName} commits "${entry.cmd}" locally → client success ✓`,
          );
        }
      }),
    );

    if (gen !== genRef.current) {
      setInflight((p) => Math.max(0, p - 1));
      return;
    }

    if (!hasCommitted) {
      addEvent(`⚠️ No majority for "${entry.cmd}"`);
      setInflight((p) => Math.max(0, p - 1));
      return;
    }

    // Step 3: Leader still alive? Send commit notification via heartbeat
    await delay(400);
    if (gen !== genRef.current) {
      setInflight((p) => Math.max(0, p - 1));
      return;
    }

    if (nodesRef.current[leaderId].state !== STATES.LEADER) {
      addEvent(
        `⚠️ ${leaderName} no longer leader — followers won't learn about this commit yet`,
      );
      setInflight((p) => Math.max(0, p - 1));
      return;
    }

    const toNotify = ackedIds.filter(
      (fid) => nodesRef.current[fid].state !== STATES.DOWN,
    );
    if (toNotify.length > 0) {
      addEvent(
        `💓 ${leaderName} heartbeat with leaderCommit → "${entry.cmd}" committed`,
      );

      await Promise.all(
        toNotify.map(async (fid) => {
          await delay(Math.random() * 80);
          return sendMsg(
            leaderId,
            fid,
            "HB+ci",
            "bg-teal-400",
            300 + Math.random() * 150,
          );
        }),
      );

      if (gen !== genRef.current) {
        setInflight((p) => Math.max(0, p - 1));
        return;
      }

      setNodes((prev) => {
        const u = [...prev];
        for (const fid of toNotify) {
          const newLog = u[fid].log.map((e) =>
            e.id === entryId ? { ...e, committed: true } : e,
          );
          u[fid] = {
            ...u[fid],
            log: newLog,
            commitIndex: calcCommitIndex(newLog),
          };
        }
        return u;
      });
      addEvent(`✅ Followers apply "${entry.cmd}" to state machine`);
    }

    setInflight((p) => Math.max(0, p - 1));
  }, [addEvent, sendMsg]);

  // ========== CRASH / RECOVER ==========
  const crashNode = useCallback(
    (id) => {
      if (electingRef.current) return;
      const cur = nodesRef.current[id];
      if (cur.state === STATES.DOWN) {
        setNodes((prev) => {
          const u = [...prev];
          u[id] = {
            ...u[id],
            state: STATES.FOLLOWER,
            votedFor: null,
            votes: 0,
          };
          return u;
        });
        addEvent(`🔄 ${cur.name} recovers as Follower`);
      } else {
        const wasLeader = cur.state === STATES.LEADER;
        setNodes((prev) => {
          const u = [...prev];
          u[id] = { ...u[id], state: STATES.DOWN, votedFor: null, votes: 0 };
          return u;
        });
        addEvent(`💥 ${cur.name} CRASHES${wasLeader ? " (was Leader!)" : ""}`);
      }
    },
    [addEvent],
  );

  // ========== RESET ==========
  const reset = useCallback(() => {
    genRef.current++;
    logUID = 0;
    setNodes(initNodes());
    setFlying([]);
    setEvents([]);
    setElecting(false);
    electingRef.current = false;
    setInflight(0);
  }, []);

  // ========== FULL DEMO (shows pipelining) ==========
  const runFullDemo = useCallback(async () => {
    if (electingRef.current) return;
    reset();
    await delay(500);
    addEvent("🎬 ═══ Raft Demo — with pipelined requests ═══");

    await delay(400);
    await runElection(0);
    await delay(700);

    // Single request first
    addEvent("🎬 ── Single client request ──");
    await replicateLog();
    await delay(600);

    // Now fire TWO concurrent requests to show pipelining!
    addEvent("🎬 ── Two concurrent requests (pipelining!) ──");
    const p1 = replicateLog();
    await delay(300);
    const p2 = replicateLog();
    await Promise.all([p1, p2]);

    await delay(700);
    crashNode(0);
    await delay(800);
    await runElection(2);
    await delay(700);
    await replicateLog();

    addEvent("🎬 ═══ Demo Complete ═══");
  }, [reset, runElection, replicateLog, crashNode, addEvent]);

  const leader = nodes.find((n) => n.state === STATES.LEADER);
  const currentTerm = Math.max(...nodes.map((n) => n.term));

  return (
    <div className="min-h-screen bg-gray-950 text-white p-3 flex flex-col items-center">
      <h1 className="text-2xl font-bold mb-1">⛵ Raft Consensus</h1>
      <p className="text-gray-500 text-xs mb-2 text-center max-w-md">
        Non-blocking pipeline — send requests while others are still
        replicating!
      </p>

      {/* Status */}
      <div className="flex flex-wrap gap-2 mb-2 justify-center text-xs">
        <span className="bg-gray-800 px-3 py-1 rounded-full">
          Term <strong className="text-amber-400">{currentTerm}</strong>
        </span>
        <span className="bg-gray-800 px-3 py-1 rounded-full">
          Leader{" "}
          <strong className={leader ? "text-emerald-400" : "text-red-400"}>
            {leader ? leader.name : "None"}
          </strong>
        </span>
        {inflight > 0 && (
          <motion.span
            initial={{ scale: 0.7 }}
            animate={{ scale: 1 }}
            className="bg-purple-900 border border-purple-500 px-3 py-1 rounded-full text-purple-300 font-semibold"
          >
            ⚡ {inflight} in-flight
          </motion.span>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2 mb-3 justify-center">
        <button
          disabled={electing}
          onClick={runFullDemo}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 transition"
        >
          🎬 Full Demo
        </button>
        <button
          disabled={electing || inflight > 0}
          onClick={() => {
            const fols = nodes.filter((n) => n.state === STATES.FOLLOWER);
            if (fols.length)
              runElection(fols[Math.floor(Math.random() * fols.length)].id);
          }}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-amber-600 hover:bg-amber-700 disabled:opacity-40 transition"
        >
          🗳️ Election
        </button>
        <button
          disabled={electing || !leader}
          onClick={() => replicateLog()}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-purple-600 hover:bg-purple-700 disabled:opacity-40 transition relative"
        >
          📝 Client Request
          {inflight > 0 && (
            <span className="ml-1 bg-purple-400 text-purple-900 px-1.5 rounded-full text-xs font-bold">
              {inflight}
            </span>
          )}
        </button>
        <button
          onClick={reset}
          className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-gray-600 hover:bg-gray-700 transition"
        >
          🔄 Reset
        </button>
      </div>

      <div className="flex flex-col lg:flex-row gap-3 w-full max-w-5xl">
        {/* Left */}
        <div className="flex-1 min-w-0">
          {/* Cluster */}
          <div
            ref={containerRef}
            className="relative w-full h-96 bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden mb-3"
          >
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {pos.map((a, i) =>
                pos.map((b, j) =>
                  i < j ? (
                    <line
                      key={`${i}-${j}`}
                      x1={a.x}
                      y1={a.y}
                      x2={b.x}
                      y2={b.y}
                      stroke="#1e293b"
                      strokeWidth="1"
                      strokeDasharray="4 4"
                    />
                  ) : null,
                ),
              )}
            </svg>

            <AnimatePresence>
              {flying.map((m) => {
                const f = pos[m.from],
                  t = pos[m.to];
                if (!f || !t) return null;
                return (
                  <motion.div
                    key={m.id}
                    initial={{
                      x: f.x - 16 + (m.ox || 0),
                      y: f.y - 10 + (m.oy || 0),
                      scale: 0,
                      opacity: 0,
                    }}
                    animate={{
                      x: t.x - 16 + (m.ox || 0),
                      y: t.y - 10 + (m.oy || 0),
                      scale: 1,
                      opacity: 1,
                    }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={{ duration: 0.32, ease: "easeInOut" }}
                    className={`absolute ${m.color} text-gray-900 rounded-full px-1.5 py-0.5 text-xs font-bold shadow-lg z-10 whitespace-nowrap pointer-events-none`}
                  >
                    {m.type}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {nodes.map((n, i) => {
              const p = pos[i];
              if (!p) return null;
              const sc = STATE_COLORS[n.state];
              return (
                <motion.div
                  key={n.id}
                  className="absolute flex flex-col items-center"
                  style={{ left: p.x - 36, top: p.y - 40 }}
                  whileHover={{ scale: 1.08 }}
                >
                  <motion.div
                    onClick={() => crashNode(n.id)}
                    animate={
                      n.state === STATES.LEADER
                        ? {
                            boxShadow: [
                              "0 0 0px rgba(52,211,153,0.3)",
                              "0 0 16px rgba(52,211,153,0.6)",
                              "0 0 0px rgba(52,211,153,0.3)",
                            ],
                          }
                        : {}
                    }
                    transition={{ duration: 1.5, repeat: Infinity }}
                    className={`w-20 h-20 rounded-full ${sc.bg} ring-4 ${sc.ring} flex flex-col items-center justify-center cursor-pointer shadow-lg relative transition-colors duration-300`}
                  >
                    <span className="text-lg">{STATE_EMOJI[n.state]}</span>
                    <span className="text-xs font-bold">{n.name}</span>
                    <span className="text-xs opacity-80">{n.state}</span>
                    {n.votes > 0 && (
                      <motion.span
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-amber-400 text-gray-900 rounded-full text-xs font-bold flex items-center justify-center border-2 border-gray-900"
                      >
                        {n.votes}
                      </motion.span>
                    )}
                  </motion.div>
                  <span className="text-xs text-gray-500 mt-0.5">
                    T{n.term} CI:{n.commitIndex}
                  </span>
                </motion.div>
              );
            })}

            <div className="absolute bottom-2 left-2 flex gap-2 text-xs flex-wrap">
              {[
                STATES.LEADER,
                STATES.FOLLOWER,
                STATES.CANDIDATE,
                STATES.DOWN,
              ].map((s) => (
                <span key={s} className="flex items-center gap-1">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${STATE_COLORS[s].bg}`}
                  />
                  <span className="text-gray-500">{s}</span>
                </span>
              ))}
            </div>
            <div className="absolute bottom-2 right-2 text-xs text-gray-600">
              Click node to crash/recover
            </div>
          </div>

          {/* Logs */}
          <div className="mb-3">
            <div className="text-sm font-semibold mb-1 flex items-center gap-2">
              📋 Logs
              <span className="text-xs font-normal text-gray-500">
                (colored = uncommitted, green = committed)
              </span>
            </div>
            <div className="grid grid-cols-5 gap-1.5">
              {nodes.map((n) => (
                <div
                  key={n.id}
                  className={`bg-gray-900 border rounded-lg p-1.5 ${n.state === STATES.LEADER ? "border-emerald-700" : "border-gray-800"}`}
                >
                  <div className="text-xs font-bold flex items-center gap-1 mb-1">
                    <span
                      className={`w-2 h-2 rounded-full ${STATE_COLORS[n.state].bg}`}
                    />
                    {n.name}
                    {n.state === STATES.LEADER && (
                      <span className="text-emerald-400">★</span>
                    )}
                  </div>
                  <div className="flex flex-col gap-0.5 min-h-6">
                    {n.log.length === 0 ? (
                      <span className="text-gray-700 text-xs italic">
                        empty
                      </span>
                    ) : (
                      n.log.map((e, idx) => (
                        <motion.div
                          key={e.id}
                          initial={{ scale: 0, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          className={`text-xs px-1 py-0.5 rounded truncate border transition-all duration-500 ${
                            e.committed
                              ? "bg-emerald-800 border-emerald-500 text-emerald-200"
                              : UNCOMMITTED_STYLES[e.colorIdx || 0]
                          }`}
                          style={{
                            borderStyle: e.committed ? "solid" : "dashed",
                          }}
                        >
                          {idx + 1}:T{e.term} {e.committed ? "✓" : "○"}
                        </motion.div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Explanation */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 text-xs text-gray-400 space-y-1.5">
            <div className="text-sm font-semibold text-teal-400 mb-1">
              🔍 Commit Flow
            </div>
            <div className="flex gap-2 items-start">
              <span className="bg-purple-700 text-white px-1.5 rounded font-bold shrink-0">
                1
              </span>
              <span>
                Leader appends entry & sends{" "}
                <span className="text-purple-300">AppendEntries</span> to all
                followers <strong className="text-white">in parallel</strong>
              </span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="bg-green-700 text-white px-1.5 rounded font-bold shrink-0">
                2
              </span>
              <span>
                Followers append (
                <span className="text-amber-300">uncommitted</span>, dashed
                border) & ACK back
              </span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="bg-emerald-700 text-white px-1.5 rounded font-bold shrink-0">
                3
              </span>
              <span>
                Majority → leader commits{" "}
                <span className="text-emerald-300">only on itself</span> &
                responds to client
              </span>
            </div>
            <div className="flex gap-2 items-start">
              <span className="bg-teal-700 text-white px-1.5 rounded font-bold shrink-0">
                4
              </span>
              <span>
                Next heartbeat carries{" "}
                <code className="text-teal-300">leaderCommit</code> → followers
                learn & commit (turn green)
              </span>
            </div>
            <div className="pt-1.5 border-t border-gray-800 text-gray-500">
              💡 <strong className="text-gray-300">Try it:</strong> click
              "Client Request" multiple times quickly — they pipeline like in
              real Raft!
            </div>
          </div>
        </div>

        {/* Right: Event Log */}
        <div className="lg:w-80 w-full">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-2.5 lg:sticky lg:top-3">
            <div className="text-sm font-semibold mb-1.5 flex items-center justify-between">
              <span>📜 Event Log</span>
              {events.length > 0 && (
                <button
                  onClick={() => setEvents([])}
                  className="text-xs text-gray-600 hover:text-gray-400"
                >
                  clear
                </button>
              )}
            </div>
            <div className="h-96 overflow-y-auto space-y-0.5 text-xs font-mono">
              {events.length === 0 ? (
                <div className="text-gray-600 leading-relaxed p-1">
                  Press <strong className="text-indigo-400">"Full Demo"</strong>{" "}
                  for a guided tour with pipelined requests.
                  <br />
                  <br />
                  Or: elect a leader, then spam{" "}
                  <strong className="text-purple-400">
                    "Client Request"
                  </strong>{" "}
                  to see concurrent replication with messages flying
                  simultaneously!
                </div>
              ) : (
                events.map((e, i) => (
                  <motion.div
                    key={`${events.length - i}`}
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`leading-snug py-0.5 ${
                      i === 0
                        ? "text-white font-semibold"
                        : e.includes("═══")
                          ? "text-indigo-400 font-bold mt-1.5 border-t border-gray-800 pt-1"
                          : e.includes("──")
                            ? "text-teal-400 font-semibold mt-1"
                            : e.startsWith("🎉")
                              ? "text-emerald-300"
                              : "text-gray-400"
                    }`}
                  >
                    {e}
                  </motion.div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
