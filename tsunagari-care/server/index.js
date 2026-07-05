const express = require("express");
const cors = require("cors");
require("dotenv").config();

const healthRouter = require("./routes/health");
const debugRouter = require("./routes/debug");
const chamiRouter = require("./routes/chami");
const smartHomeRouter = require("./routes/smartHome");
const robotRouter = require("./routes/robot");

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    service: "tsunagari-care-server",
    time: new Date().toISOString(),
  });
});

app.use("/api/health", healthRouter);
app.use("/api/debug", debugRouter);
app.use("/api/chami", chamiRouter);
app.use("/api/smart-home", smartHomeRouter);
app.use("/api/robot", robotRouter);

app.listen(port, () => {
  console.log(`Tsunagari Bridge API running on port ${port}`);
});