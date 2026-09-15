module.exports = (req, res) => {
  res.status(200).json({
    status: 'ok',
    hasMongoUri: !!process.env.MONGODB_URI,
    nodeVersion: process.version
  });
};
