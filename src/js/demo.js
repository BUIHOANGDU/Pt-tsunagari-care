// Demo helpers to mutate the robot document and create events
async function ensureRobot() {
  const r = await FirebaseService.getRobot("chami01");
  if (!r) {
    await FirebaseService.setRobot("chami01", {
      name: "Chami",
      status: "offline",
      battery: 100,
      lastActive: new Date().toISOString(),
      emotion: "normal",
      firmware: "xiaozhi-based",
    });
  }
}

document.getElementById("demo-robot-online").onclick = async () => {
  await ensureRobot();
  await FirebaseService.setRobot("chami01", {
    status: "online",
    battery: 95,
    lastActive: new Date().toISOString(),
  });
  alert("Simulated robot online");
};

document.getElementById("demo-robot-offline").onclick = async () => {
  await ensureRobot();
  await FirebaseService.setRobot("chami01", { status: "offline" });
  alert("Simulated robot offline");
};

document.getElementById("demo-low-battery").onclick = async () => {
  await ensureRobot();
  await FirebaseService.setRobot("chami01", {
    battery: 10,
    lastActive: new Date().toISOString(),
  });
  alert("Simulated low battery");
};

document.getElementById("demo-fall").onclick = async () => {
  await FirebaseService.createAlert({
    type: "fall_detected",
    level: "emergency",
    message: "Phát hiện ngã (demo)",
    source: "demo",
  });
  alert("Created fall alert");
};

document.getElementById("demo-medicine-done").onclick = async () => {
  await FirebaseService.createCareLog({
    userId: "user01",
    type: "medicine",
    status: "done",
    message: "Đã uống thuốc (demo)",
    source: "demo",
  });
  alert("Created care log");
};

document.getElementById("demo-no-response").onclick = async () => {
  await FirebaseService.createCareLog({
    userId: "user01",
    type: "response",
    status: "no_response",
    message: "Không phản hồi (demo)",
    source: "demo",
  });
  alert("Created care log: no response");
};

document.getElementById("demo-toggle-light").onclick = async () => {
  await FirebaseService.createCommand({
    targetType: "device",
    targetId: "light01",
    command: "turn_on",
    status: "pending",
    source: "demo",
  });
  alert("Created command to toggle light (demo)");
};
