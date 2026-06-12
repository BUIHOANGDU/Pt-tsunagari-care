// Dashboard (mock-first; subscribes to realtime if Firestore configured)
FirebaseService.seedMockData && FirebaseService.seedMockData();

function updateRobotSection(robot) {
  document.getElementById("robot-status-text").textContent =
    robot?.status || "offline";
  document.getElementById("robot-battery-text").textContent =
    robot?.battery != null ? robot.battery + "%" : "—";
  renderRobotCard(robot || { name: "Chami", status: "offline", battery: 0 });
}

function updateDevicesSection(devices) {
  document.getElementById("devices-count").textContent = devices.length || 0;
  renderDevices(devices);
}

function updateAlertsSection(alerts) {
  document.getElementById("alerts-count").textContent = alerts.length || 0;
  renderAlerts(alerts);
}

function updateCareLogsSection(logs) {
  renderCareLogs(logs);
}

// render helpers
function renderRobotCard(robot) {
  const el = document.getElementById("robot-info");
  el.innerHTML = "";
  const title = document.createElement("div");
  title.innerHTML = `<strong>${robot?.name || "Chami"}</strong> — <span class="${robot?.status === "online" ? "status-normal" : "status-warning"}">${robot?.status || "offline"}</span>`;
  const batt = document.createElement("div");
  batt.innerHTML = `<div>Battery: ${robot?.battery || 0}%</div><progress value="${robot?.battery || 0}" max="100"></progress>`;
  el.appendChild(title);
  el.appendChild(batt);
}

function renderDevices(devices) {
  const wrap = document.getElementById("devices-list");
  wrap.innerHTML = "";
  devices.forEach((d) => {
    const item = document.createElement("div");
    item.className = "device-item";
    item.innerHTML = `<strong>${d.name}</strong> <small>(${d.room || ""})</small> — <span>${d.status || ""}</span> <button data-id="${d.id || d.deviceId || ""}" class="toggle">Toggle</button>`;
    wrap.appendChild(item);
  });
  document.querySelectorAll(".device-item .toggle").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      await FirebaseService.createCommand({
        targetType: "device",
        targetId: id,
        command: "toggle",
        status: "pending",
        source: "web_dashboard",
      });
      alert("Command created (demo)");
    };
  });
}

function renderAlerts(alerts) {
  const el = document.getElementById("alerts-list");
  el.innerHTML = "";
  alerts.slice(0, 20).forEach((a) => {
    const row = document.createElement("div");
    row.className = "alert-item";
    const levelClass =
      a.level === "emergency"
        ? "status-emergency"
        : a.level === "warning"
          ? "status-warning"
          : "status-normal";
    row.innerHTML = `<strong class="${levelClass}">${a.type}</strong> — ${a.message} <button class="close">Close</button>`;
    row.querySelector(".close").onclick = () => {
      a.status = "resolved";
      alert("Marked resolved (demo only)");
    };
    el.appendChild(row);
  });
}

function renderCareLogs(logs) {
  const el = document.getElementById("care-logs");
  el.innerHTML = "";
  logs.slice(0, 10).forEach((l) => {
    const r = document.createElement("div");
    r.className = "care-item";
    r.textContent = `${l.type} — ${l.status} — ${l.message || ""}`;
    el.appendChild(r);
  });
}

// Commands UI
function renderCommands(cmds) {
  const el = document.getElementById("commands-list");
  el.innerHTML = "";
  if (!cmds || cmds.length === 0) {
    el.innerHTML = '<div class="care-item">No commands</div>';
    return;
  }
  cmds.forEach((c) => {
    const row = document.createElement("div");
    row.className = "care-item";
    row.innerHTML = `<strong>${c.command}</strong> → ${c.targetId} — <em>${c.status}</em> <button data-id="${c.id}" class="cmd-complete">Mark Done</button>`;
    el.appendChild(row);
  });
  document.querySelectorAll(".cmd-complete").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.dataset.id;
      await FirebaseService.updateCommandStatus(id, "completed");
      alert("Command marked completed (demo)");
    };
  });
}

document
  .getElementById("btn-refresh-commands")
  ?.addEventListener("click", async () => {
    const cmds = await FirebaseService.listCommands();
    renderCommands(cmds);
  });

// bind buttons (demo actions)
document.getElementById("btn-medicine-done").onclick = async () => {
  await FirebaseService.createCareLog({
    userId: "user01",
    type: "medicine",
    status: "done",
    message: "Đã uống thuốc buổi sáng",
    source: "web_dashboard",
  });
};
document.getElementById("btn-medicine-missed").onclick = async () => {
  await FirebaseService.createCareLog({
    userId: "user01",
    type: "medicine",
    status: "missed",
    message: "Chưa uống thuốc",
    source: "web_dashboard",
  });
};
document.getElementById("btn-ate").onclick = async () => {
  await FirebaseService.createCareLog({
    userId: "user01",
    type: "meal",
    status: "done",
    message: "Đã ăn sáng",
    source: "web_dashboard",
  });
};
document.getElementById("btn-no-response").onclick = async () => {
  await FirebaseService.createCareLog({
    userId: "user01",
    type: "response",
    status: "no_response",
    message: "Không phản hồi",
    source: "web_dashboard",
  });
};

document.getElementById("btn-sim-fall").onclick = async () => {
  await FirebaseService.createAlert({
    type: "fall_detected",
    level: "emergency",
    message: "Phát hiện ngã tại phòng khách",
    source: "demo",
  });
};
document.getElementById("btn-sim-robot-offline").onclick = async () => {
  await FirebaseService.createAlert({
    type: "robot_offline",
    level: "warning",
    message: "Robot mất kết nối",
    source: "demo",
  });
};

// Demo mode buttons
document.getElementById("demo-robot-online").onclick = async () => {
  await FirebaseService.setRobot("chami01", {
    status: "online",
    battery: 95,
    lastActive: new Date().toISOString(),
  });
};
document.getElementById("demo-robot-offline").onclick = async () => {
  await FirebaseService.setRobot("chami01", { status: "offline" });
};
document.getElementById("demo-low-battery").onclick = async () => {
  await FirebaseService.setRobot("chami01", { battery: 10 });
};
document.getElementById("demo-fall").onclick = async () => {
  await FirebaseService.createAlert({
    type: "fall_detected",
    level: "emergency",
    message: "Phát hiện ngã (demo)",
    source: "demo",
  });
};
document.getElementById("demo-medicine-done").onclick = async () => {
  await FirebaseService.createCareLog({
    userId: "user01",
    type: "medicine",
    status: "done",
    message: "Đã uống thuốc (demo)",
    source: "demo",
  });
};
document.getElementById("demo-no-response").onclick = async () => {
  await FirebaseService.createCareLog({
    userId: "user01",
    type: "response",
    status: "no_response",
    message: "Không phản hồi (demo)",
    source: "demo",
  });
};
document.getElementById("demo-toggle-light").onclick = async () => {
  await FirebaseService.createCommand({
    targetType: "device",
    targetId: "light01",
    command: "toggle",
    status: "pending",
    source: "demo",
  });
};

// subscribe to realtime updates (works with Firestore or local fallback)
if (typeof FirebaseService.subscribeToRobots === "function") {
  FirebaseService.subscribeToRobots((data) => {
    // robots data may be array (local) or array of docs (firestore)
    const first = Array.isArray(data) ? data[0] : data;
    updateRobotSection(
      first || { name: "Chami", status: "offline", battery: 0 },
    );
  });
}

if (typeof FirebaseService.subscribeToDevices === "function") {
  FirebaseService.subscribeToDevices((data) =>
    updateDevicesSection(data || []),
  );
}

if (typeof FirebaseService.subscribeToAlerts === "function") {
  FirebaseService.subscribeToAlerts((data) => updateAlertsSection(data || []));
}

if (typeof FirebaseService.subscribeToCareLogs === "function") {
  FirebaseService.subscribeToCareLogs((data) =>
    updateCareLogsSection(data || []),
  );
}

if (typeof FirebaseService.subscribeToCommands === "function") {
  FirebaseService.subscribeToCommands((data) => renderCommands(data || []));
}

// initial fetch to populate UI immediately
(async () => {
  const r = await FirebaseService.getRobot("chami01");
  updateRobotSection(r || { name: "Chami", status: "offline", battery: 0 });
  const devices = await FirebaseService.listDevices();
  updateDevicesSection(devices || []);
  const alerts = await FirebaseService.listAlerts();
  updateAlertsSection(alerts || []);
  const logs = await FirebaseService.listCareLogs();
  updateCareLogsSection(logs || []);
})();
