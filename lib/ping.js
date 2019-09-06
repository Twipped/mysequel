
var Promise = require('bluebird');
var deepEqual = require('assert').deepStrictEqual;
var promiseQuery = require('./promise-query');

module.exports = exports = function pingIdleConnections (pool, config) {
	if (!Array.isArray(pool._freeConnections) || !pool._freeConnections.length) return Promise.resolve([]);

	// claim all idle connections from the pool
	var idle = pool._freeConnections;
	pool._freeConnections = [];

	return Promise.map(idle, (connection) =>
		promiseQuery({
			connection,
			sql: config.ping.query,
		}).spread((result) => {
			deepEqual(result.slice(), config.ping.expectedResult, 'Ping operation did not return the expected response.');
		}).then(
			() => {
				connection.release();
				return null;
			},
			(err) => {
				connection.destroy();
				return err;
			}
		)
	// filter out any non-errors to get an idea how many connections were closed
	).then((results) => results.filter(Boolean));
};
