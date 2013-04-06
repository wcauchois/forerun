
function ApiError(code, type, message) {
  this.code = code || 500;
  this.type = type || 'unknown';
  this.message = message || 'Unknown';
}
ApiError.prototype = new Error();
ApiError.prototype.constructor = ApiError;

ApiError.notFound = function(message) {
  return new ApiError(404, 'not_found', message || 'Not found');
};
ApiError.serverError = function(message) {
  return new ApiError(500, 'server_error', message || 'Internal server error');
};
ApiError.badRequest = function(message) {
  return new ApiError(400, 'bad_request', message || 'Bad request');
};
ApiError.insufficientParams = function(message) {
  return new ApiError(400,
    'insufficient_params', message || 'Insufficient parameters');
};
ApiError.notAuthorized = function(message) {
  return new ApiError(403, 'not_authorized', message || 'Not authorized');
};
ApiError.accessLevelTooLow = function(message) {
  return new ApiError(403,
    'not_authorized', message || 'Requires a higher access level');
};
ApiError.paramError = function(message) {
  return new ApiError(400, 'param_error', message || 'Invalid parameters');
};
ApiError.invalidToken = function(message) {
  return new ApiError(403, 'invalid_token', message || 'Invalid API token');
};
ApiError.authFailed = function(message) {
  return new ApiError(403, 'auth_failed', message || 'Authentication failed');
};
ApiError.loginFailed = function(message) {
  return new ApiError(400, 'login_failed', message || 'Login failed');
};
ApiError.handleTaken = function(message) {
  return new ApiError(400, 'handle_taken', message || 'That handle has been taken');
};

ApiError.wrapSaveError = function(err) {
  if (err.name == 'ValidationError') {
    return paramError('Invalid parameters: ' + Object.keys(err.errors).join(', '));
  } else {
    return internalServerError(err.message);
  }
};

exports.ApiError = ApiError;

