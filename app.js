const THEME_KEY = "bolaoCopaFirebase.theme";
const DEFAULT_MATCHES = [
  { teamA:"Brasil", teamB:"Argentina", flagA:"🇧🇷", flagB:"🇦🇷", kickoff:"2026-06-15T19:00", stage:"Fase de grupos", status:"live", minute:37, scoreA:1, scoreB:1, scorers:["Vini Jr.","Lautaro Martínez"], penalty:false, redCard:false, events:[{minute:12,text:"Gol do Brasil — Vini Jr."},{minute:31,text:"Gol da Argentina — Lautaro Martínez"}] },
  { teamA:"França", teamB:"Alemanha", flagA:"🇫🇷", flagB:"🇩🇪", kickoff:"2026-06-16T16:00", stage:"Fase de grupos", status:"upcoming", minute:0, scoreA:null, scoreB:null, scorers:[], penalty:false, redCard:false, events:[] },
  { teamA:"Espanha", teamB:"Portugal", flagA:"🇪🇸", flagB:"🇵🇹", kickoff:"2026-06-16T21:00", stage:"Fase de grupos", status:"upcoming", minute:0, scoreA:null, scoreB:null, scorers:[], penalty:false, redCard:false, events:[] },
  { teamA:"Inglaterra", teamB:"Itália", flagA:"🏴", flagB:"🇮🇹", kickoff:"2026-06-14T18:00", stage:"Fase de grupos", status:"finished", minute:90, scoreA:2, scoreB:0, scorers:["Bellingham","Kane"], penalty:true, redCard:false, events:[{minute:22,text:"Gol da Inglaterra — Bellingham"},{minute:69,text:"Pênalti convertido — Kane"},{minute:90,text:"Fim de jogo"}] }
];

let auth = null;
let db = null;
let fieldValue = null;
let currentView = "dashboard";
let liveMode = false;
let liveTimer = null;
let unsubscribers = [];
let state = { user:null, profile:null, users:[], matches:[], bets:[], loading:false, lastError:null };

const $ = (selector, root=document) => root.querySelector(selector);
const $$ = (selector, root=document) => Array.from(root.querySelectorAll(selector));
const uid = (prefix="id") => `${prefix}-${Math.random().toString(36).slice(2,10)}`;
function hasConfig() {
  const config = window.firebaseConfig;

  if (!config) return false;

  const requiredFields = [
    "apiKey",
    "authDomain",
    "projectId",
    "appId"
  ];

  return requiredFields.every((field) => {
    const value = config[field];

    return (
      value &&
      typeof value === "string" &&
      value.trim() !== "" &&
      !value.includes("COLE_AQUI")
    );
  });
}
const stamp = () => fieldValue.serverTimestamp();

function escapeHtml(value="") { return String(value).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#039;",'"':"&quot;"}[c])); }
function escapeAttr(value="") { return escapeHtml(value).replace(/`/g,"&#096;"); }
function normalize(value="") { return value.toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function formatDate(value) { const d = new Date(value); return Number.isNaN(d.getTime()) ? (value || "Sem data") : d.toLocaleString("pt-BR", {day:"2-digit", month:"2-digit", hour:"2-digit", minute:"2-digit"}); }
function outcome(a,b) { if (a === b) return "draw"; return a > b ? "A" : "B"; }
function statusLabel(s) { return {upcoming:"Aberto", live:"Ao vivo", finished:"Encerrado"}[s] || s; }
function statusClass(s) { return {upcoming:"open", live:"live", finished:"done"}[s] || "locked"; }
function boolOptions(value) { return `<option value="true" ${value===true?"selected":""}>Sim</option><option value="false" ${value===false?"selected":""}>Não</option>`; }
function isAdmin() { return state.profile && state.profile.role === "admin"; }
function getUser(id) { return state.users.find(u => u.id === id); }
function getMatch(id) { return state.matches.find(m => m.id === id); }
function getUserBet(uid, matchId) { return state.bets.find(b => b.userId === uid && b.matchId === matchId); }

function toast(message) { console.warn("Bolão:", message); const box = $("#toast"); if (!box) return; box.textContent = message; box.classList.add("show"); clearTimeout(box.timeout); box.timeout = setTimeout(() => box.classList.remove("show"), 3200); }
function errorMsg(error) {
  const code = error && error.code ? error.code : "";
  const message = error && error.message ? error.message : "";

  const map = {
    "auth/operation-not-allowed":
      "Login por Email/Senha não está ativado. Vá em Firebase > Authentication > Sign-in method > Email/Password e ative.",

    "auth/unauthorized-domain":
      "Domínio não autorizado. Vá em Firebase > Authentication > Settings > Authorized domains e adicione o domínio do GitHub Pages.",

    "auth/invalid-credential":
      "Email ou senha incorretos. Se a conta ainda não existe, use Cadastro primeiro.",

    "auth/user-not-found":
      "Conta não encontrada. Use Cadastro primeiro.",

    "auth/wrong-password":
      "Senha incorreta.",

    "auth/email-already-in-use":
      "Este email já está cadastrado. Use Login em vez de Cadastro.",

    "auth/weak-password":
      "Senha fraca. Use pelo menos 6 caracteres.",

    "auth/invalid-email":
      "Email inválido.",

    "auth/api-key-not-valid.-please-pass-a-valid-api-key.":
      "API key inválida. Confira o firebase-config.js.",

    "permission-denied":
      "Permissão negada. Publique o arquivo firestore.rules no Firestore e confira se sua conta é admin."
  };

  if (map[code]) return map[code];

  if (message.includes("auth/operation-not-allowed")) {
    return "Login por Email/Senha não está ativado no Firebase Authentication.";
  }

  if (message.includes("auth/unauthorized-domain")) {
    return "Domínio não autorizado no Firebase Authentication.";
  }

  if (message.includes("permission-denied")) {
    return "Permissão negada no Firestore. Confira as regras.";
  }

  return message || "Erro desconhecido no Firebase.";
}
function setLastError(error) { state.lastError = errorMsg(error); console.error(error); toast(state.lastError); renderCurrentView(); }
function renderErrorCard() { return state.lastError ? `<div class="card" style="margin-bottom:18px;border-color:rgba(255,92,124,.45)"><span class="badge" style="color:#ffb5c3;border-color:rgba(255,92,124,.35);background:rgba(255,92,124,.12)">Erro detectado</span><h3 style="margin-top:12px">Erro no Firebase/App</h3><p><strong>${escapeHtml(state.lastError)}</strong></p><p>Confira: firebase-config.js, Email/Password, Firestore Database, regras publicadas e domínio autorizado.</p></div>` : ""; }

function calculatePoints(bet, match) {
  let points = 0, exactScore = false, winnerHit = false, scorerHit = false;
  const breakdown = [];
  if (!match || match.status !== "finished") return { points:0, exactScore, winnerHit, scorerHit, breakdown:[{label:"Jogo ainda não encerrado", points:0}] };
  const actualA = Number(match.scoreA), actualB = Number(match.scoreB), predA = Number(bet.scoreA), predB = Number(bet.scoreB);
  const actualOutcome = outcome(actualA, actualB), predOutcome = outcome(predA, predB);
  if (predA === actualA && predB === actualB) { points += 5; exactScore = true; winnerHit = true; breakdown.push({label:"Placar exato", points:5}); }
  else if (predOutcome === actualOutcome) { winnerHit = true; const ad = Math.abs(actualA-actualB), pd = Math.abs(predA-predB); if (actualOutcome !== "draw" && ad === pd) { points += 3; breakdown.push({label:"Vencedor + diferença", points:3}); } else { points += 2; breakdown.push({label:"Vencedor/empate", points:2}); } }
  else if (predA === actualA || predB === actualB) { points += 1; breakdown.push({label:"Gols de um time", points:1}); }
  else breakdown.push({label:"Placar", points:0});
  if (bet.scorer) { const hit = (match.scorers || []).some(s => normalize(s) === normalize(bet.scorer)); if (hit) { points += 2; scorerHit = true; breakdown.push({label:"Jogador fez gol", points:2}); } else breakdown.push({label:"Jogador fez gol", points:0}); }
  if (typeof bet.penalty === "boolean") { if (bet.penalty === Boolean(match.penalty)) { points += 2; breakdown.push({label:"Pênalti", points:2}); } else breakdown.push({label:"Pênalti", points:0}); }
  if (typeof bet.redCard === "boolean") { if (bet.redCard === Boolean(match.redCard)) { points += 2; breakdown.push({label:"Vermelho", points:2}); } else breakdown.push({label:"Vermelho", points:0}); }
  if (bet.totalGoals !== undefined && bet.totalGoals !== null && bet.totalGoals !== "") { const diff = Math.abs(Number(bet.totalGoals) - (actualA + actualB)); if (diff === 0) { points += 3; breakdown.push({label:"Total exato", points:3}); } else if (diff === 1) { points += 2; breakdown.push({label:"Total aprox.", points:2}); } else if (diff === 2) { points += 1; breakdown.push({label:"Total aprox.", points:1}); } else breakdown.push({label:"Total", points:0}); }
  return { points, exactScore, winnerHit, scorerHit, breakdown };
}
function buildRanking() {
  return state.users.filter(u => u.role !== "admin").map(user => {
    let points=0, exactScores=0, winners=0, scorers=0, played=0;
    state.bets.filter(b => b.userId === user.id).forEach(bet => { const match = getMatch(bet.matchId); if (match && match.status === "finished") { played++; const r = calculatePoints(bet, match); points += r.points; if (r.exactScore) exactScores++; if (r.winnerHit) winners++; if (r.scorerHit) scorers++; } });
    return {...user, points, exactScores, winners, scorers, played};
  }).sort((a,b) => b.points-a.points || b.exactScores-a.exactScores || b.winners-a.winners || b.scorers-a.scorers || a.name.localeCompare(b.name));
}

function showAppState() {
  const setupGate = $("#setupGate"), authGate = $("#authGate"), appContent = $("#appContent"), openAuthBtn = $("#openAuthBtn"), logoutBtn = $("#logoutBtn");
  if (!hasConfig() || !window.firebase) { setupGate.classList.remove("hidden"); authGate.classList.add("hidden"); appContent.classList.add("hidden"); openAuthBtn.classList.add("hidden"); logoutBtn.classList.add("hidden"); return; }
  setupGate.classList.add("hidden"); openAuthBtn.classList.remove("hidden");
  if (state.user) { authGate.classList.add("hidden"); appContent.classList.remove("hidden"); openAuthBtn.textContent = (state.profile && state.profile.name) || state.user.email; openAuthBtn.classList.add("ghost-btn"); openAuthBtn.classList.remove("primary-btn"); logoutBtn.classList.remove("hidden"); }
  else { authGate.classList.remove("hidden"); appContent.classList.add("hidden"); openAuthBtn.textContent = "Entrar"; openAuthBtn.classList.add("primary-btn"); openAuthBtn.classList.remove("ghost-btn"); logoutBtn.classList.add("hidden"); }
  $$(".admin-only").forEach(i => i.classList.toggle("hidden", !isAdmin()));
}
function setView(view) { if (!state.user) return openAuthModal(); if (view === "admin" && !isAdmin()) return toast("Apenas admin acessa isso."); currentView = view; $$(".nav-item").forEach(i => i.classList.toggle("active", i.dataset.view === view)); $$(".view").forEach(i => i.classList.add("hidden")); const box = $(`#view-${view}`); if (box) box.classList.remove("hidden"); const titles = {dashboard:["Início","Bolão conectado ao Firebase."], betting:["Apostar","Apostas salvas online."], live:["Tempo real","Atualizações em todos os dispositivos."], finished:["Encerrados","Resultados finais e pontos."], ranking:["Ranking","Classificação geral."], rules:["Regras","Sistema oficial do bolão."], admin:["Admin","Controle jogos e resultados."]}; $("#pageTitle").textContent = titles[view][0]; $("#pageSubtitle").textContent = titles[view][1]; renderCurrentView(); $("#sidebar").classList.remove("open"); }
function renderCurrentView() { showAppState(); if (!state.user) return; if (state.loading) return $("#view-dashboard").innerHTML = `<div class="card"><h3>Carregando Firebase...</h3></div>`; ({dashboard:renderDashboard, betting:renderBetting, live:renderLive, finished:renderFinished, ranking:renderRanking, rules:renderRules, admin:renderAdmin}[currentView] || renderDashboard)(); }

function renderDashboard() {
  const ranking = buildRanking(); const upcoming = state.matches.filter(m=>m.status==="upcoming").length, live = state.matches.filter(m=>m.status==="live").length, finished = state.matches.filter(m=>m.status==="finished").length, myBets = state.bets.filter(b=>b.userId===state.user.uid).length;
  $("#view-dashboard").innerHTML = `${renderErrorCard()}<div class="grid grid-4"><div class="card stat"><span>Abertos</span><strong>${upcoming}</strong><small>Para apostar</small></div><div class="card stat"><span>Ao vivo</span><strong>${live}</strong><small>Tempo real</small></div><div class="card stat"><span>Encerrados</span><strong>${finished}</strong><small>Valem ranking</small></div><div class="card stat"><span>Minhas apostas</span><strong>${myBets}</strong><small>Online</small></div></div><div class="grid grid-2" style="margin-top:18px"><div class="card"><div class="match-head"><h3>Jogos</h3><button class="secondary-btn" onclick="setView('betting')">Apostar</button></div><div class="grid">${state.matches.filter(m=>m.status!=="finished").slice(0,3).map(renderMiniMatch).join("") || "<p>Nenhum jogo cadastrado.</p>"}</div></div><div class="card"><h3>Top ranking</h3><div class="table-wrap"><table><thead><tr><th>#</th><th>Nome</th><th>Pontos</th><th>Exatos</th></tr></thead><tbody>${ranking.slice(0,5).map((r,i)=>`<tr><td><div class="rank-pos ${i===0?"gold":i===1?"silver":i===2?"bronze":""}">${i+1}</div></td><td><strong>${escapeHtml(r.name)}</strong></td><td><strong>${r.points}</strong></td><td>${r.exactScores}</td></tr>`).join("") || "<tr><td colspan='4'>Sem ranking.</td></tr>"}</tbody></table></div></div></div>`;
}
function renderMiniMatch(m) { const bet = getUserBet(state.user.uid, m.id); return `<div class="card tight match-card"><div class="match-head"><div class="match-title"><div class="flag">${m.flagA||"🏳️"}</div><div><div class="teams">${escapeHtml(m.teamA)} x ${escapeHtml(m.teamB)}</div><div class="meta">${escapeHtml(m.stage||"")} • ${formatDate(m.kickoff)}</div></div></div><span class="status ${statusClass(m.status)}">${statusLabel(m.status)}</span></div><div class="score"><span>${m.scoreA??"-"}</span><small>x</small><span>${m.scoreB??"-"}</span></div><div class="meta">${bet?`Sua aposta: ${bet.scoreA} x ${bet.scoreB}`:"Sem aposta ainda."}</div></div>`; }
function renderBetting() { const open = state.matches.filter(m => m.status !== "finished"); $("#view-betting").innerHTML = `${renderErrorCard()}<div class="grid grid-2">${open.map(renderBettingCard).join("") || "<div class='card'><h3>Nenhum jogo aberto</h3></div>"}</div>`; $$(".bet-form").forEach(f => f.addEventListener("submit", handleBetSubmit)); }
function renderBettingCard(m) { const bet = getUserBet(state.user.uid,m.id); return `<div class="card match-card"><div class="match-head"><div class="match-title"><div class="flag">${m.flagA||"🏳️"}</div><div><div class="teams">${escapeHtml(m.teamA)} x ${escapeHtml(m.teamB)}</div><div class="meta">${formatDate(m.kickoff)}</div></div></div><span class="status ${statusClass(m.status)}">${statusLabel(m.status)}</span></div><div class="score"><span>${m.scoreA??"-"}</span><small>x</small><span>${m.scoreB??"-"}</span></div><div class="rule-item"><strong>Sistema oficial</strong><span>Placar exato 5 • Vencedor+diferenca 3 • Vencedor/empate 2 • Gol de um time 1 • Goleador 2 • Pênalti 2 • Vermelho 2 • Total 3/2/1.</span></div><form class="bet-form" data-match-id="${m.id}"><div class="form-row"><div><label>Gols ${escapeHtml(m.teamA)}</label><input type="number" min="0" name="scoreA" value="${bet?.scoreA??""}" required></div><div><label>Gols ${escapeHtml(m.teamB)}</label><input type="number" min="0" name="scoreB" value="${bet?.scoreB??""}" required></div></div><div class="form-row"><div><label>Jogador para fazer gol</label><input name="scorer" value="${escapeAttr(bet?.scorer??"")}"></div><div><label>Total de gols</label><input type="number" min="0" name="totalGoals" value="${bet?.totalGoals??""}" required></div></div><div class="form-row"><div><label>Vai ter pênalti?</label><select name="penalty">${boolOptions(bet?.penalty)}</select></div><div><label>Vai ter vermelho?</label><select name="redCard">${boolOptions(bet?.redCard)}</select></div></div><button class="primary-btn full" type="submit">${bet?"Atualizar aposta":"Salvar aposta"}</button></form></div>`; }
async function handleBetSubmit(e) { e.preventDefault(); const form = e.currentTarget, matchId = form.dataset.matchId, m = getMatch(matchId); if (!m || m.status === "finished") return toast("Jogo encerrado."); const d = new FormData(form); const payload = {userId:state.user.uid, matchId, scoreA:Number(d.get("scoreA")), scoreB:Number(d.get("scoreB")), scorer:d.get("scorer").trim(), penalty:d.get("penalty")==="true", redCard:d.get("redCard")==="true", totalGoals:Number(d.get("totalGoals")), updatedAt:stamp()}; if (!getUserBet(state.user.uid, matchId)) payload.createdAt = stamp(); try { await db.collection("bets").doc(`${state.user.uid}_${matchId}`).set(payload,{merge:true}); toast("Aposta salva."); } catch(err) { setLastError(err); } }

function renderLive() { const live = state.matches.filter(m=>m.status==="live"), upcoming = state.matches.filter(m=>m.status==="upcoming"); $("#view-live").innerHTML = `${renderErrorCard()}<div class="card" style="margin-bottom:18px"><div class="match-head"><div><span class="badge">Tempo real</span><h3 style="margin-top:12px">Firestore realtime</h3><p>Quando o admin salva, todos veem.</p></div>${isAdmin()?`<button class="${liveMode?"danger-btn":"primary-btn"}" id="liveToggleBtn">${liveMode?"Parar":"Simular"}</button>`:""}</div></div><div class="grid grid-2">${live.map(renderLiveMatch).join("") || "<div class='card'><h3>Nenhum jogo ao vivo</h3></div>"}</div><div class="card" style="margin-top:18px"><h3>Próximos</h3><div class="grid grid-2">${upcoming.map(renderMiniMatch).join("") || "<p>Nenhum.</p>"}</div></div>`; $("#liveToggleBtn")?.addEventListener("click", toggleLiveMode); }
function renderLiveMatch(m) { return `<div class="card match-card"><div class="match-head"><div class="match-title"><div class="flag">${m.flagA||"🏳️"}</div><div><div class="teams">${escapeHtml(m.teamA)} x ${escapeHtml(m.teamB)}</div><div class="meta">${m.minute||0}'</div></div></div><span class="status live">Ao vivo</span></div><div class="score"><span>${m.scoreA??0}</span><small>x</small><span>${m.scoreB??0}</span></div><div class="timeline">${(m.events||[]).slice().reverse().map(ev=>`<div class="event-line"><div class="event-dot"></div><div><strong>${ev.minute}'</strong><span>${escapeHtml(ev.text)}</span></div></div>`).join("") || "<p>Sem eventos.</p>"}</div></div>`; }
async function toggleLiveMode() { if (!isAdmin()) return; liveMode = !liveMode; if (liveMode) { liveTimer = setInterval(simulateLiveTick, 5000); toast("Simulação ativada."); } else { clearInterval(liveTimer); toast("Simulação parada."); } renderLive(); }
async function simulateLiveTick() { const live = state.matches.filter(m=>m.status==="live"); for (const m of live) { const next = {...m, minute:Math.min(90, Number(m.minute||0)+3), scoreA:m.scoreA??0, scoreB:m.scoreB??0}; if (Math.random()>.75 && next.minute<90) { next.scoreA += 1; next.scorers=[...(next.scorers||[]),"Camisa 10"]; next.events=[...(next.events||[]),{minute:next.minute,text:`Gol de ${next.teamA} — Camisa 10`}]; } if (next.minute>=90) { next.minute=90; next.status="finished"; next.events=[...(next.events||[]),{minute:90,text:"Fim de jogo"}]; } await db.collection("matches").doc(m.id).update(sanitizeMatch(next)); } }
function renderFinished() { const list = state.matches.filter(m=>m.status==="finished"); $("#view-finished").innerHTML = `${renderErrorCard()}<div class="grid">${list.map(renderFinishedMatch).join("") || "<div class='card'><h3>Nenhum encerrado.</h3></div>"}</div>`; }
function renderFinishedMatch(m) { const bets = state.bets.filter(b=>b.matchId===m.id); return `<div class="card"><div class="match-head"><div class="match-title"><div class="flag">${m.flagA||"🏳️"}</div><div><div class="teams">${escapeHtml(m.teamA)} x ${escapeHtml(m.teamB)}</div><div class="meta">${formatDate(m.kickoff)}</div></div></div><span class="status done">Encerrado</span></div><div class="score"><span>${m.scoreA}</span><small>x</small><span>${m.scoreB}</span></div><p><strong>Gols:</strong> ${(m.scorers||[]).map(escapeHtml).join(", ") || "Sem gols"}</p><div class="table-wrap"><table><thead><tr><th>Jogador</th><th>Placar</th><th>Goleador</th><th>Pontos</th></tr></thead><tbody>${bets.map(b=>{const u=getUser(b.userId), r=calculatePoints(b,m); return `<tr><td><strong>${escapeHtml(u?.name||"Usuário")}</strong></td><td>${b.scoreA} x ${b.scoreB}</td><td>${escapeHtml(b.scorer||"-")}</td><td><strong>${r.points}</strong><div class="meta">${r.breakdown.map(i=>`${i.label}: ${i.points}`).join(" • ")}</div></td></tr>`}).join("") || "<tr><td colspan='4'>Ninguém apostou.</td></tr>"}</tbody></table></div></div>`; }
function renderRanking() { const r = buildRanking(); $("#view-ranking").innerHTML = `${renderErrorCard()}<div class="card"><h3>Ranking geral</h3><div class="table-wrap"><table><thead><tr><th>#</th><th>Nome</th><th>Pontos</th><th>Exatos</th><th>Venc.</th><th>Goleadores</th><th>Jogos</th></tr></thead><tbody>${r.map((x,i)=>`<tr><td><div class="rank-pos ${i===0?"gold":i===1?"silver":i===2?"bronze":""}">${i+1}</div></td><td><strong>${escapeHtml(x.name)}</strong></td><td><strong>${x.points}</strong></td><td>${x.exactScores}</td><td>${x.winners}</td><td>${x.scorers}</td><td>${x.played}</td></tr>`).join("") || "<tr><td colspan='7'>Sem ranking.</td></tr>"}</tbody></table></div></div>`; }
function renderRules() { $("#view-rules").innerHTML = `<div class="grid grid-2"><div class="card"><span class="badge">Placar</span><h3 style="margin-top:12px">Pontuação</h3><div class="rule-list"><div class="rule-item"><strong>5 pontos</strong><span>Placar exato.</span></div><div class="rule-item"><strong>3 pontos</strong><span>Vencedor + diferença.</span></div><div class="rule-item"><strong>2 pontos</strong><span>Apenas vencedor/empate.</span></div><div class="rule-item"><strong>1 ponto</strong><span>Gols de um dos times.</span></div></div></div><div class="card"><span class="badge">Extras</span><h3 style="margin-top:12px">Categorias</h3><div class="rule-list"><div class="rule-item"><strong>Goleador: 2</strong><span>Jogador fez gol.</span></div><div class="rule-item"><strong>Pênalti: 2</strong><span>Sim/não.</span></div><div class="rule-item"><strong>Vermelho: 2</strong><span>Sim/não.</span></div><div class="rule-item"><strong>Total: 3/2/1</strong><span>Exato, erro 1, erro 2.</span></div></div></div></div>`; }
function renderAdmin() { if (!isAdmin()) return $("#view-admin").innerHTML = `<div class="card"><h3>Acesso negado</h3></div>`; $("#view-admin").innerHTML = `${renderErrorCard()}<div class="admin-grid"><div class="card"><div class="match-head"><div><span class="badge">Admin</span><h3 style="margin-top:12px">Jogos</h3></div><button class="secondary-btn" id="seedBtn">Criar jogos demo</button></div>${state.matches.map(renderAdminMatch).join("") || "<p>Nenhum jogo.</p>"}</div><div class="card"><span class="badge">Novo jogo</span><h3 style="margin-top:12px">Cadastrar</h3><form id="addMatchForm" class="bet-form"><div class="form-row"><div><label>Time A</label><input name="teamA" required></div><div><label>Time B</label><input name="teamB" required></div></div><div class="form-row"><div><label>Bandeira A</label><input name="flagA"></div><div><label>Bandeira B</label><input name="flagB"></div></div><div><label>Data</label><input type="datetime-local" name="kickoff" required></div><div><label>Fase</label><input name="stage" value="Fase de grupos"></div><button class="primary-btn full" type="submit">Adicionar</button></form><div class="rule-item" style="margin-top:18px"><strong>Admin</strong><span>No Firestore, mude seu usuário para role = admin.</span></div></div></div>`; $$(".admin-match-form").forEach(f=>f.addEventListener("submit", handleAdminUpdate)); $$(".delete-match").forEach(b=>b.addEventListener("click", handleDeleteMatch)); $("#addMatchForm")?.addEventListener("submit", handleAddMatch); $("#seedBtn")?.addEventListener("click", seedDemoMatches); }
function renderAdminMatch(m) { return `<form class="admin-match admin-match-form" data-match-id="${m.id}"><div class="match-head"><strong>${m.flagA||"🏳️"} ${escapeHtml(m.teamA)} x ${escapeHtml(m.teamB)} ${m.flagB||"🏳️"}</strong><span class="status ${statusClass(m.status)}">${statusLabel(m.status)}</span></div><div class="form-row three"><div><label>Status</label><select name="status"><option value="upcoming" ${m.status==="upcoming"?"selected":""}>Aberto</option><option value="live" ${m.status==="live"?"selected":""}>Ao vivo</option><option value="finished" ${m.status==="finished"?"selected":""}>Encerrado</option></select></div><div><label>Gols A</label><input type="number" min="0" name="scoreA" value="${m.scoreA??0}"></div><div><label>Gols B</label><input type="number" min="0" name="scoreB" value="${m.scoreB??0}"></div></div><div class="form-row"><div><label>Minuto</label><input type="number" name="minute" value="${m.minute??0}"></div><div><label>Data</label><input type="datetime-local" name="kickoff" value="${m.kickoff||""}"></div></div><div><label>Goleadores</label><input name="scorers" value="${escapeAttr((m.scorers||[]).join(", "))}"></div><div class="form-row"><div><label>Pênalti?</label><select name="penalty">${boolOptions(Boolean(m.penalty))}</select></div><div><label>Vermelho?</label><select name="redCard">${boolOptions(Boolean(m.redCard))}</select></div></div><div><label>Evento novo</label><input name="eventText"></div><div class="admin-actions"><button class="primary-btn" type="submit">Salvar</button><button class="danger-btn delete-match" type="button" data-match-id="${m.id}">Excluir</button></div></form>`; }
function sanitizeMatch(m) { return {teamA:m.teamA, teamB:m.teamB, flagA:m.flagA||"🏳️", flagB:m.flagB||"🏳️", kickoff:m.kickoff||"", stage:m.stage||"Fase de grupos", status:m.status||"upcoming", minute:Number(m.minute||0), scoreA:m.status==="upcoming"?null:Number(m.scoreA||0), scoreB:m.status==="upcoming"?null:Number(m.scoreB||0), scorers:Array.isArray(m.scorers)?m.scorers:[], penalty:Boolean(m.penalty), redCard:Boolean(m.redCard), events:Array.isArray(m.events)?m.events:[], updatedAt:stamp()}; }
async function handleAdminUpdate(e) { e.preventDefault(); const f=e.currentTarget, m=getMatch(f.dataset.matchId), d=new FormData(f); const next = {...m, status:d.get("status"), scoreA:Number(d.get("scoreA")), scoreB:Number(d.get("scoreB")), minute:Number(d.get("minute")), kickoff:d.get("kickoff"), scorers:d.get("scorers").split(",").map(x=>x.trim()).filter(Boolean), penalty:d.get("penalty")==="true", redCard:d.get("redCard")==="true"}; const ev=d.get("eventText").trim(); if (ev) next.events=[...(next.events||[]),{minute:next.minute||0,text:ev}]; try { await db.collection("matches").doc(m.id).update(sanitizeMatch(next)); toast("Jogo salvo."); } catch(err){ setLastError(err); } }
async function handleAddMatch(e) { e.preventDefault(); const d=new FormData(e.currentTarget); const match = {teamA:d.get("teamA").trim(), teamB:d.get("teamB").trim(), flagA:d.get("flagA").trim()||"🏳️", flagB:d.get("flagB").trim()||"🏳️", kickoff:d.get("kickoff"), stage:d.get("stage").trim()||"Fase de grupos", status:"upcoming", minute:0, scoreA:null, scoreB:null, scorers:[], penalty:false, redCard:false, events:[], createdAt:stamp(), updatedAt:stamp()}; try { await db.collection("matches").doc(uid("match")).set(match); e.currentTarget.reset(); toast("Jogo criado."); } catch(err){ setLastError(err); } }
async function handleDeleteMatch(e) { if(!confirm("Excluir jogo?")) return; try { await db.collection("matches").doc(e.currentTarget.dataset.matchId).delete(); toast("Excluído."); } catch(err){ setLastError(err); } }
async function seedDemoMatches() { try { const batch = db.batch(); DEFAULT_MATCHES.forEach((m,i)=>batch.set(db.collection("matches").doc(`demo-${i+1}`), {...m, createdAt:stamp(), updatedAt:stamp()}, {merge:true})); await batch.commit(); toast("Jogos demo criados."); } catch(err){ setLastError(err); } }

async function ensureProfile(user) { const ref = db.collection("users").doc(user.uid); const snap = await ref.get(); if (!snap.exists) { const profile = {name:user.displayName || (user.email||"Jogador").split("@")[0], email:user.email||"", role:"player", createdAt:stamp(), updatedAt:stamp()}; await ref.set(profile); return {id:user.uid, ...profile}; } return {id:snap.id, ...snap.data()}; }
function clearSubscriptions() { unsubscribers.forEach(u=>u()); unsubscribers = []; }
function subscribeData() { clearSubscriptions(); state.loading = true; renderCurrentView(); unsubscribers.push(db.collection("users").onSnapshot(snap=>{ state.users = snap.docs.map(d=>({id:d.id,...d.data()})); state.profile = state.users.find(u=>u.id===state.user?.uid) || state.profile; state.loading=false; renderCurrentView(); }, setLastError)); unsubscribers.push(db.collection("matches").onSnapshot(snap=>{ state.matches = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>String(a.kickoff||"").localeCompare(String(b.kickoff||""))); state.loading=false; renderCurrentView(); }, setLastError)); unsubscribers.push(db.collection("bets").onSnapshot(snap=>{ state.bets = snap.docs.map(d=>({id:d.id,...d.data()})); state.loading=false; renderCurrentView(); }, setLastError)); }
async function handleLogin(e) {
  e.preventDefault();

  if (!auth) {
    setLastError("Auth ainda não iniciou. Confira o firebase-config.js.");
    return;
  }

  const d = new FormData(e.currentTarget);
  const email = String(d.get("email")).trim();
  const password = String(d.get("password"));

  if (!email || !password) {
    toast("Preencha email e senha.");
    return;
  }

  try {
    await auth.signInWithEmailAndPassword(email, password);
    closeAuthModal();
    toast("Login feito.");
  } catch (err) {
    setLastError(err);
  }
}
async function handleRegister(e) {
  e.preventDefault();

  if (!auth || !db) {
    setLastError("Firebase ainda não iniciou. Confira o firebase-config.js.");
    return;
  }

  const d = new FormData(e.currentTarget);

  const name = String(d.get("name")).trim();
  const email = String(d.get("email")).trim();
  const password = String(d.get("password"));

  if (!name || !email || !password) {
    toast("Preencha todos os campos.");
    return;
  }

  try {
    const cred = await auth.createUserWithEmailAndPassword(email, password);

    await cred.user.updateProfile({
      displayName: name
    });

    await db.collection("users").doc(cred.user.uid).set({
      name: name,
      email: email,
      role: "player",
      createdAt: stamp(),
      updatedAt: stamp()
    });

    closeAuthModal();
    toast("Conta criada.");
  } catch (err) {
    setLastError(err);
  }
}
async function logout(){ try { await auth.signOut(); toast("Saiu."); } catch(err){ setLastError(err); } }
function openAuthModal(){ $("#authModal").classList.remove("hidden"); }
function closeAuthModal(){ $("#authModal").classList.add("hidden"); }
function initTheme(){ const t=localStorage.getItem(THEME_KEY)||"dark"; document.documentElement.dataset.theme=t; $("#themeBtn").textContent=t==="dark"?"🌙":"☀️"; }
function toggleTheme(){ const next=(document.documentElement.dataset.theme||"dark")==="dark"?"light":"dark"; document.documentElement.dataset.theme=next; localStorage.setItem(THEME_KEY,next); $("#themeBtn").textContent=next==="dark"?"🌙":"☀️"; }
function bindEvents(){ $$(".nav-item").forEach(i=>i.addEventListener("click",()=>setView(i.dataset.view))); $("#openAuthBtn").addEventListener("click",openAuthModal); $("#heroAuthBtn").addEventListener("click",openAuthModal); $("#logoutBtn").addEventListener("click",logout); $("#menuBtn").addEventListener("click",()=>$("#sidebar").classList.toggle("open")); $("#themeBtn").addEventListener("click",toggleTheme); $$("[data-close='auth']").forEach(i=>i.addEventListener("click",closeAuthModal)); $("#loginForm").addEventListener("submit",handleLogin); $("#registerForm").addEventListener("submit",handleRegister); $$("[data-auth-tab]").forEach(tab=>tab.addEventListener("click",()=>{ $$("[data-auth-tab]").forEach(x=>x.classList.remove("active")); tab.classList.add("active"); const mode=tab.dataset.authTab; $("#loginForm").classList.toggle("hidden",mode!=="login"); $("#registerForm").classList.toggle("hidden",mode!=="register"); })); }
function initFirebase() {
  try {
    if (!hasConfig()) {
      showAppState();
      return;
    }

    if (!window.firebase) {
      setLastError("Firebase SDK não carregou. Confira os scripts do Firebase no index.html.");
      return;
    }

    if (!firebase.apps.length) {
      firebase.initializeApp(window.firebaseConfig);
    }

    auth = firebase.auth();
    db = firebase.firestore();
    fieldValue = firebase.firestore.FieldValue;

    auth.onAuthStateChanged(async (user) => {
      clearSubscriptions();

      state.user = user;
      state.profile = null;
      state.users = [];
      state.matches = [];
      state.bets = [];
      state.lastError = null;

      if (!user) {
        state.loading = false;
        showAppState();
        return;
      }

      try {
        state.profile = await ensureProfile(user);
        subscribeData();
        setView(currentView);
      } catch (err) {
        state.loading = false;
        setLastError(err);
      }
    });
  } catch (err) {
    setLastError(err);
  }
}
window.addEventListener("error", e => setLastError(e.message));
window.addEventListener("unhandledrejection", e => setLastError(e.reason || "Erro no app.js"));
window.setView = setView;
initTheme(); bindEvents(); showAppState(); initFirebase();
