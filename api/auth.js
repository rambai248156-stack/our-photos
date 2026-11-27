const crypto = require('crypto');

module.exports = function handler(req, res) {
  try {
    const privateKey = process.env.IMAGEKIT_PRIVATE_KEY;
    if (!privateKey) {
      return res.status(500).json({ error: 'Vercel Settings mein IMAGEKIT_PRIVATE_KEY missing hai!' });
    }

    const token = crypto.randomBytes(16).toString('hex');
    const expire = Math.floor(Date.now() / 1000) + 2400;
    const signature = crypto
      .createHmac('sha1', privateKey)
      .update(token + expire)
      .digest('hex');

    return res.status(200).json({ token, expire, signature });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
