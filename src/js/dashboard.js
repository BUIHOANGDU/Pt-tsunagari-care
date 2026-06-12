// Dashboard (mock-first; subscribes to realtime if Firestore configured)
FirebaseService.seedMockData && FirebaseService.seedMockData();

function updateRobotSection(robot) {
  // Update overview cards
  document.getElementById("robot-status-text").textContent =
    robot?.status || "offline";
  document.getElementById("robot-battery-text").textContent =
    robot?.battery != null ? robot.battery + "%" : "—";

  // Update robot profile display
  const batteryDisplay = document.getElementById("robot-battery-display");
  const statusDisplay = document.getElementById("robot-status-display");
  if (batteryDisplay)
    batteryDisplay.textContent =
      robot?.battery != null ? robot.battery + "%" : "—%";
  if (statusDisplay) statusDisplay.textContent = robot?.status || "offline";
}

function updateDevicesSection(devices) {
  document.getElementById("devices-count").textContent = devices.length || 0;
  const devicesDisplay = document.getElementById("devices-display");
  if (devicesDisplay) devicesDisplay.textContent = devices.length || 0;
  renderDevices(devices);
}

function updateAlertsSection(alerts) {
  document.getElementById("alerts-count").textContent = alerts.length || 0;
  renderAlerts(alerts);
}

function updateCareLogsSection(logs) {
  renderCareLogs(logs);
}

// Render helpers
function renderDevices(devices) {
  const wrap = document.getElementById("devices-list");
  wrap.innerHTML = "";
  devices.forEach((d) => {
    const item = document.createElement("div");
    item.className = "device-item";
    const leftDiv = document.createElement("div");
    leftDiv.className = "left";
    leftDiv.innerHTML = `<strong>${d.name}</strong><small>${d.room || ""}</small>`;

    const btn = document.createElement("button");
    btn.className = "device-toggle";
    btn.dataset.id = d.id || d.deviceId || "";
    btn.textContent = (d.status === "on" ? "✓ " : "") + "Toggle";
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

    item.appendChild(leftDiv);
    item.appendChild(btn);
    wrap.appendChild(item);
  });
}

function renderAlerts(alerts) {
  const el = document.getElementById("alerts-list");
  el.innerHTML = "";
  if (!alerts || alerts.length === 0) {
    el.innerHTML =
      '<div style="padding: 12px; color: #6b7280; text-align: center; font-size: 0.9rem;">No alerts</div>';
    return;
  }
  alerts.slice(0, 8).forEach((a) => {
    const row = document.createElement("div");
    row.className = "alert-item";
    row.innerHTML = `
      <div class="left">
        <strong>${a.type}</strong>
        <small>${a.message || ""}</small>
      </div>
    `;
    el.appendChild(row);
  });
}

function renderCareLogs(logs) {
  const el = document.getElementById("care-logs");
  el.innerHTML = "";
  if (!logs || logs.length === 0) {
    el.innerHTML =
      '<div style="padding: 12px; color: #6b7280; text-align: center; font-size: 0.9rem;">No logs</div>';
    return;
  }
  logs.slice(0, 6).forEach((l) => {
    const item = document.createElement("div");
    item.className = "care-item";
    item.innerHTML = `
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <strong>${l.type}</strong>
        <small class="timeline-time">${l.message || l.status}</small>
      </div>
    `;
    el.appendChild(item);
  });
}

// Commands UI
function renderCommands(cmds) {
  const el = document.getElementById("commands-list");
  el.innerHTML = "";
  if (!cmds || cmds.length === 0) {
    el.innerHTML =
      '<div style="padding: 12px; color: #6b7280; text-align: center; font-size: 0.9rem;">No commands</div>';
    return;
  }
  cmds.slice(0, 5).forEach((c) => {
    const row = document.createElement("div");
    row.className = "commands-item";
    const statusClass =
      c.status === "completed"
        ? "cmd-completed"
        : c.status === "failed"
          ? "cmd-failed"
          : "cmd-pending";
    row.innerHTML = `
      <div>
        <strong>${c.command}</strong>
        <small>${c.targetId || ""}</small>
      </div>
      <span class="cmd-status ${statusClass}">${c.status || "pending"}</span>
    `;
    el.appendChild(row);
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
