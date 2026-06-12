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
  // Dashboard rendering using FirebaseService (local mock if no Firebase)
  async function renderOverview() {
    const robot = (await FirebaseService.getRobot("chami01")) || { status: "offline", battery: 0 };
    document.getElementById("robot-status-text").textContent = robot.status || "—";
    document.getElementById("robot-battery-text").textContent = (robot.battery != null ? robot.battery + "%" : "—");
    document.getElementById("user-state-text").textContent = "bình thường";

    const alerts = await FirebaseService.listAlerts();
    document.getElementById("alerts-count").textContent = alerts.length || 0;

    const devices = await FirebaseService.listDevices();
    document.getElementById("devices-count").textContent = devices.length || 0;

    renderRobotCard(robot);
    renderDevices(devices);
    renderAlerts(alerts);
    renderCareLogs();
  }

  function renderRobotCard(robot) {
    const el = document.getElementById("robot-info");
    el.innerHTML = "";
    const title = document.createElement("div");
    title.innerHTML = `<strong>${robot.name || "Chami"}</strong> — <span class="${robot.status === "online" ? "status-normal" : "status-warning"}">${robot.status || "offline"}</span>`;
    const batt = document.createElement("div");
    batt.innerHTML = `<div>Battery: ${robot.battery || 0}%</div><progress value="${robot.battery || 0}" max="100"></progress>`;
    el.appendChild(title);
    el.appendChild(batt);
  }

  function renderDevices(devices) {
    const wrap = document.getElementById("devices-list");
    wrap.innerHTML = "";
    devices.forEach((d) => {
      const item = document.createElement("div");
      item.className = "device-item";
      item.innerHTML = `<strong>${d.name}</strong> <small>(${d.room})</small> — <span>${d.status}</span> <button data-id="${d.id}" class="toggle">Toggle</button>`;
      wrap.appendChild(item);
    });
    document.querySelectorAll(".device-item .toggle").forEach((btn) => {
      btn.onclick = async () => {
        const id = btn.dataset.id;
        await FirebaseService.createCommand({ targetType: "device", targetId: id, command: "toggle", status: "pending", source: "web_dashboard" });
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
      const levelClass = a.level === "emergency" ? "status-emergency" : a.level === "warning" ? "status-warning" : "status-normal";
      row.innerHTML = `<strong class="${levelClass}">${a.type}</strong> — ${a.message} <button class="close">Close</button>`;
      row.querySelector(".close").onclick = () => { a.status = "resolved"; alert("Marked resolved (demo only)"); renderOverview(); };
      el.appendChild(row);
    });
  }

  async function renderCareLogs() {
    const logs = (FirebaseService.listCareLogs ? await FirebaseService.listCareLogs() : JSON.parse(localStorage.getItem("mock:care_logs") || "[]"));
    const el = document.getElementById("care-logs");
    el.innerHTML = "";
    logs.slice(0, 10).forEach((l) => {
      const r = document.createElement("div");
      r.className = "care-item";
      r.textContent = `${l.type} — ${l.status} — ${l.message || ""}`;
      el.appendChild(r);
    });
  }

  // bind health buttons
  document.getElementById("btn-medicine-done").onclick = async () => { await FirebaseService.createCareLog({ userId: "user01", type: "medicine", status: "done", message: "Đã uống thuốc buổi sáng", source: "web_dashboard" }); renderOverview(); };
  document.getElementById("btn-medicine-missed").onclick = async () => { await FirebaseService.createCareLog({ userId: "user01", type: "medicine", status: "missed", message: "Chưa uống thuốc", source: "web_dashboard" }); renderOverview(); };
  document.getElementById("btn-ate").onclick = async () => { await FirebaseService.createCareLog({ userId: "user01", type: "meal", status: "done", message: "Đã ăn sáng", source: "web_dashboard" }); renderOverview(); };
  document.getElementById("btn-no-response").onclick = async () => { await FirebaseService.createCareLog({ userId: "user01", type: "response", status: "no_response", message: "Không phản hồi", source: "web_dashboard" }); renderOverview(); };

  // alert simulators
  document.getElementById("btn-sim-fall").onclick = async () => { await FirebaseService.createAlert({ type: "fall_detected", level: "emergency", message: "Phát hiện ngã tại phòng khách", source: "demo" }); renderOverview(); };
  document.getElementById("btn-sim-robot-offline").onclick = async () => { await FirebaseService.createAlert({ type: "robot_offline", level: "warning", message: "Robot mất kết nối", source: "demo" }); renderOverview(); };

  // initial render and periodic refresh
  FirebaseService.seedMockData && FirebaseService.seedMockData();
  renderOverview();
  setInterval(renderOverview, 5000);
