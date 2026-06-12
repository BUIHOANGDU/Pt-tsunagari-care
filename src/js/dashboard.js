async function refreshOverview() {
  const robot = await FirebaseService.getRobot("chami01");
  const rText = robot ? robot.status : "offline";
  document.getElementById("robot-status-text").textContent = rText;
  document.getElementById("robot-battery-text").textContent = robot
    ? robot.battery || 0
    : "—";
  document.getElementById("robot-lastActive").textContent = robot
    ? robot.lastActive || "—"
    : "—";
  document.getElementById("user-state-text").textContent = "bình thường";
  const devices = await FirebaseService.listDevices();
  const devicesList = document.getElementById("devices-list");
  devicesList.innerHTML = "";
  devices.forEach((d) => {
    const el = document.createElement("div");
    el.className = "device-item";
    el.innerHTML = `<strong>${d.name}</strong> — ${d.type} — <span>${d.status}</span> <button data-id="${d.id}" class="toggle">Toggle</button>`;
    devicesList.appendChild(el);
  });

  bindDeviceToggle();
  refreshAlerts();
}

function bindDeviceToggle() {
  document.querySelectorAll(".toggle").forEach((btn) => {
    btn.onclick = async () => {
      const id = btn.getAttribute("data-id");
      await FirebaseService.createCommand({
        targetType: "device",
        targetId: id,
        command: "toggle",
        status: "pending",
        createdAt: new Date().toISOString(),
        source: "web_dashboard",
      });
      alert("Command created (demo)");
    };
  });
}

async function refreshAlerts() {
  const alerts = await FirebaseService.listAlerts();
  const el = document.getElementById("alerts-list");
  el.innerHTML = "";
  alerts.slice(0, 10).forEach((a) => {
    const row = document.createElement("div");
    row.className = "alert-item";
    row.innerHTML = `<strong class="${a.level === "emergency" ? "status-emergency" : a.level === "warning" ? "status-warning" : "status-normal"}">${a.type}</strong> — ${a.message} <button class="close">Close</button>`;
    row.querySelector(".close").onclick = () => {
      a.status = "resolved";
      alert("Marked resolved (demo local only)");
    };
    el.appendChild(row);
  });
  document.getElementById("alerts-count").textContent = alerts.length;
}

// bind demo buttons for health
document.getElementById("btn-medicine-done").onclick = () =>
  FirebaseService.createCareLog({
    userId: "user01",
    type: "medicine",
    status: "done",
    message: "Đã uống thuốc buổi sáng",
    source: "web_dashboard",
  });
document.getElementById("btn-medicine-missed").onclick = () =>
  FirebaseService.createCareLog({
    userId: "user01",
    type: "medicine",
    status: "missed",
    message: "Chưa uống thuốc",
    source: "web_dashboard",
  });
document.getElementById("btn-ate").onclick = () =>
  FirebaseService.createCareLog({
    userId: "user01",
    type: "meal",
    status: "done",
    message: "Đã ăn sáng",
    source: "web_dashboard",
  });
document.getElementById("btn-no-response").onclick = () =>
  FirebaseService.createCareLog({
    userId: "user01",
    type: "response",
    status: "no_response",
    message: "Không phản hồi",
    source: "web_dashboard",
  });

// simulate buttons in alerts
document.getElementById("btn-sim-fall").onclick = () =>
  FirebaseService.createAlert({
    type: "fall_detected",
    level: "emergency",
    message: "Phát hiện ngã tại phòng khách",
    source: "demo",
  });
document.getElementById("btn-sim-robot-offline").onclick = () =>
  FirebaseService.createAlert({
    type: "robot_offline",
    level: "warning",
    message: "Robot mất kết nối",
    source: "demo",
  });

// initial load
refreshOverview();
