import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const COLUMNAS = [
  { key: "interesado", label: "Interesado", color: "#4d8dff" },
  { key: "pago", label: "Pago", color: "#ffb703" },
  { key: "etapa1", label: "Etapa 1", color: "#ff6b6b" },
  { key: "etapa2", label: "Etapa 2", color: "#8a5cf6" },
  { key: "etapa3", label: "Etapa 3", color: "#06d6a0" },
  { key: "etapa4", label: "Etapa 4", color: "#2a9d8f" },
];

const CANAL_ICONO = {
  whatsapp: "💬 WhatsApp",
  llamada: "📞 Llamada",
  correo: "✉️ Correo",
  instagram: "📷 Instagram",
  otro: "❔ Otro",
};

const MESES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

let registros = [];
let currentUserId = null;
let editingId = null;

const $ = (id) => document.getElementById(id);

// ---------- Auth ----------

async function init() {
  const { data } = await supabase.auth.getSession();
  if (data.session) {
    onLoggedIn(data.session.user);
  } else {
    showLogin();
  }
}

function showLogin() {
  $("loginScreen").classList.remove("hidden");
  $("app").classList.add("hidden");
}

async function onLoggedIn(user) {
  currentUserId = user.id;
  $("loginScreen").classList.add("hidden");
  $("app").classList.remove("hidden");
  buildBoard();
  await loadRegistros();
  subscribeRealtime();
}

$("loginBtn").addEventListener("click", async () => {
  const email = $("loginEmail").value.trim();
  const password = $("loginPassword").value;
  $("loginError").classList.add("hidden");
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    $("loginError").textContent = "No pudimos entrar: " + error.message;
    $("loginError").classList.remove("hidden");
    return;
  }
  onLoggedIn(data.user);
});

$("logoutBtn").addEventListener("click", async () => {
  await supabase.auth.signOut();
  registros = [];
  showLogin();
});

// ---------- Board ----------

function buildBoard() {
  const board = $("board");
  board.innerHTML = "";
  COLUMNAS.forEach((col) => {
    const colEl = document.createElement("div");
    colEl.className = "column";
    colEl.innerHTML = `
      <div class="column-header" style="background:${col.color}">
        <span>${col.label}</span>
        <span class="column-count" id="count-${col.key}">0</span>
      </div>
      <div class="column-list" id="list-${col.key}" data-etapa="${col.key}"></div>
    `;
    board.appendChild(colEl);
  });

  COLUMNAS.forEach((col) => {
    const list = $(`list-${col.key}`);
    Sortable.create(list, {
      group: "board",
      animation: 150,
      onEnd: async (evt) => {
        const id = evt.item.dataset.id;
        const nuevaEtapa = evt.to.dataset.etapa;
        await moverEtapa(id, nuevaEtapa);
      },
    });
  });
}

async function loadRegistros() {
  const { data, error } = await supabase
    .from("registros")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error(error);
    return;
  }
  registros = data;
  renderBoard();
  renderDashboard();
}

function subscribeRealtime() {
  supabase
    .channel("registros-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "registros" }, () => {
      loadRegistros();
    })
    .subscribe();
}

function diasDesde(fechaStr) {
  if (!fechaStr) return null;
  const dias = Math.floor((Date.now() - new Date(fechaStr).getTime()) / 86400000);
  return dias;
}

function seguimientoBadge(registro) {
  const dias = diasDesde(registro.ultimo_contacto || registro.created_at);
  if (dias === null) return `<span class="badge badge-seguimiento-warn">sin contacto</span>`;
  if (dias <= 3) return `<span class="badge badge-seguimiento-ok">hace ${dias}d</span>`;
  if (dias <= 7) return `<span class="badge badge-seguimiento-warn">hace ${dias}d</span>`;
  return `<span class="badge badge-seguimiento-bad">hace ${dias}d ⚠️</span>`;
}

function renderBoard() {
  COLUMNAS.forEach((col) => {
    const list = $(`list-${col.key}`);
    const items = registros.filter((r) => r.etapa === col.key);
    $(`count-${col.key}`).textContent = items.length;
    list.innerHTML = "";
    items.forEach((r) => {
      const idxSiguiente = COLUMNAS.findIndex((c) => c.key === col.key) + 1;
      const siguiente = COLUMNAS[idxSiguiente];
      const card = document.createElement("div");
      card.className = "card";
      card.dataset.id = r.id;
      card.innerHTML = `
        <div class="card-nombre">${escapeHtml(r.nombre_marca)}</div>
        <div class="card-meta">
          <span class="badge">${CANAL_ICONO[r.canal_contacto] || r.canal_contacto}</span>
          ${r.pago_estado ? '<span class="badge badge-pago">Pagó ✅</span>' : (col.key === "pago" ? '<span class="badge badge-nopago">No pagó ❌</span>' : "")}
          ${seguimientoBadge(r)}
        </div>
        ${siguiente ? `<button class="card-mover" data-id="${r.id}" data-siguiente="${siguiente.key}">Mover a ${siguiente.label} →</button>` : ""}
      `;
      card.addEventListener("click", (e) => {
        if (e.target.classList.contains("card-mover")) return;
        abrirEditar(r);
      });
      list.appendChild(card);
    });
  });

  document.querySelectorAll(".card-mover").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await moverEtapa(btn.dataset.id, btn.dataset.siguiente);
    });
  });
}

async function moverEtapa(id, etapa) {
  await supabase.from("registros").update({ etapa }).eq("id", id);
  await loadRegistros();
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

// ---------- Dashboard ----------

function renderDashboard() {
  const porMes = {};
  registros.forEach((r) => {
    const d = new Date(r.created_at);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    porMes[key] = (porMes[key] || 0) + 1;
  });

  const hoy = new Date();
  const ultimosMeses = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth()}`;
    ultimosMeses.push({ label: MESES[d.getMonth()], count: porMes[key] || 0 });
  }
  const max = Math.max(1, ...ultimosMeses.map((m) => m.count));
  $("dashInteresadosMes").innerHTML = ultimosMeses
    .map(
      (m) => `
      <div class="dash-mes">
        <div class="dash-mes-bar" style="height:${Math.max(4, (m.count / max) * 40)}px"></div>
        <span>${m.count}</span>
        <span>${m.label}</span>
      </div>`
    )
    .join("");

  const activos = registros.filter((r) => r.etapa !== "interesado").length;
  $("dashActivos").textContent = activos;

  const pendientes = registros.filter((r) => r.etapa === "pago" && !r.pago_estado);
  $("dashPendientesNum").textContent = pendientes.length;
  $("dashPendientesNombres").textContent = pendientes.map((r) => r.nombre_marca).join(", ");
}

// ---------- Modal: nueva marca ----------

$("addBtn").addEventListener("click", () => {
  $("nuevaNombre").value = "";
  $("nuevaCanal").value = "whatsapp";
  $("modalNueva").classList.remove("hidden");
});

$("nuevaCancelar").addEventListener("click", () => $("modalNueva").classList.add("hidden"));

$("nuevaGuardar").addEventListener("click", async () => {
  const nombre_marca = $("nuevaNombre").value.trim();
  if (!nombre_marca) return;
  const canal_contacto = $("nuevaCanal").value;
  await supabase.from("registros").insert({
    nombre_marca,
    canal_contacto,
    etapa: "interesado",
    user_id: currentUserId,
    ultimo_contacto: new Date().toISOString().slice(0, 10),
  });
  $("modalNueva").classList.add("hidden");
  await loadRegistros();
});

// ---------- Modal: editar ----------

function abrirEditar(r) {
  editingId = r.id;
  $("editarTitulo").textContent = r.nombre_marca;
  $("editCanal").value = r.canal_contacto;
  $("editEtapa").value = r.etapa;
  $("editPago").checked = r.pago_estado;
  $("editFactura").checked = r.necesita_factura;
  $("editReunion").value = r.ultima_reunion || "";
  $("editUltimoPago").value = r.ultimo_pago || "";
  $("editContacto").value = r.ultimo_contacto || "";
  $("modalEditar").classList.remove("hidden");
}

$("editCancelar").addEventListener("click", () => $("modalEditar").classList.add("hidden"));

$("editGuardar").addEventListener("click", async () => {
  await supabase
    .from("registros")
    .update({
      canal_contacto: $("editCanal").value,
      etapa: $("editEtapa").value,
      pago_estado: $("editPago").checked,
      necesita_factura: $("editFactura").checked,
      ultima_reunion: $("editReunion").value || null,
      ultimo_pago: $("editUltimoPago").value || null,
      ultimo_contacto: $("editContacto").value || null,
    })
    .eq("id", editingId);
  $("modalEditar").classList.add("hidden");
  await loadRegistros();
});

$("editEliminar").addEventListener("click", async () => {
  if (!confirm("¿Eliminar esta marca del tablero?")) return;
  await supabase.from("registros").delete().eq("id", editingId);
  $("modalEditar").classList.add("hidden");
  await loadRegistros();
});

// ---------- PWA ----------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}

init();
