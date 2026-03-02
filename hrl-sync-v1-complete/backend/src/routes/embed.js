const express = require("express");
const router = express.Router();
const { queryOne, queryAll, query } = require("../db/pool");

// ── GET /api/embed/:token - JSON data ─────────────────────────────────────────
router.get("/:token", async (req, res) => {
  const link = await queryOne(
    `SELECT sl.*, p.id AS playlist_id, p.name, p.description, p.user_id
     FROM shareable_links sl JOIN playlists p ON p.id = sl.playlist_id
     WHERE sl.link_token = $1 AND sl.is_active = true`,
    [req.params.token]
  );
  if (!link) return res.status(404).json({ error: "Not found" });
  if (link.expires_at && new Date(link.expires_at) < new Date()) return res.status(410).json({ error: "Expired" });

  const tracks = await queryAll(
    `SELECT t.id,t.title,t.artist,t.duration,t.bpm,t.key,t.file_name,t.google_drive_file_id,
       pt.position,pt.track_comment
     FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id
     WHERE pt.playlist_id = $1 ORDER BY pt.position`,
    [link.playlist_id]
  );

  const brand = await queryOne("SELECT * FROM embed_settings WHERE user_id = $1", [link.user_id])
    ?? { primary_color: "#FF3C50", company_name: "HRL Sync", show_branding: true };

  await query(
    "INSERT INTO tracking_events (shareable_link_id,event_type,ip_address,user_agent) VALUES ($1,'playlist_opened',$2,$3)",
    [link.id, req.ip, req.headers["user-agent"]]
  ).catch(() => { });

  res.json({
    playlist: { id: link.playlist_id, name: link.name, description: link.description, tracks },
    link: { token: req.params.token, allow_downloads: link.allow_downloads, expires_at: link.expires_at },
    brand,
  });
});

// ── POST /api/embed/:token/event ──────────────────────────────────────────────
router.post("/:token/event", async (req, res) => {
  const { event_type, track_id } = req.body;
  const link = await queryOne("SELECT id FROM shareable_links WHERE link_token = $1", [req.params.token]);
  if (!link) return res.status(404).json({ error: "Not found" });
  await query(
    "INSERT INTO tracking_events (shareable_link_id,event_type,track_id,ip_address,user_agent) VALUES ($1,$2,$3,$4,$5)",
    [link.id, event_type, track_id ?? null, req.ip, req.headers["user-agent"]]
  ).catch(() => { });
  res.json({ success: true });
});

// ── GET /api/embed-player?token=... - Full HTML player ────────────────────────
router.get("-player", (req, res) => {
  const { token, theme = "dark" } = req.query;
  if (!token) return res.status(400).send("<p>Missing token</p>");
  const API = process.env.API_URL || `https://${req.hostname}`;

  res.setHeader("Content-Type", "text/html");
  res.setHeader("X-Frame-Options", "ALLOWALL");
  res.send(buildPlayerHTML(token, theme, API));
});

function buildPlayerHTML(token, theme, apiUrl) {
  const isDark = theme !== "light";
  const bg = isDark ? "#0A080E" : "#ffffff";
  const fg = isDark ? "#E6E1FF" : "#1a1a2e";
  const cardBg = isDark ? "#100D16" : "#f7f7f7";
  const border = isDark ? "#26203400" : "#e5e5e5";
  const muted = isDark ? "#6E648C" : "#888";
  const accent = "#FF3C50";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>HRL Sync Player</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Space+Mono:wght@400;700&family=DM+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'DM Sans',sans-serif;background:${bg};color:${fg};font-size:14px}
.wrap{padding:16px;max-width:720px;margin:0 auto}
.header{margin-bottom:16px}
.title{font-family:'Bebas Neue',sans-serif;font-size:1.8rem;letter-spacing:.06em;line-height:1}
.desc{font-family:'Space Mono',monospace;font-size:.65rem;letter-spacing:.1em;text-transform:uppercase;color:${muted};margin-top:4px}
.tracks{display:flex;flex-direction:column;gap:2px}
.track{display:grid;grid-template-columns:28px 1fr auto;align-items:center;gap:10px;padding:10px 12px;border-radius:6px;cursor:pointer;transition:background .15s}
.track:hover,.track.active{background:rgba(255,60,80,.1)}
.t-num{font-family:'Space Mono',monospace;font-size:.65rem;color:${muted};text-align:center}
.t-info .t-name{font-weight:500;font-size:.875rem;line-height:1.3}
.t-info .t-artist{font-family:'Space Mono',monospace;font-size:.6rem;letter-spacing:.08em;text-transform:uppercase;color:${muted}}
.t-meta{display:flex;gap:6px;align-items:center}
.badge{font-family:'Space Mono',monospace;font-size:.55rem;letter-spacing:.08em;text-transform:uppercase;padding:2px 6px;border-radius:2px;background:rgba(255,60,80,.12);color:${accent}}
.t-dur{font-family:'Space Mono',monospace;font-size:.65rem;color:${muted}}
.now-playing{margin-top:14px;background:${cardBg};border-radius:8px;padding:14px;border:1px solid rgba(255,60,80,.15)}
.np-track{margin-bottom:10px}
.np-title{font-weight:600;font-size:.9375rem}
.np-artist{font-family:'Space Mono',monospace;font-size:.65rem;letter-spacing:.08em;text-transform:uppercase;color:${muted};margin-top:2px}
.progress{width:100%;height:3px;background:rgba(255,255,255,.08);border-radius:2px;cursor:pointer;margin:10px 0}
.progress-fill{height:100%;background:${accent};border-radius:2px;transition:width .1s}
.controls{display:flex;gap:8px;align-items:center}
.btn{padding:7px 14px;border-radius:4px;border:none;cursor:pointer;font-family:'Space Mono',monospace;font-size:.65rem;letter-spacing:.08em;text-transform:uppercase;transition:all .15s}
.btn-play{background:${accent};color:#fff}
.btn-play:hover{background:#ff5566}
.btn-nav{background:rgba(255,255,255,.06);color:${fg}}
.btn-nav:hover{background:rgba(255,255,255,.12)}
.branding{text-align:center;margin-top:14px;font-family:'Space Mono',monospace;font-size:.6rem;letter-spacing:.1em;text-transform:uppercase;color:${muted}}
.branding a{color:inherit;text-decoration:none}
.branding a:hover{color:${accent}}
audio{display:none}
.eq{display:flex;align-items:flex-end;gap:1px;height:12px}
.eq span{width:2px;background:${accent};border-radius:1px;animation:eq .8s infinite}
.eq span:nth-child(2){animation-delay:.2s}
.eq span:nth-child(3){animation-delay:.4s}
@keyframes eq{0%,100%{height:3px}50%{height:10px}}
.loading{text-align:center;padding:32px;color:${muted};font-family:'Space Mono',monospace;font-size:.7rem;letter-spacing:.1em}
</style>
</head>
<body>
<div class="wrap">
<div id="app"><div class="loading">LOADING…</div></div>
</div>
<audio id="player"></audio>
<script>
const API='${apiUrl}',TOKEN='${token}';
let playlist=null,brand={},curIdx=0,audio=document.getElementById('player');

async function load(){
  const r=await fetch(API+'/api/embed/'+TOKEN);
  if(!r.ok){document.getElementById('app').innerHTML='<div class="loading">PLAYLIST NOT FOUND</div>';return;}
  const d=await r.json();playlist=d.playlist;brand=d.brand||{};
  render(d);
}

function fmt(s){if(!s||isNaN(s))return'—';const m=Math.floor(s/60),sec=Math.floor(s%60);return m+':'+String(sec).padStart(2,'0')}

function render(d){
  const tks=d.playlist.tracks||[];
  document.getElementById('app').innerHTML=\`
    <div class="header">
      \${brand.logo_url?'<img src="'+brand.logo_url+'" style="height:28px;margin-bottom:8px">':''}
      <div class="title">\${d.playlist.name}</div>
      \${d.playlist.description?'<div class="desc">'+d.playlist.description+'</div>':''}
    </div>
    <div class="tracks">
      \${tks.map((t,i)=>\`<div class="track" id="tr-\${i}" onclick="play(\${i})">
        <div class="t-num" id="trn-\${i}">\${String(i+1).padStart(2,'0')}</div>
        <div class="t-info">
          <div class="t-name">\${t.title}</div>
          <div class="t-artist">\${t.artist}</div>
        </div>
        <div class="t-meta">
          \${t.bpm?'<span class="badge">'+t.bpm+' BPM</span>':''}
          \${t.key?'<span class="badge">'+t.key+'</span>':''}
          <span class="t-dur">\${fmt(t.duration)}</span>
        </div>
      </div>\`).join('')}
    </div>
    <div class="now-playing" id="np" style="display:none">
      <div class="np-track"><div class="np-title" id="np-title">—</div><div class="np-artist" id="np-artist">—</div></div>
      <div class="progress" onclick="seek(event)"><div class="progress-fill" id="prog" style="width:0"></div></div>
      <div class="controls">
        <button class="btn btn-nav" onclick="prev()">⏮</button>
        <button class="btn btn-play" id="btn-play" onclick="toggle()">▶ PLAY</button>
        <button class="btn btn-nav" onclick="next()">⏭</button>
        \${d.link.allow_downloads?'<button class="btn btn-nav" onclick="dl()">↓ DOWNLOAD</button>':''}
        <span class="t-dur" id="time" style="margin-left:auto">0:00</span>
      </div>
    </div>
    \${brand.show_branding!==false?'<div class="branding">Powered by <a href="https://hrlsync.com" target="_blank">HRL SYNC</a></div>':''}
  \`;
}

function play(i){
  curIdx=i;const t=playlist.tracks[i];
  document.querySelectorAll('.track').forEach((el,j)=>{el.classList.toggle('active',j===i);document.getElementById('trn-'+j).innerHTML=j===i?'<div class="eq"><span></span><span></span><span></span></div>':String(j+1).padStart(2,'0');});
  document.getElementById('np').style.display='block';
  document.getElementById('np-title').textContent=t.title;
  document.getElementById('np-artist').textContent=t.artist;
  const src=API+'/api/tracks/stream/'+t.id+'?shareToken='+TOKEN;
  audio.src=src;audio.play();
  document.getElementById('btn-play').textContent='⏸ PAUSE';
  fetch(API+'/api/embed/'+TOKEN+'/event',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({event_type:'track_played',track_id:t.id})}).catch(()=>{});
  window.parent.postMessage({type:'syncflow-resize',height:document.body.scrollHeight+20},'*');
}

audio.addEventListener('timeupdate',()=>{
  if(audio.duration){document.getElementById('prog').style.width=(audio.currentTime/audio.duration*100)+'%';document.getElementById('time').textContent=fmt(audio.currentTime)+' / '+fmt(audio.duration);}
});
audio.addEventListener('ended',()=>{ if(curIdx+1<(playlist?.tracks?.length||0))play(curIdx+1); });

function toggle(){if(audio.paused){audio.play();document.getElementById('btn-play').textContent='⏸ PAUSE';}else{audio.pause();document.getElementById('btn-play').textContent='▶ PLAY';}}
function prev(){if(curIdx>0)play(curIdx-1);}
function next(){if(curIdx+1<(playlist?.tracks?.length||0))play(curIdx+1);}
function seek(e){const b=e.currentTarget;audio.currentTime=(e.offsetX/b.offsetWidth)*audio.duration;}
function dl(){const t=playlist.tracks[curIdx];if(!t)return;const a=document.createElement('a');a.href=API+'/api/drive/stream/'+t.google_drive_file_id;a.download=t.file_name||t.title+'.mp3';a.target='_blank';document.body.appendChild(a);a.click();document.body.removeChild(a);}

load();
</script>
</body>
</html>`;
}

module.exports = router;
