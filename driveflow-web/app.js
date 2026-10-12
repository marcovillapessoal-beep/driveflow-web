const API_URL = "https://" + "driveflow-api" + ".onrender.com" + "/api/vehicles";
const state = {
  vehicles: [],
  selectedPlate: "",
  loading: false
};

const $ = (id) => document.getElementById(id);
const els = {
  count: $("contador-veiculos"),
  list: $("lista-botoes-veiculos"),
  data: $("dados-carro-selecionado"),
  renew: $("container-botao-renovar"),
  feedback: $("feedback"),
  detailsButton: $("details-button"),
  dialog: $("details-dialog"),
  dialogContent: $("dialog-content")
};

function safeText(value, fallback = "Não informado") {
  return value === null || value === undefined || String(value).trim() === ""
    ? fallback
    : String(value);
}

function selectedVehicle() {
  return state.vehicles.find(vehicle => vehicle.plate === state.selectedPlate);
}

function setFeedback(message = "") {
  els.feedback.textContent = message;
}

function formatDate(value) {
  if (!value) return "Não informado";
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value));
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return String(value);
}

function getStatus(vehicle) {
  const raw = safeText(vehicle.ipvaStats, "").toLowerCase();
  if (raw.includes("isento") || raw.includes("exempt")) {
    return { label: "IPVA isento", className: "exempt" };
  }
  if (raw.includes("pagar") || raw.includes("atras") || vehicle.ipvaRequired === true) {
    return { label: "IPVA pendente", className: "warn" };
  }
  return { label: "IPVA em dia", className: "ok" };
}

function canRenew(vehicle) {
  if (!vehicle) return false;
  const status = safeText(vehicle.ipvaStats, "").toLowerCase();
  return vehicle.ipvaRequired === true &&
    (status.includes("pagar") || status.includes("pend") || status.includes("atras"));
}

function renderVehicleList() {
  els.list.replaceChildren();

  if (!state.vehicles.length) {
    els.list.innerHTML = '<div class="empty-state">Nenhum veículo cadastrado ainda.</div>';
    return;
  }

  const fragment = document.createDocumentFragment();
  state.vehicles.forEach(vehicle => {
    const button = document.createElement("button");
    const selected = vehicle.plate === state.selectedPlate;
    button.type = "button";
    button.className = selected ? "car-list-button-selected" : "car-list-button";
    button.setAttribute("aria-pressed", String(selected));

    const model = document.createElement("span");
    model.className = "model";
    model.textContent = safeText(vehicle.model, "Veículo");

    const plate = document.createElement("span");
    plate.className = "plate";
    plate.textContent = safeText(vehicle.plate, "Sem placa");

    button.append(model, plate);
    button.addEventListener("click", () => {
      state.selectedPlate = vehicle.plate;
      render();
      setFeedback("");
    });
    fragment.appendChild(button);
  });
  els.list.appendChild(fragment);
}

function renderDetails() {
  const vehicle = selectedVehicle();

  if (!vehicle) {
    els.data.innerHTML = '<p class="loading">Selecione um veículo para ver os detalhes.</p>';
    els.renew.innerHTML = '<button class="btn-action-disabled" disabled>Renovar IPVA do veículo</button>';
    return;
  }

  const status = getStatus(vehicle);
  const carImage = $("selected-car-image");
  if (carImage) {
    // Opcional: a API pode retornar imageUrl; caso contrário usa a imagem local do Gol.
    carImage.src = vehicle.imageUrl || "assets/images/gol-quadrado.png";
    carImage.alt = "";
  }
  els.data.replaceChildren();

  const lines = [
    ["Modelo", safeText(vehicle.model)],
    ["Cor", safeText(vehicle.color)],
    ["IPVA", `Vencimento em ${formatDate(vehicle.ipvaExpirationDate)}`]
  ];

  lines.forEach(([label, value]) => {
    const p = document.createElement("p");
    p.append(`${label}: `);
    const strong = document.createElement("strong");
    strong.textContent = value;
    p.appendChild(strong);
    els.data.appendChild(p);
  });

  const pill = document.createElement("span");
  pill.className = `status-pill ${status.className}`;
  pill.textContent = `● ${status.label}`;
  els.data.appendChild(pill);

  if (canRenew(vehicle)) {
    els.renew.innerHTML = '<button type="button" class="btn-action-active" id="renew-button">Renovar IPVA do veículo</button>';
    $("renew-button").addEventListener("click", () => renovarIPVA(vehicle.plate));
  } else {
    const button = document.createElement("button");
    button.type = "button";
    button.disabled = true;
    button.className = "btn-action-disabled";
    button.textContent = status.className === "exempt" ? "Veículo isento de IPVA" : "IPVA do veículo em dia";
    els.renew.replaceChildren(button);
  }
}

function render() {
  els.count.textContent = `Confira seus veículos. (${state.vehicles.length})`;
  renderVehicleList();
  renderDetails();
}

async function carregarDados({ silent = false } = {}) {
  if (state.loading) return;
  state.loading = true;
  if (!silent) {
    setFeedback("Carregando veículos...");
    els.data.innerHTML = '<p class="loading">Carregando veículos...</p>';
  }

  try {
    const response = await fetch(API_URL, {
      headers: { "Accept": "application/json" },
      cache: "no-store"
    });
    if (!response.ok) throw new Error(`A API respondeu com HTTP ${response.status}.`);

    const data = await response.json();
    if (!Array.isArray(data)) throw new Error("A API não retornou uma lista de veículos.");

    state.vehicles = data;
    if (!state.vehicles.some(v => v.plate === state.selectedPlate)) {
      state.selectedPlate = state.vehicles[0]?.plate ?? "";
    }
    render();
    setFeedback(state.vehicles.length ? "" : "Sua lista de veículos está vazia.");
  } catch (error) {
    console.error("Erro ao carregar veículos:", error);
    els.count.textContent = "Não foi possível carregar os veículos";
    els.data.innerHTML = '<p>Não conseguimos conectar ao servidor Java.</p><p>Confira se o Spring Boot está rodando e se o CORS permite esta página.</p>';
    setFeedback("Verifique a API em localhost:8080 e tente atualizar.");
  } finally {
    state.loading = false;
  }
}

async function renovarIPVA(plate) {
  if (!plate) return;
  const vehicle = state.vehicles.find(v => v.plate === plate);
  if (!vehicle || !canRenew(vehicle)) return;

  const confirmed = window.confirm(`Deseja solicitar a renovação do IPVA do veículo ${vehicle.model} (${plate})?`);
  if (!confirmed) return;

  const button = $("renew-button");
  if (button) {
    button.disabled = true;
    button.textContent = "Processando...";
  }

  try {
    const response = await fetch(`${API_URL}/${encodeURIComponent(plate)}/renew`, {
      method: "POST",
      headers: { "Accept": "text/plain, application/json" }
    });
    const message = await response.text();
    if (!response.ok) throw new Error(message || `A API respondeu com HTTP ${response.status}.`);
    window.alert(message || "Solicitação de renovação concluída.");
    await carregarDados({ silent: true });
  } catch (error) {
    console.error("Erro ao renovar IPVA:", error);
    window.alert(error.message || "Não foi possível processar a renovação. Tente novamente.");
    renderDetails();
  }
}

function abrirDetalhes() {
  const vehicle = selectedVehicle();
  if (!vehicle) {
    setFeedback("Selecione um veículo primeiro.");
    return;
  }
  const status = getStatus(vehicle);
  const rows = [
    ["Modelo", safeText(vehicle.model)],
    ["Placa", safeText(vehicle.plate)],
    ["Cor", safeText(vehicle.color)],
    ["Vencimento do IPVA", formatDate(vehicle.ipvaExpirationDate)],
    ["Situação", status.label]
  ];
  els.dialogContent.replaceChildren();
  rows.forEach(([label, value]) => {
    const p = document.createElement("p");
    const strong = document.createElement("strong");
    strong.textContent = `${label}: `;
    p.append(strong, document.createTextNode(value));
    els.dialogContent.appendChild(p);
  });
  els.dialog.showModal();
}

$("refresh-button").addEventListener("click", () => carregarDados());
els.detailsButton.addEventListener("click", abrirDetalhes);
$("help-button").addEventListener("click", () => {
  window.alert("Esta interface é um projeto de aprendizado. Os dados são carregados da API Spring Boot local.");
});
$("menu-button").addEventListener("click", () => {
  window.alert("Menu de demonstração");
});

carregarDados();
