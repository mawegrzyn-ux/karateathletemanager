require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const routes = require("./routes");
const auth = require("./middleware/auth");

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());
app.use(cookieParser());
app.use(auth);

app.use("/api", routes);

app.use((req, res) => {
  res.status(404).json({ error: { message: "Not found" } });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: { message: "Internal server error" } });
});

app.listen(port, () => {
  console.log(`nadakarate-api listening on port ${port}`);
});
