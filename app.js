// ---------- Datos base ----------

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

// ---------- Estado ----------

const STORAGE_KEY = "marcas_registros_v1";

let registros = cargarRegistros();
let editingId = null;

function cargarRegistros() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function guardarRegistros() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(registros));
}

function nuevoId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const $ = (id) => document.getElementById(id);

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
      onEnd: (evt) => {
        const id = evt.item.dataset.id;
        const nuevaEtapa = evt.to.dataset.etapa;
        moverEtapa(id, nuevaEtapa);
      },
    });
  });
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
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      moverEtapa(btn.dataset.id, btn.dataset.siguiente);
    });
  });
}

function moverEtapa(id, etapa) {
  const r = registros.find((r) => r.id === id);
  if (!r) return;
  r.etapa = etapa;
  guardarRegistros();
  renderTodo();
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

function renderTodo() {
  renderBoard();
  renderDashboard();
}

// ---------- Modal: nueva marca ----------

$("addBtn").addEventListener("click", () => {
  $("nuevaNombre").value = "";
  $("nuevaCanal").value = "whatsapp";
  $("modalNueva").classList.remove("hidden");
});

$("nuevaCancelar").addEventListener("click", () => $("modalNueva").classList.add("hidden"));

$("nuevaGuardar").addEventListener("click", () => {
  const nombre_marca = $("nuevaNombre").value.trim();
  if (!nombre_marca) return;
  const hoy = new Date().toISOString().slice(0, 10);
  registros.push({
    id: nuevoId(),
    nombre_marca,
    canal_contacto: $("nuevaCanal").value,
    etapa: "interesado",
    pago_estado: false,
    necesita_factura: false,
    ultima_reunion: null,
    ultimo_pago: null,
    ultimo_contacto: hoy,
    created_at: new Date().toISOString(),
  });
  guardarRegistros();
  $("modalNueva").classList.add("hidden");
  renderTodo();
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

$("editGuardar").addEventListener("click", () => {
  const r = registros.find((r) => r.id === editingId);
  if (!r) return;
  r.canal_contacto = $("editCanal").value;
  r.etapa = $("editEtapa").value;
  r.pago_estado = $("editPago").checked;
  r.necesita_factura = $("editFactura").checked;
  r.ultima_reunion = $("editReunion").value || null;
  r.ultimo_pago = $("editUltimoPago").value || null;
  r.ultimo_contacto = $("editContacto").value || null;
  guardarRegistros();
  $("modalEditar").classList.add("hidden");
  renderTodo();
});

$("editEliminar").addEventListener("click", () => {
  if (!confirm("¿Eliminar esta marca del tablero?")) return;
  registros = registros.filter((r) => r.id !== editingId);
  guardarRegistros();
  $("modalEditar").classList.add("hidden");
  renderTodo();
});

// ---------- Bloqueo con clave ----------

const CLAVE_APP = "1993";
const LOCK_KEY = "marcas_unlocked";

function mostrarApp() {
  $("lockScreen").classList.add("hidden");
  $("app").classList.remove("hidden");
  buildBoard();
  renderTodo();
}

function intentarDesbloquear() {
  const input = $("lockInput");
  if (input.value === CLAVE_APP) {
    localStorage.setItem(LOCK_KEY, "1");
    mostrarApp();
  } else {
    $("lockError").classList.remove("hidden");
    input.value = "";
    input.focus();
  }
}

$("lockBtn").addEventListener("click", intentarDesbloquear);
$("lockInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") intentarDesbloquear();
});

if (localStorage.getItem(LOCK_KEY) === "1") {
  mostrarApp();
}

// ---------- PWA (offline) ----------

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch(() => {});
  });
}
