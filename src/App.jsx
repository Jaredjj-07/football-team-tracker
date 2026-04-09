import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "./supabaseClient";

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function formatType(type) {
  if (type === "workout") return "Workout";
  if (type === "event") return "Summer Event";
  if (type === "practice") return "Practice Quality";
  return type;
}

function pointsForLog(log) {
  if (log.type === "workout") return 5;
  if (log.type === "event") return 3;
  if (log.type === "practice") return Number(log.quality || 0);
  return 0;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState("");
  const [userProfile, setUserProfile] = useState(null);

  const [groups, setGroups] = useState([]);
  const [players, setPlayers] = useState([]);
  const [logs, setLogs] = useState([]);

  const [groupName, setGroupName] = useState("");
  const [playerForm, setPlayerForm] = useState({
    name: "",
    grade: "",
    group_id: ""
  });
  const [logForm, setLogForm] = useState({
    player_id: "",
    type: "workout",
    date: todayISO(),
    quality: 3,
    notes: ""
  });
  const [filters, setFilters] = useState({ group: "All", search: "" });

  useEffect(() => {
    const getSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session || null);
      setLoading(false);
    };
    getSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session || null);
    });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (session?.user) {
      loadProfile();
      loadAllData();
    } else {
      setUserProfile(null);
      setGroups([]);
      setPlayers([]);
      setLogs([]);
    }
  }, [session]);

  async function signIn() {
    const redirectTo = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectTo }
    });
    if (error) {
      alert(error.message);
      return;
    }
    alert("Check your email for the sign-in link.");
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  async function loadProfile() {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle();

    if (error) {
      console.error(error);
      return;
    }

    setUserProfile(data || null);
  }

  async function loadAllData() {
    await Promise.all([loadGroups(), loadPlayers(), loadLogs()]);
  }

  async function loadGroups() {
    const { data, error } = await supabase
      .from("groups")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setGroups(data || []);
    setPlayerForm((prev) => ({
      ...prev,
      group_id: prev.group_id || data?.[0]?.id || ""
    }));
  }

  async function loadPlayers() {
    const { data, error } = await supabase
      .from("players")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      console.error(error);
      return;
    }

    setPlayers(data || []);
  }

  async function loadLogs() {
    const { data, error } = await supabase
      .from("logs")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      return;
    }

    setLogs(data || []);
  }

  async function addGroup(e) {
    e.preventDefault();
    if (!groupName.trim()) return;

    const { error } = await supabase.from("groups").insert({
      name: groupName.trim(),
      owner_id: session.user.id
    });

    if (error) {
      alert(error.message);
      return;
    }

    setGroupName("");
    await loadGroups();
  }

  async function addPlayer(e) {
    e.preventDefault();
    if (!playerForm.name.trim() || !playerForm.group_id) return;

    const { error } = await supabase.from("players").insert({
      name: playerForm.name.trim(),
      grade: playerForm.grade.trim(),
      group_id: playerForm.group_id,
      owner_id: session.user.id
    });

    if (error) {
      alert(error.message);
      return;
    }

    setPlayerForm({ name: "", grade: "", group_id: groups[0]?.id || "" });
    await loadPlayers();
  }

  async function addLog(e) {
    e.preventDefault();
    if (!logForm.player_id) return;

    const payload = {
      player_id: logForm.player_id,
      type: logForm.type,
      date: logForm.date,
      quality: logForm.type === "practice" ? Number(logForm.quality) : null,
      notes: logForm.notes.trim(),
      owner_id: session.user.id
    };

    const { error } = await supabase.from("logs").insert(payload);

    if (error) {
      alert(error.message);
      return;
    }

    setLogForm({
      player_id: "",
      type: "workout",
      date: todayISO(),
      quality: 3,
      notes: ""
    });
    await loadLogs();
  }

  async function deletePlayer(id) {
    const ok = window.confirm("Delete this player and related logs?");
    if (!ok) return;

    const { error } = await supabase.from("players").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }

    await loadAllData();
  }

  async function deleteLog(id) {
    const { error } = await supabase.from("logs").delete().eq("id", id);
    if (error) {
      alert(error.message);
      return;
    }

    await loadLogs();
  }

  const groupMap = useMemo(() => {
    const map = {};
    groups.forEach((g) => {
      map[g.id] = g;
    });
    return map;
  }, [groups]);

  const stats = useMemo(() => {
    return players
      .map((player) => {
        const playerLogs = logs.filter((log) => log.player_id === player.id);
        const workouts = playerLogs.filter((l) => l.type === "workout").length;
        const events = playerLogs.filter((l) => l.type === "event").length;
        const practiceLogs = playerLogs.filter((l) => l.type === "practice");
        const practiceAvg = practiceLogs.length
          ? (
              practiceLogs.reduce((sum, l) => sum + Number(l.quality || 0), 0) / practiceLogs.length
            ).toFixed(1)
          : "0.0";
        const points = playerLogs.reduce((sum, log) => sum + pointsForLog(log), 0);

        return {
          ...player,
          groupName: groupMap[player.group_id]?.name || "Unknown",
          workouts,
          events,
          practiceAvg,
          points
        };
      })
      .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));
  }, [players, logs, groupMap]);

  const filteredStats = useMemo(() => {
    return stats.filter((player) => {
      const matchesGroup = filters.group === "All" || player.groupName === filters.group;
      const matchesSearch = player.name.toLowerCase().includes(filters.search.toLowerCase());
      return matchesGroup && matchesSearch;
    });
  }, [stats, filters]);

  const maxPoints = Math.max(...filteredStats.map((p) => p.points), 1);

  if (loading) {
    return <div className="page"><div className="card">Loading...</div></div>;
  }

  if (!session) {
    return (
      <div className="page auth-page">
        <div className="card auth-card">
          <h1>Football Team Tracker</h1>
          <p>Coach sign-in with a magic link. Because passwords are apparently too fun to forget.</p>
          <input
            type="email"
            placeholder="Coach email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button onClick={signIn}>Email me a sign-in link</button>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>Football Team Tracker</h1>
          <p>
            Signed in as <strong>{session.user.email}</strong>
            {userProfile?.role ? ` • ${userProfile.role}` : ""}
          </p>
        </div>
        <button className="secondary" onClick={signOut}>Sign out</button>
      </header>

      <section className="grid two">
        <div className="card">
          <h2>Add group</h2>
          <form className="form-grid" onSubmit={addGroup}>
            <input
              type="text"
              placeholder="Group name"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
            />
            <button type="submit">Add group</button>
          </form>
        </div>

        <div className="card">
          <h2>Filters</h2>
          <div className="form-grid">
            <select
              value={filters.group}
              onChange={(e) => setFilters((prev) => ({ ...prev, group: e.target.value }))}
            >
              <option value="All">All groups</option>
              {groups.map((group) => (
                <option key={group.id} value={group.name}>{group.name}</option>
              ))}
            </select>
            <input
              type="text"
              placeholder="Search player"
              value={filters.search}
              onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
            />
          </div>
        </div>
      </section>

      <section className="grid two">
        <div className="card">
          <h2>Add player</h2>
          <form className="form-grid" onSubmit={addPlayer}>
            <input
              type="text"
              placeholder="Player name"
              value={playerForm.name}
              onChange={(e) => setPlayerForm((prev) => ({ ...prev, name: e.target.value }))}
            />
            <input
              type="text"
              placeholder="Grade"
              value={playerForm.grade}
              onChange={(e) => setPlayerForm((prev) => ({ ...prev, grade: e.target.value }))}
            />
            <select
              value={playerForm.group_id}
              onChange={(e) => setPlayerForm((prev) => ({ ...prev, group_id: e.target.value }))}
            >
              <option value="">Select group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>{group.name}</option>
              ))}
            </select>
            <button type="submit">Add player</button>
          </form>
        </div>

        <div className="card">
          <h2>Check-in / log activity</h2>
          <form className="form-grid" onSubmit={addLog}>
            <select
              value={logForm.player_id}
              onChange={(e) => setLogForm((prev) => ({ ...prev, player_id: e.target.value }))}
            >
              <option value="">Select player</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>{player.name}</option>
              ))}
            </select>

            <select
              value={logForm.type}
              onChange={(e) => setLogForm((prev) => ({ ...prev, type: e.target.value }))}
            >
              <option value="workout">Workout</option>
              <option value="event">Summer Event</option>
              <option value="practice">Practice Quality</option>
            </select>

            <input
              type="date"
              value={logForm.date}
              onChange={(e) => setLogForm((prev) => ({ ...prev, date: e.target.value }))}
            />

            {logForm.type === "practice" && (
              <select
                value={logForm.quality}
                onChange={(e) => setLogForm((prev) => ({ ...prev, quality: e.target.value }))}
              >
                <option value="1">1 - Poor</option>
                <option value="2">2 - Below Average</option>
                <option value="3">3 - Average</option>
                <option value="4">4 - Good</option>
                <option value="5">5 - Great</option>
              </select>
            )}

            <input
              type="text"
              placeholder="Notes"
              value={logForm.notes}
              onChange={(e) => setLogForm((prev) => ({ ...prev, notes: e.target.value }))}
            />
            <button type="submit">Save log</button>
          </form>
        </div>
      </section>

      <section className="card">
        <h2>Leaderboard</h2>
        <div className="leaderboard-list">
          {filteredStats.map((player, idx) => (
            <div key={player.id} className="leaderboard-row">
              <div className="leaderboard-header">
                <div>
                  <strong>#{idx + 1} {player.name}</strong>
                  <div className="muted">Grade {player.grade || "-"} • {player.groupName}</div>
                </div>
                <div><strong>{player.points} pts</strong></div>
              </div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${(player.points / maxPoints) * 100}%` }} />
              </div>
              <div className="muted small-row">
                Workouts: {player.workouts} • Events: {player.events} • Practice Avg: {player.practiceAvg}
              </div>
            </div>
          ))}
          {!filteredStats.length && <p className="muted">No players found.</p>}
        </div>
      </section>

      <section className="card">
        <h2>Players</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Grade</th>
                <th>Group</th>
                <th>Workouts</th>
                <th>Events</th>
                <th>Practice Avg</th>
                <th>Points</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filteredStats.map((player) => (
                <tr key={player.id}>
                  <td>{player.name}</td>
                  <td>{player.grade || "-"}</td>
                  <td>{player.groupName}</td>
                  <td>{player.workouts}</td>
                  <td>{player.events}</td>
                  <td>{player.practiceAvg}</td>
                  <td>{player.points}</td>
                  <td>
                    <button className="danger small" onClick={() => deletePlayer(player.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <h2>Recent logs</h2>
        <div className="log-list">
          {logs.map((log) => {
            const player = players.find((p) => p.id === log.player_id);
            return (
              <div key={log.id} className="log-row">
                <div>
                  <strong>{player?.name || "Unknown"}</strong> - {formatType(log.type)}
                  {log.type === "practice" ? ` (${log.quality}/5)` : ""}
                  <div className="muted">{log.date}{log.notes ? ` • ${log.notes}` : ""}</div>
                </div>
                <button className="danger small" onClick={() => deleteLog(log.id)}>Remove</button>
              </div>
            );
          })}
          {!logs.length && <p className="muted">No logs yet.</p>}
        </div>
      </section>
    </div>
  );
}
