// Basic server test
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/api/test', (req, res) => {
  res.json({ message: 'Server is working!' });
});

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Basic server running on port ${PORT}`);
});

// Keep alive
setInterval(() => {
  console.log('Server still alive');
}, 10000);
