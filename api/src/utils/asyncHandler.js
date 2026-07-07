// Express 4 doesn't forward rejected promises from async handlers to the
// error middleware on its own — wrap handlers so thrown errors reach it.
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
